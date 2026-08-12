#!/usr/bin/env node
import { Command } from "commander";
import {
  fetchJson,
  checkArrray,
  loadYml,
  cleanManifest,
  clearOrCreateOutputDir,
  fetchOclcMetadataWithCache,
  parseMetadata,
  getLabel,
  saveYml,
} from "./src/shared.ts";
import { processOclcMetadata } from "./src/oclc.ts";
import { IIIFBuilder } from "@iiif/builder";
import {
  closeLog,
  date,
  hasLog,
  setLogEnabled,
} from "./src/log.ts";
import { dlcsQueryBase, outputDirBase } from "./src/settings.ts";
import { access, writeFile } from "node:fs/promises";
import { basename, extname } from "node:path";

import type {
  InternationalString,
  Manifest,
  MetadataItem,
} from "@iiif/presentation-3";

type CacheOptions = {
  read: boolean;
  write: boolean;
};

type RunOptions = {
  cache: CacheOptions;
  dryRun: boolean;
  useGuidFilenames: boolean;
  useOutputFolder: boolean;
};

type CliOptions = {
  cache: boolean;
  dryRun?: boolean;
  useGuidFilenames?: boolean;
  useOutputFolder?: boolean;
};

type RunStats = {
  items: number;
  processed: number;
  created: number;
  overwritten: number;
  wouldCreate: number;
  wouldOverwrite: number;
  skipped: number;
  errors: number;
};

function emptyStats(): RunStats {
  return {
    items: 0,
    processed: 0,
    created: 0,
    overwritten: 0,
    wouldCreate: 0,
    wouldOverwrite: 0,
    skipped: 0,
    errors: 0,
  };
}

function addStats(total: RunStats, next: RunStats) {
  total.items += next.items;
  total.processed += next.processed;
  total.created += next.created;
  total.overwritten += next.overwritten;
  total.wouldCreate += next.wouldCreate;
  total.wouldOverwrite += next.wouldOverwrite;
  total.skipped += next.skipped;
  total.errors += next.errors;
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function getProcessArgv() {
  const [runtime, script, ...args] = process.argv;
  return [runtime, script, ...args.filter((arg) => arg !== "--")];
}

async function fileExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function slugify(value: string) {
  return value.toLowerCase().replaceAll(" ", "-");
}

function getOutputFilename(
  shelfNumber: string | undefined,
  parsedOclcNumbers: number[] | undefined,
  guid: string | undefined,
  useGuidFilenames: boolean,
) {
  if (useGuidFilenames) {
    return guid;
  }

  if (shelfNumber === "Tresorleeszaal" && parsedOclcNumbers) {
    return `${slugify(shelfNumber)}-${parsedOclcNumbers[0]}`;
  }

  if (shelfNumber) {
    return slugify(shelfNumber);
  }

  return guid;
}

function getOutputDirectoryName(
  collection: Awaited<ReturnType<typeof loadYml>>["collection"],
  useOutputFolder: boolean,
  inputPath: string,
) {
  if (useOutputFolder) {
    const output = collection.output?.trim();
    if (output) return output;

    return basename(inputPath, extname(inputPath));
  }

  const guid = collection.guid?.trim();
  if (!guid) throw new Error("Collection GUID missing!");
  return guid;
}

async function processInputFile(inputPath: string, options: RunOptions) {
  const mapping = await loadYml(inputPath);
  const stats = emptyStats();
  stats.items = mapping.items.length;

  // For parsing IIIF Manifests and converting to version 3
  const builder = new IIIFBuilder();
  const vault = builder.vault;

  // Create output directory
  const outputDir = getOutputDirectoryName(
    mapping.collection,
    options.useOutputFolder,
    inputPath,
  );

  const outputPath = `${outputDirBase}/${outputDir}`;
  console.log(`Output folder: ${outputPath}`);
  if (options.dryRun) {
    console.log(`[dry-run] Would clear or create ${outputPath}`);
  } else {
    await clearOrCreateOutputDir(outputPath);
  }

  for (const item of mapping.items) {
    const {
      tresor: shelfNumber,
      dlcs,
      oclc: oclcNumbers,
      guid,
      metadata: metadataValues,
    } = item;
    if (dlcs || dlcs === 0) {
      try {
        const manifestId = dlcsQueryBase + dlcs;
        const skeletonManifest = (await fetchJson(manifestId)) as Manifest;
        cleanManifest(skeletonManifest);
        vault.load(manifestId, skeletonManifest);

        let metadata: MetadataItem[] | undefined = undefined;
        let label: InternationalString | undefined = undefined;
        let parsedOclcNumbers: number[] | undefined = undefined;
        if (oclcNumbers && shelfNumber) {
          parsedOclcNumbers = checkArrray(oclcNumbers);
          const oclcResponses: Parameters<typeof processOclcMetadata>[0] = [];
          for (const number of parsedOclcNumbers) {
            const resp = await fetchOclcMetadataWithCache(number, options.cache);
            oclcResponses.push(resp);
          }
          metadata = processOclcMetadata(oclcResponses, shelfNumber);
          label = getLabel(metadata);
        } else if (metadataValues) {
          metadata = parseMetadata(metadataValues);
          label = getLabel(metadata);
        }
        if (metadata && label) {
          const finalMetadata = metadata;
          const finalLabel = label;
          // Set label and metadata
          const normalizedManifest = builder.editManifest(
            manifestId,
            (manifest) => {
              manifest.setLabel(finalLabel);
              manifest.setMetadata(finalMetadata);
            },
          );
          const outputManifest = vault.toPresentation3(normalizedManifest);
          const filename = getOutputFilename(
            shelfNumber,
            parsedOclcNumbers,
            guid,
            options.useGuidFilenames,
          );
          if (!filename) throw new Error("Item GUID missing!");
          const manifestOutputPath = `${outputPath}/${filename}.json`;
          const exists = await fileExists(manifestOutputPath);

          stats.processed++;
          if (options.dryRun) {
            if (exists) {
              stats.wouldOverwrite++;
            } else {
              stats.wouldCreate++;
            }
            console.log(
              `[dry-run] Would ${exists ? "overwrite" : "create"} ${manifestOutputPath}`,
            );
          } else {
            await writeFile(
              manifestOutputPath,
              JSON.stringify(outputManifest, null, 4),
            );
            if (exists) {
              stats.overwritten++;
              console.log(`Existing file ${filename}.json was overwritten`);
            } else {
              stats.created++;
              console.log(`File ${filename}.json has been created successfully`);
            }
          }
        } else {
          stats.skipped++;
          console.log("No label or metadata found");
        }
      } catch (err) {
        stats.errors++;
        console.error("Error:", item, formatError(err));
      }
    } else {
      stats.skipped++;
      console.log("No DLCS string found");
    }
  }

  const collectionLabel = mapping.collection.label;
  if (collectionLabel) {
    const collectionOutputPath = `${outputPath}/_collection.yml`;
    if (options.dryRun) {
      console.log(`[dry-run] Would write ${collectionOutputPath}`);
    } else {
      await saveYml(collectionOutputPath, {
        label: collectionLabel,
        summary: mapping.collection.summary,
      });
    }
  }

  console.log(
    `Done ${inputPath}: ${stats.items} items, ${stats.processed} manifests processed, ${stats.skipped} skipped, ${stats.errors} errors.`,
  );

  return stats;
}

const program = new Command();

program
  .name("iiif-workbench")
  .description("Generate IIIF manifests from DLCS skeletons and YAML/OCLC metadata.")
  .argument("<files...>", "input YAML file(s) to process")
  .option("--no-cache", "disable OCLC cache reads and writes")
  .option(
    "--dry-run",
    "fetch and process records without clearing output or writing files/cache",
  )
  .option(
    "--use-output-folder",
    "use collection.output instead of collection.guid for the output folder",
  )
  .option(
    "--use-guid-filenames",
    "use item GUIDs for manifest filenames instead of shelf-number filenames",
  )
  .showHelpAfterError()
  .action(async (files: string[], cliOptions: CliOptions) => {
    const dryRun = Boolean(cliOptions.dryRun);
    setLogEnabled(!dryRun);

    const options: RunOptions = {
      cache: {
        read: cliOptions.cache,
        write: cliOptions.cache && !dryRun,
      },
      dryRun,
      useGuidFilenames: Boolean(cliOptions.useGuidFilenames),
      useOutputFolder: Boolean(cliOptions.useOutputFolder),
    };

    const total = emptyStats();

    try {
      for (const file of files) {
        try {
          const stats = await processInputFile(file, options);
          addStats(total, stats);
        } catch (err) {
          total.errors++;
          console.error(`Error processing ${file}: ${formatError(err)}`);
        }
      }
    } finally {
      await closeLog();
    }

    console.log(
      `Finished ${files.length} input file(s): ${total.processed} manifests processed, ${total.created} created, ${total.overwritten} overwritten, ${total.wouldCreate} would be created, ${total.wouldOverwrite} would be overwritten, ${total.skipped} skipped, ${total.errors} errors.`,
    );

    if (hasLog()) {
      console.log(`Log: ${date}.txt`);
    }

    if (total.errors > 0) {
      process.exitCode = 1;
    }
  });

await program.parseAsync(getProcessArgv());

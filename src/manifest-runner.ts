import { IIIFBuilder } from "@iiif/builder";
import { access, writeFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import {
  fetchJson,
  cleanManifest,
  clearOrCreateOutputDir,
  fetchOclcMetadataWithCache,
  saveYaml,
} from "./shared.ts";
import {
  buildManualMetadataValues,
  buildMetadataItems,
  getTitleMetadataValue,
  toInternationalString,
} from "./metadata.ts";
import { loadYaml } from "./input.ts";
import { buildOclcMetadataValues } from "./oclc.ts";
import { dlcsQueryBase, outputDirBase } from "./settings.ts";

import type {
  InternationalString,
  Manifest,
  MetadataItem,
} from "@iiif/presentation-3";
import type { InputConfig } from "./input.ts";
import type { MetadataValueMap } from "./metadata.ts";

export type CacheOptions = {
  read: boolean;
  write: boolean;
};

export type RunOptions = {
  cache: CacheOptions;
  dryRun: boolean;
  useGuidFilenames: boolean;
  useOutputFolder: boolean;
};

export type RunStats = {
  items: number;
  processed: number;
  created: number;
  overwritten: number;
  wouldCreate: number;
  wouldOverwrite: number;
  skipped: number;
  skippedByConfig: number;
  errors: number;
};

export function emptyStats(): RunStats {
  return {
    items: 0,
    processed: 0,
    created: 0,
    overwritten: 0,
    wouldCreate: 0,
    wouldOverwrite: 0,
    skipped: 0,
    skippedByConfig: 0,
    errors: 0,
  };
}

export function addStats(total: RunStats, next: RunStats) {
  total.items += next.items;
  total.processed += next.processed;
  total.created += next.created;
  total.overwritten += next.overwritten;
  total.wouldCreate += next.wouldCreate;
  total.wouldOverwrite += next.wouldOverwrite;
  total.skipped += next.skipped;
  total.skippedByConfig += next.skippedByConfig;
  total.errors += next.errors;
}

export function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
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
  oclcNumbers: number[] | undefined,
  guid: string | undefined,
  useGuidFilenames: boolean,
) {
  if (useGuidFilenames) {
    return guid;
  }

  if (shelfNumber === "Tresorleeszaal" && oclcNumbers) {
    return `${slugify(shelfNumber)}-${oclcNumbers[0]}`;
  }

  if (shelfNumber) {
    return slugify(shelfNumber);
  }

  return guid;
}

function getOutputDirectoryName(
  collection: InputConfig["collection"],
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

function describeItem(item: InputConfig["items"][number]) {
  if (item.tresor) return item.tresor;
  if (item.dlcs || item.dlcs === 0) return String(item.dlcs);
  if (item.guid) return item.guid;
  return "unknown item";
}

function formatComment(comment: InputConfig["items"][number]["comment"]) {
  if (!comment) {
    return "";
  }

  return `: ${Array.isArray(comment) ? comment.join("; ") : comment}`;
}

export async function generateManifestsForInputFile(
  inputPath: string,
  options: RunOptions,
) {
  const inputConfig = await loadYaml(inputPath);
  const stats = emptyStats();
  stats.items = inputConfig.items.length;

  // For parsing IIIF Manifests and converting to version 3.
  const builder = new IIIFBuilder();
  const vault = builder.vault;

  const outputDirectoryName = getOutputDirectoryName(
    inputConfig.collection,
    options.useOutputFolder,
    inputPath,
  );

  const outputDirectoryPath = `${outputDirBase}/${outputDirectoryName}`;
  console.log(`Output folder: ${outputDirectoryPath}`);
  if (options.dryRun) {
    console.log(`[dry-run] Would clear or create ${outputDirectoryPath}`);
  } else {
    await clearOrCreateOutputDir(outputDirectoryPath);
  }

  for (const item of inputConfig.items) {
    const {
      tresor: shelfNumber,
      dlcs,
      oclc: oclcNumbers,
      guid,
      label: itemLabel,
      metadata: metadataValues,
      skipMetadata,
    } = item;
    if (item.skip) {
      stats.skipped++;
      stats.skippedByConfig++;
      console.log(
        `Skipped ${describeItem(item)} because skip is true${formatComment(item.comment)}`,
      );
      continue;
    }

    if (dlcs || dlcs === 0) {
      try {
        const manifestId = dlcsQueryBase + dlcs;
        const skeletonManifest = (await fetchJson(manifestId)) as Manifest;
        cleanManifest(skeletonManifest);
        vault.load(manifestId, skeletonManifest);

        let metadata: MetadataItem[] | undefined = undefined;
        let label: InternationalString | undefined = undefined;
        let oclcNumbersForFilename: number[] | undefined = undefined;
        let metadataValuesBySlug: MetadataValueMap = {};
        if (oclcNumbers && shelfNumber) {
          oclcNumbersForFilename = oclcNumbers;
          const oclcResponses: Parameters<
            typeof buildOclcMetadataValues
          >[0] = [];
          for (const number of oclcNumbersForFilename) {
            const response = await fetchOclcMetadataWithCache(
              number,
              options.cache,
            );
            oclcResponses.push(response);
          }
          metadataValuesBySlug = buildOclcMetadataValues(
            oclcResponses,
            shelfNumber,
            {
              skipMetadata,
            },
          );
        }
        if (metadataValues) {
          metadataValuesBySlug = {
            ...metadataValuesBySlug,
            ...buildManualMetadataValues(metadataValues),
          };
        }
        metadata = buildMetadataItems(metadataValuesBySlug);
        if (metadata.length) {
          label = itemLabel
            ? toInternationalString(itemLabel)
            : getTitleMetadataValue(metadataValuesBySlug);
        }
        if (metadata.length && label) {
          const finalMetadata = metadata;
          const finalLabel = label;
          const normalizedManifest = builder.editManifest(
            manifestId,
            (manifest) => {
              manifest.setLabel(finalLabel);
              manifest.setMetadata(finalMetadata);
            },
          );
          const outputManifest = vault.toPresentation3(normalizedManifest);
          const manifestFilename = getOutputFilename(
            shelfNumber,
            oclcNumbersForFilename,
            guid,
            options.useGuidFilenames,
          );
          if (!manifestFilename) throw new Error("Item GUID missing!");
          const manifestOutputPath =
            `${outputDirectoryPath}/${manifestFilename}.json`;
          const manifestExists = await fileExists(manifestOutputPath);

          stats.processed++;
          if (options.dryRun) {
            if (manifestExists) {
              stats.wouldOverwrite++;
            } else {
              stats.wouldCreate++;
            }
            console.log(
              `[dry-run] Would ${manifestExists ? "overwrite" : "create"} ${manifestOutputPath}`,
            );
          } else {
            await writeFile(
              manifestOutputPath,
              JSON.stringify(outputManifest, null, 4),
            );
            if (manifestExists) {
              stats.overwritten++;
              console.log(
                `Existing file ${manifestFilename}.json was overwritten`,
              );
            } else {
              stats.created++;
              console.log(
                `File ${manifestFilename}.json has been created successfully`,
              );
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

  const collectionLabel = inputConfig.collection.label;
  if (collectionLabel) {
    const collectionOutputPath = `${outputDirectoryPath}/_collection.yml`;
    if (options.dryRun) {
      console.log(`[dry-run] Would write ${collectionOutputPath}`);
    } else {
      await saveYaml(collectionOutputPath, {
        label: collectionLabel,
        summary: inputConfig.collection.summary,
      });
    }
  }

  console.log(
    `Done ${inputPath}: ${stats.items} items, ${stats.processed} manifests processed, ${stats.skipped} skipped (${stats.skippedByConfig} by config), ${stats.errors} errors.`,
  );

  return stats;
}

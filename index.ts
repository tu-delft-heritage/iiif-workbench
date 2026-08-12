import {
  fetchJson,
  checkArrray,
  selectFile,
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
import { closeLog, date } from "./src/log.ts";
import { dlcsQueryBase, outputDirBase } from "./src/settings.ts";
import { access, writeFile } from "node:fs/promises";

import type {
  InternationalString,
  Manifest,
  MetadataItem,
} from "@iiif/presentation-3";

const inputPath = await selectFile("input/*.yml");
const mapping = await loadYml(inputPath);

// For parsing IIIF Manifests and converting to version 3
const builder = new IIIFBuilder();
const vault = builder.vault;

// Create output directory
const outputDir = mapping.collection.guid;
if (!outputDir) throw new Error("Collection GUID missing!");

await clearOrCreateOutputDir(`${outputDirBase}/${outputDir}`);

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

async function writeManifests() {
  for (const item of mapping.items) {
    const {
      tresor: shelfNumber,
      dlcs,
      oclc: oclcNumbers,
      guid,
      metadata: metadataValues,
    } = item;
    if (dlcs) {
      try {
        // Fetch skeleton manifest from DLCS and OCLC responses
        // For promises: https://gist.github.com/bschwartz757/5d1ff425767fdc6baedb4e5d5a5135c8
        const manifestId = dlcsQueryBase + dlcs;
        const skeletonManifest = (await fetchJson(manifestId)) as Manifest;
        cleanManifest(skeletonManifest);
        vault.load(manifestId, skeletonManifest);

        let metadata: MetadataItem[] | undefined = undefined;
        let label: InternationalString | undefined = undefined;
        let parsedOclcNumbers: number[] | undefined = undefined;
        if (oclcNumbers && shelfNumber) {
          parsedOclcNumbers = checkArrray(oclcNumbers);
          const oclcResponses = [];
          for (const number of parsedOclcNumbers) {
            const resp = await fetchOclcMetadataWithCache(number);
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
          const filename =
            shelfNumber === "Tresorleeszaal" && parsedOclcNumbers
              ? `${slugify(shelfNumber)}-${parsedOclcNumbers[0]}`
              : shelfNumber
                ? slugify(shelfNumber)
                : guid;
          if (!filename) throw new Error("Item GUID missing!");
          const outputPath = `${outputDirBase}/${outputDir}/${filename}.json`;
          const exists = await fileExists(outputPath);
          await writeFile(
            outputPath,
            JSON.stringify(outputManifest, null, 4),
          );
          // Console output
          if (exists) {
            console.log(`Existing file ${filename}.json was overwritten`);
          } else {
            console.log(`File ${filename}.json has been created successfully`);
          }
        } else {
          console.log("No label or metadata found");
        }
      } catch (err) {
        console.log("Error:\n", item, err);
      }
    } else {
      console.log("No DLCS string found");
    }
  }
}

await writeManifests();

// Write collection yml
const collectionLabel = mapping.collection.label;
if (collectionLabel) {
  await saveYml(`${outputDirBase}/${outputDir}/_collection.yml`, {
    label: collectionLabel,
    summary: mapping.collection.summary,
  });
}

await closeLog();

console.log(`Done. ${mapping.items.length} files written.`);
console.log(`Log: ${date}.txt`);

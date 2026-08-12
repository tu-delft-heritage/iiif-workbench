import {
  sleep,
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
import { date, writer } from "./src/log.ts";
import { dlcsQueryBase, outputDirBase } from "./src/settings.ts";

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

clearOrCreateOutputDir(`${outputDirBase}/${outputDir}`);

async function writeManifests() {
  for (let item of mapping.items) {
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
        let parsedOclcNumbers: number[] | undefined = undefined
        if (oclcNumbers && shelfNumber) {
          parsedOclcNumbers = checkArrray(oclcNumbers) as number[];
          const oclcResponses = new Array();
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
          // Set label and metadata
          const normalizedManifest = builder.editManifest(
            manifestId,
            (manifest) => {
              manifest.setLabel(label);
              manifest.setMetadata(metadata);
            },
          );
          const outputManifest = vault.toPresentation3(normalizedManifest);
          const filename =
            shelfNumber === "Tresorleeszaal" && parsedOclcNumbers
              ? shelfNumber.toLowerCase().replaceAll(" ", "-") +
                "-" +
                parsedOclcNumbers[0]
              : shelfNumber?.toLowerCase().replaceAll(" ", "-");
          // const filename = guid;
          if (!filename) throw new Error("Item GUID missing!");
          const exists = await Bun.file(
            `${outputDirBase}/${outputDir}/${filename}.json`,
          ).exists();
          await Bun.write(
            `${outputDirBase}/${outputDir}/${filename}.json`,
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

writer.flush();
writer.end();

console.log(`Done. ${mapping.items.length} files written.`);
console.log(`Log: ${date}.txt`);

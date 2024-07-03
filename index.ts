import { Glob } from "bun";
import { createSelection } from "bun-promptx";
import yaml from "js-yaml";
import { sleep, fetchJson } from "./src/utils.ts";
import { fetchOclcMetadata, processOclcMetadata } from "./src/oclc.ts";
import { Vault as IIIFVault } from "@iiif/helpers";
import type { Manifest, Service } from "@iiif/presentation-3";
import { date, writer } from "./src/log.ts";

// Listing files in input folder
const inputGlob = new Glob("input/*.yml");

const inputFiles = new Array();

for await (const file of inputGlob.scan(".")) {
  inputFiles.push({ text: file.split("/")[1] });
}

if (inputFiles.length === 0) {
  throw new Error("No input files found");
}

// Prompt user for file
const result = createSelection(inputFiles, {
  headerText: "Select input file: ",
  perPage: 10,
});

// Load and parse selected yaml file containing mapping and metadata
const filename = inputFiles[result.selectedIndex].text;
const file = await Bun.file("./input/" + filename).text();
const mapping = yaml.load(file);
writer.write(`Selected input file: ${filename}\n`);

// For parsing IIIF Manifests and converting to version 3
const vault = new IIIFVault();

// Base urls
const dlcsApiBase = `https://dlc.services/iiif-resource/v3/7/string1string2string3/`;

// Load cache
const glob = new Glob("*.json");
const cache = new Array();
for await (const file of glob.scan("./.cache")) {
  cache.push(file.split(".")[0]);
}

// https://bun.sh/docs/api/file-io
async function writeManifests() {
  for (let item of mapping.items) {
    const shelfNumber: string = item.tresor;
    const dlcs: string = item.dlcs;
    const oclcNumbers: number[] = item.oclc;
    if (shelfNumber && dlcs && oclcNumbers) {
      try {
        // Fetch skeleton manifest from DLCS and OCLC responses
        // For promises: https://gist.github.com/bschwartz757/5d1ff425767fdc6baedb4e5d5a5135c8
        // const manifest = await vault.loadManifest(dlcsApiBase + dlcs);
        const manifest = (await fetchJson(dlcsApiBase + dlcs)) as Manifest;
        let metadata = new Array();
        for (const number of oclcNumbers) {
          if (cache.includes(number.toString())) {
            // Get cached json response
            const resp = await Bun.file(
              "./.cache/" + number.toString() + ".json"
            ).json();
            metadata.push(resp);
          } else {
            // Fetch json
            const resp = await fetchOclcMetadata(number);
            if (resp.data) {
              metadata.push(resp.data);
              // Write cache
              await Bun.write(
                `.cache/${number}.json`,
                JSON.stringify(resp.data, null, 4)
              );
            }
            // Optional timeout between fetches
            // await sleep(6000);
          }
        }
        if (manifest && metadata.length) {
          // Set label and metadata
          manifest.label = { none: [metadata[0].title.mainTitles[0].text] };
          manifest.metadata = processOclcMetadata(metadata, shelfNumber);
          // Remove ImageService2
          manifest.thumbnail?.[0].service.shift();
          manifest.items.map((canvas) => {
            canvas?.thumbnail?.[0].service.shift();
            canvas?.items?.[0].items?.[0].body?.service.shift();
            // Remove canvas metadata
            delete canvas.metadata;
          });
          // Write file
          const filename =
            shelfNumber === "Tresorleeszaal"
              ? shelfNumber.toLowerCase().replaceAll(" ", "-") +
                "-" +
                oclcNumbers[0]
              : shelfNumber.toLowerCase().replaceAll(" ", "-");
          const exists = await Bun.file(`output/${filename}.json`).exists();
          await Bun.write(
            `output/${filename}.json`,
            JSON.stringify(manifest, null, 4)
          );
          // Console output
          if (exists) {
            console.log(`Existing file ${filename}.json was overwritten`);
          } else {
            console.log(`File ${filename}.json has been created successfully`);
          }
        }
      } catch (err) {
        console.log("Error: ", shelfNumber, oclcNumbers.join(", "), err);
      }
    }
  }
}

await writeManifests();
writer.flush();
writer.end();

console.log(`Done. ${mapping.items.length} files written.`);
console.log(`Log: ${date}.txt`);

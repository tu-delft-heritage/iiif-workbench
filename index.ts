import { Glob } from "bun";
import { createSelection } from "bun-promptx";
import yaml from "js-yaml";
import { sleep } from "./src/utils.ts";
import { fetchJson } from "./src/utils.ts";
import { formats } from "./src/formats.ts";
import { fetchMetadata } from "./src/oclc.ts";
import { Vault as IIIFVault } from "@iiif/helpers";

// Types
import type { paths } from "./src/types/openapi-schema.ts";

type SuccessResponse =
  paths["/bibs/{oclcNumber}"]["get"]["responses"][200]["content"]["application/json"];

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

// For parsing IIIF Manifests and converting to version 3
const vault = new IIIFVault();

// Log file
const date = new Date().toISOString().slice(0, -5).replaceAll(":", ".");
const log = Bun.file(`logs/${date}-${filename.split(".yml")[0]}.txt`);
const writer = log.writer();

// Base urls
const dlcsApiBase = `https://dlc.services/iiif-resource/7/string1string2string3/`;
const worldCatBase = "https://tudelft.on.worldcat.org/oclc/";

// Load cache
const glob = new Glob("*.json");
const cache = new Array();
for await (const file of glob.scan("./.cache")) {
  cache.push(file.split(".")[0]);
}

function processMetadata(respArray: SuccessResponse[], shelfNumber: string) {
  const oclcNumber = new Array();
  const title = new Array();
  const contributor = new Array();
  const publisher = new Array();
  const year = new Array();
  const description = new Array();
  const notes = new Array();
  const format = new Array();

  if (respArray.length > 1) {
    const urls = respArray.map((i) => worldCatBase + i.identifier?.oclcNumber);
    writer.write(
      `${shelfNumber} heeft meerdere OCLC nummers (${urls.join(", ")})\n`
    );
  }

  for (const resp of respArray) {
    const url = worldCatBase + resp.identifier?.oclcNumber;
    oclcNumber.push(`<a href="${url}">${resp.identifier?.oclcNumber}</a>`);
    if (resp.title?.mainTitles) {
      resp.title.mainTitles.forEach((item) => title.push(item.text));
    }
    // Alternative: resp.contributor.statementOfResponsibility
    if (resp.contributor?.creators) {
      resp.contributor.creators.forEach((item) => {
        let name = null;
        if (item.nonPersonName?.text) {
          name = item.nonPersonName?.text;
        } else if (item.firstName?.text && item.secondName?.text) {
          name = item.firstName?.text + " " + item.secondName?.text;
        } else if (item.firstName?.text) {
          name = item.firstName?.text;
          writer.write(
            `${shelfNumber} heeft een auteur met alleen een voornaam (${url})\n`
          );
        } else if (item.secondName?.text) {
          name = item.secondName?.text;
          writer.write(
            `${shelfNumber} heeft een auteur met alleen een achternaam (${url})\n`
          );
        }
        if (name && item.creatorNotes) {
          name = name.concat(" (", item.creatorNotes.join(", "), ")");
        }
        contributor.push(name);
      });
    } else {
      writer.write(`${shelfNumber} heeft geen auteur (${url})\n`);
    }
    if (resp.publishers) {
      resp.publishers.forEach((item) =>
        publisher.push(item.publisherName?.text + ", " + item.publicationPlace)
      );
    }
    if (resp.date?.publicationDate) {
      const content = resp.date.publicationDate;
      year.push(content);
      if (content.length < 4 || content.includes("?")) {
        writer.write(
          `${shelfNumber} heeft als jaartal "${content}" (${url})\n`
        );
      }
    }
    // Sometimes physicalDescription can be found in bibliographies property
    if (resp.description?.bibliographies) {
      const content = resp.description.bibliographies.map((item) => item.text);
      content.forEach((item) => description.push(item));
      writer.write(
        `${shelfNumber} bevat de volgende informatie onder "Bibliografieën": "${content.join(
          ", "
        )}" (${url})\n`
      );
    } else if (resp.description?.physicalDescription) {
      description.push(resp.description.physicalDescription);
    }
    if (resp.description?.contents) {
      writer.write(`${shelfNumber} bevat informatie onder "Inhoud" (${url})\n`);
    }
    // Contains references to other parts of the same volume
    if (resp.note?.generalNotes) {
      resp.note.generalNotes.forEach((item) => notes.push(item.text));
    }
    if (resp.format?.generalFormat) {
      const betterFormat = formats[resp.format.generalFormat];
      format.push(betterFormat);
    }
  }

  return [
    {
      label: {
        en: ["Title"],
        nl: ["Titel"],
      },
      value: { none: title.length ? title : [""] },
    },
    {
      label: {
        en: contributor.length <= 1 ? ["Contributor"] : ["Contributors"],
        nl: contributor.length <= 1 ? ["Maker"] : ["Makers"],
      },
      value: { none: contributor.length ? [...new Set(contributor)] : [""] },
    },
    {
      label: {
        en: ["Publisher"],
        nl: ["Uitgever"],
      },
      value: { none: publisher.length ? [...new Set(publisher)] : [""] },
    },
    {
      label: {
        en: ["Year"],
        nl: ["Jaar"],
      },
      value: { none: year.length ? [...new Set(year)] : [""] },
    },
    {
      label: {
        en: ["Format"],
        nl: ["Formaat"],
      },
      value: { none: format.length ? [...new Set(format)] : [""] },
    },
    {
      label: {
        en: ["Description"],
        nl: ["Omschrijving"],
      },
      value: { none: description.length ? description : [""] },
    },
    {
      label: {
        en: ["Notes"],
        nl: ["Noot"],
      },
      value: { none: notes.length ? notes : [""] },
    },
    {
      label: {
        en: oclcNumber.length <= 1 ? ["OCLC Number"] : ["OCLC Numbers"],
        nl: oclcNumber.length <= 1 ? ["OCLC nummer"] : ["OCLC nummers"],
      },
      value: { none: oclcNumber.length ? oclcNumber : [""] },
    },
    {
      label: { en: ["Shelf Number"], nl: ["Plaatsnummer"] },
      value: { none: [shelfNumber.replaceAll("-", " ")] },
    },
  ];
}

// https://bun.sh/docs/api/file-io
async function writeManifests() {
  for (let item of mapping) {
    const shelfNumber: string = item.tresor;
    const dlcs: string = item.dlcs;
    const oclcNumbers: number[] = item.oclc;
    if (shelfNumber && dlcs && oclcNumbers) {
      try {
        // Fetch skeleton manifest from DLCS and OCLC responses
        // For promises: https://gist.github.com/bschwartz757/5d1ff425767fdc6baedb4e5d5a5135c8
        const manifest = await vault.loadManifest(dlcsApiBase + dlcs);
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
            const resp = await fetchMetadata(number);
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
          manifest.label = { none: metadata[0].title.mainTitles[0].text };
          manifest.metadata = processMetadata(metadata, shelfNumber);
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
            JSON.stringify(vault.toPresentation3(manifest), null, 4)
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

console.log(`Done. ${mapping.length} files written.`);
console.log(`Log: ${date}-${filename.split(".yml")[0]}.txt`);

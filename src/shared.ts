import { objectLabels } from "./settings.ts";
import { Glob } from "bun";
import { createSelection } from "bun-promptx";
import yaml from "js-yaml";
import { writer } from "./log.ts";
import { readdir, mkdir, rmdir } from "node:fs/promises";
import { fetchOclcMetadata } from "./oclc.ts";

import type { CollectionDescription, MetadataValues } from "./types/types.ts";
import type { Manifest, MetadataItem } from "@iiif/presentation-3";

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchJson(url: string) {
  return fetch(url).then((response) => response.json());
}

export function checkArrray(input: (number | string) | (number | string)[]) {
  if (Array.isArray(input)) {
    return input;
  } else {
    return [input];
  }
}

async function getCache(id: string, type: string) {
  const file = Bun.file(`.cache/${type}/${id}.json`);
  if (await file.exists()) {
    return file.json();
  } else return null;
}

export function saveJson(json: any, filename: string, path: string) {
  return Bun.write(`${path}/${filename}.json`, JSON.stringify(json, null, 4));
}

export async function fetchJsonWithCache(
  id: string,
  url: string,
  type: string,
  useCache: boolean = true
) {
  if (useCache) {
    const cache = await getCache(id, type);
    if (cache) {
      return cache;
    }
  }
  const resp = await fetch(url).then((resp) => resp.json());
  await saveJson(resp, id, `.cache/${type}/`);
  return resp;
}

export async function fetchOclcMetadataWithCache(
  oclcNumber: number,
  useCache: boolean = true
) {
  if (useCache) {
    const cache = await getCache(oclcNumber.toString(), "oclc");
    if (cache) {
      return cache;
    }
  }
  const resp = await fetchOclcMetadata(oclcNumber);
  await saveJson(resp, oclcNumber.toString(), ".cache/oclc/");
  return resp;
}

function getType(value: unknown) {
  if (Array.isArray(value)) {
    return "array";
  } else {
    return typeof value;
  }
}

export function listKeysAndTypes(collection: any[], asTypes: boolean = false) {
  const keys = new Map();
  const totalRecords = collection.length;
  // Get keys and types for keys
  for (const record of collection) {
    const arr = Object.entries(record);
    arr.forEach(([key, value]) => {
      const foundKey = keys.get(key);
      if (foundKey) {
        foundKey.count++;
        foundKey.types.push(getType(value));
      } else {
        keys.set(key, {
          count: 1,
          types: new Array(getType(value)),
        });
      }
    });
  }
  // Check if keys are optional
  for (const [key, value] of keys) {
    value.types = [...new Set(value.types)];
    if (value.count === totalRecords) {
      value.all = true;
    } else value.all = false;
  }
  if (asTypes) {
    // Will not output valid TypeScript but a helpful start!
    return Array.from(
      keys
        .entries()
        .map(
          ([key, value]) =>
            key +
            (value.all ? ": " : "?: ") +
            (value.types[0] === "array" ? "string[]" : value.types[0])
        )
    ).join("\n");
  } else return keys.entries();
}

export async function selectFile(globPattern: string) {
  // Listing files in input folder
  const inputGlob = new Glob(globPattern);
  const inputFiles = new Array();

  for await (const file of inputGlob.scan(".")) {
    inputFiles.push({ text: file.split("/")[1] });
  }

  if (inputFiles.length === 0) {
    throw new Error("No input files found");
  }

  // Prompt user for file
  const { selectedIndex } = createSelection(inputFiles, {
    headerText: "Select input file: ",
    perPage: 10,
  });

  if (selectedIndex === null) throw new Error("Please select an input file");

  const path = globPattern.split("/").slice(0, -1).join("/");
  const filename = inputFiles[selectedIndex].text;
  return path + "/" + filename;
}

export async function loadYml(path: string) {
  const file = await Bun.file(path).text();
  writer.write(`Selected input file: ${path}\n`);
  return yaml.load(file) as CollectionDescription;
}

export async function saveYml(pathWithFilename: string, json: any) {
  const ymlString = yaml.dump(json);
  await Bun.write(pathWithFilename, ymlString);
}

export function cleanManifest(manifest: Manifest) {
  // Remove V2 service
  manifest.thumbnail?.[0].service.shift();
  manifest.items.map((canvas) => {
    // Remove V2 service
    canvas?.thumbnail?.[0].service.shift();
    canvas?.items?.[0].items?.[0].body?.service.shift();
    // Remove canvas metadata
    delete canvas.metadata;
  });
}

export async function clearOrCreateOutputDir(outputDir: string) {
  try {
    await readdir(outputDir);
    await rmdir(outputDir, { recursive: true });
  } catch {}
  await mkdir(outputDir);
}

export function parseMetadata(props: MetadataValues): MetadataItem[] {
  const metadata = new Array();
  for (const [key, label] of Object.entries(objectLabels)) {
    const value = props[key];
    if (value) {
      for (const lang in value) {
        value[lang] = checkArrray(value[lang]).map(String);
      }
      metadata.push({
        label,
        value,
      });
    }
  }
  return metadata;
}

export function getLabel(metadata: MetadataItem[]) {
  return metadata.find(({ label }) => label?.en?.[0] === "Title")?.value;
}

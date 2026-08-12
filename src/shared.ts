import { objectLabels } from "./settings.ts";
import yaml from "js-yaml";
import {
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { fetchOclcMetadata } from "./oclc.ts";

import type { MetadataValues } from "./input.ts";
import type {
  InternationalString,
  Manifest,
  MetadataItem,
} from "@iiif/presentation-3";

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchJson(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Could not fetch ${url}: ${response.status} ${response.statusText}`,
    );
  }
  return response.json();
}

export function checkArrray<T>(input: T | T[]) {
  if (Array.isArray(input)) {
    return input;
  } else {
    return [input];
  }
}

function isNoEntry(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

async function getCache(id: string, type: string) {
  try {
    const file = await readFile(`.cache/${type}/${id}.json`, "utf8");
    return JSON.parse(file) as unknown;
  } catch (error) {
    if (isNoEntry(error)) {
      return null;
    }
    throw error;
  }
}

type CacheOptions = {
  read?: boolean;
  write?: boolean;
};

function normalizeCacheOptions(options: boolean | CacheOptions = true) {
  if (typeof options === "boolean") {
    return {
      read: options,
      write: options,
    };
  }

  return {
    read: options.read ?? true,
    write: options.write ?? true,
  };
}

export async function saveJson(json: unknown, filename: string, path: string) {
  await mkdir(path, { recursive: true });
  return writeFile(`${path}/${filename}.json`, JSON.stringify(json, null, 4));
}

export async function fetchJsonWithCache(
  id: string,
  url: string,
  type: string,
  cacheOptions: boolean | CacheOptions = true,
) {
  const cache = normalizeCacheOptions(cacheOptions);
  if (cache.read) {
    const cached = await getCache(id, type);
    if (cached) {
      return cached;
    }
  }
  const resp = await fetch(url).then((resp) => resp.json());
  if (cache.write) {
    await saveJson(resp, id, `.cache/${type}/`);
  }
  return resp;
}

export async function fetchOclcMetadataWithCache(
  oclcNumber: number,
  cacheOptions: boolean | CacheOptions = true,
) {
  const cache = normalizeCacheOptions(cacheOptions);
  if (cache.read) {
    const cached = await getCache(oclcNumber.toString(), "oclc");
    if (cached) {
      return cached;
    }
  }
  const resp = await fetchOclcMetadata(oclcNumber);
  if (!resp.data) {
    const status = resp.response.status;
    throw new Error(`No OCLC metadata found for ${oclcNumber} (${status})`);
  }
  if (cache.write) {
    await saveJson(resp.data, oclcNumber.toString(), ".cache/oclc/");
  }
  return resp.data;
}

function getType(value: unknown) {
  if (Array.isArray(value)) {
    return "array";
  } else {
    return typeof value;
  }
}

type KeyDescription = {
  count: number;
  types: string[];
  all?: boolean;
};

export function listKeysAndTypes(
  collection: Record<string, unknown>[],
  asTypes: boolean = false,
) {
  const keys = new Map<string, KeyDescription>();
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
    return Array.from(keys.entries())
      .map(
        ([key, value]) =>
          key +
          (value.all ? ": " : "?: ") +
          (value.types[0] === "array" ? "string[]" : value.types[0]),
      )
      .join("\n");
  } else return keys.entries();
}

export async function saveYml(pathWithFilename: string, json: unknown) {
  const ymlString = yaml.dump(json);
  await writeFile(pathWithFilename, ymlString);
}

type ResourceWithService = {
  service?: unknown[];
};

function removeFirstService(resource: unknown) {
  if (!resource || typeof resource !== "object" || !("service" in resource)) {
    return;
  }

  const service = (resource as ResourceWithService).service;
  if (Array.isArray(service)) {
    service.shift();
  }
}

export function cleanManifest(manifest: Manifest) {
  // Remove V2 service
  removeFirstService(manifest.thumbnail?.[0]);
  manifest.items.forEach((canvas) => {
    // Remove V2 service
    removeFirstService(canvas.thumbnail?.[0]);
    const body = canvas.items?.[0]?.items?.[0]?.body;
    if (Array.isArray(body)) {
      body.forEach(removeFirstService);
    } else {
      removeFirstService(body);
    }
    // Remove canvas metadata
    delete canvas.metadata;
  });
}

export async function clearOrCreateOutputDir(outputDir: string) {
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
}

export function parseMetadata(props: MetadataValues): MetadataItem[] {
  const metadata: MetadataItem[] = [];
  for (const [key, label] of Object.entries(objectLabels)) {
    const value = props[key];
    if (value) {
      const parsedValue: InternationalString = {};
      for (const lang in value) {
        parsedValue[lang] = checkArrray(value[lang]).map(String);
      }
      metadata.push({
        label,
        value: parsedValue,
      });
    }
  }
  return metadata;
}

export function getLabel(metadata: MetadataItem[]) {
  return metadata.find(({ label }) => label?.en?.[0] === "Title")?.value;
}

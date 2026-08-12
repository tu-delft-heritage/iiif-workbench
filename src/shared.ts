import {
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { stringify } from "yaml";
import { fetchOclcMetadata } from "./oclc.ts";
import { cacheDir } from "./settings.ts";

import type { Manifest } from "@iiif/presentation-3";

export const cacheTypes = ["dlcs", "oclc"] as const;

export type CacheType = (typeof cacheTypes)[number];

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

function isNoEntry(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function getCacheFilename(id: string) {
  return encodeURIComponent(id);
}

function getCachePath(id: string, type: string) {
  return `${cacheDir}${type}/${getCacheFilename(id)}.json`;
}

function getCacheDirectory(type: CacheType) {
  return `${cacheDir}${type}`;
}

async function getCache(id: string, type: string) {
  try {
    const file = await readFile(getCachePath(id, type), "utf8");
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

async function saveCache(id: string, type: string, json: unknown) {
  await mkdir(`${cacheDir}${type}`, { recursive: true });
  await writeFile(getCachePath(id, type), JSON.stringify(json, null, 4));
}

async function countCacheFiles(path: string): Promise<number> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    const nestedCounts = await Promise.all(
      entries.map((entry) => {
        if (entry.isDirectory()) {
          return countCacheFiles(`${path}/${entry.name}`);
        }
        return Promise.resolve(entry.isFile() ? 1 : 0);
      }),
    );

    return nestedCounts.reduce((total, count) => total + count, 0);
  } catch (error) {
    if (isNoEntry(error)) {
      return 0;
    }
    throw error;
  }
}

export type ClearCacheOptions = {
  dryRun: boolean;
};

export type ClearCacheResult = {
  type: CacheType;
  path: string;
  files: number;
  deleted: boolean;
};

export async function clearCache(
  types: CacheType[],
  options: ClearCacheOptions,
) {
  const results: ClearCacheResult[] = [];

  for (const type of types) {
    const path = getCacheDirectory(type);
    const files = await countCacheFiles(path);
    if (!options.dryRun && files > 0) {
      await rm(path, { recursive: true, force: true });
    }
    results.push({
      deleted: !options.dryRun && files > 0,
      files,
      path,
      type,
    });
  }

  return results;
}

export async function saveJson(json: unknown, filename: string, path: string) {
  await mkdir(path, { recursive: true });
  return writeFile(`${path}/${filename}.json`, JSON.stringify(json, null, 4));
}

function addCacheBustingQueryParam(url: string) {
  const parsedUrl = new URL(url);
  parsedUrl.searchParams.set("cacheBust", Date.now().toString());
  return parsedUrl.toString();
}

export async function fetchJsonWithCache(
  id: string,
  url: string,
  type: string,
  cacheOptions: boolean | CacheOptions = true,
  fetchOptions: { cacheBust?: boolean } = {},
) {
  const cache = normalizeCacheOptions(cacheOptions);
  if (cache.read && !fetchOptions.cacheBust) {
    const cached = await getCache(id, type);
    if (cached) {
      return cached;
    }
  }
  const fetchUrl = fetchOptions.cacheBust
    ? addCacheBustingQueryParam(url)
    : url;
  const resp = await fetchJson(fetchUrl);
  if (cache.write) {
    await saveCache(id, type, resp);
  }
  return resp;
}

export async function fetchDlcsManifestWithCache(
  dlcsId: string | number,
  url: string,
  cacheOptions: boolean | CacheOptions = true,
  options: { purgeServerCache?: boolean } = {},
) {
  return fetchJsonWithCache(String(dlcsId), url, "dlcs", cacheOptions, {
    cacheBust: options.purgeServerCache,
  });
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
    await saveCache(oclcNumber.toString(), "oclc", resp.data);
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

export async function saveYaml(pathWithFilename: string, json: unknown) {
  const yamlString = stringify(json, { lineWidth: 0 });
  await writeFile(pathWithFilename, yamlString);
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

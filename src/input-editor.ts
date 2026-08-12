import { readFile, writeFile } from "node:fs/promises";
import {
  isMap,
  isScalar,
  isSeq,
  parseDocument,
  type YAMLMap,
} from "yaml";
import { v4 } from "uuid";
import { parseInputConfig, type InputConfig } from "./input.ts";
import { getFirstOclcTitle, type OclcMetadataResponse } from "./oclc.ts";
import { fetchOclcMetadataWithCache } from "./shared.ts";

type EditableYamlDocument = ReturnType<typeof parseDocument>;
type InputItem = InputConfig["items"][number];

export type InputEditCacheOptions = {
  read: boolean;
  write: boolean;
};

export type InputEditOptions = {
  includeSkipped: boolean;
  write: boolean;
};

export type AddOclcLabelsOptions = InputEditOptions & {
  cache: InputEditCacheOptions;
  overwrite: boolean;
};

export type InputEditStats = {
  files: number;
  changedFiles: number;
  collectionGuidsAdded: number;
  itemGuidsAdded: number;
  oclcLabelsAdded: number;
  oclcLabelsUpdated: number;
  skippedByConfig: number;
  skippedExistingLabels: number;
  skippedNoOclc: number;
  skippedNoTitle: number;
  errors: number;
};

export function emptyInputEditStats(): InputEditStats {
  return {
    files: 0,
    changedFiles: 0,
    collectionGuidsAdded: 0,
    itemGuidsAdded: 0,
    oclcLabelsAdded: 0,
    oclcLabelsUpdated: 0,
    skippedByConfig: 0,
    skippedExistingLabels: 0,
    skippedNoOclc: 0,
    skippedNoTitle: 0,
    errors: 0,
  };
}

export function addInputEditStats(total: InputEditStats, next: InputEditStats) {
  total.files += next.files;
  total.changedFiles += next.changedFiles;
  total.collectionGuidsAdded += next.collectionGuidsAdded;
  total.itemGuidsAdded += next.itemGuidsAdded;
  total.oclcLabelsAdded += next.oclcLabelsAdded;
  total.oclcLabelsUpdated += next.oclcLabelsUpdated;
  total.skippedByConfig += next.skippedByConfig;
  total.skippedExistingLabels += next.skippedExistingLabels;
  total.skippedNoOclc += next.skippedNoOclc;
  total.skippedNoTitle += next.skippedNoTitle;
  total.errors += next.errors;
}

function formatYamlErrors(document: EditableYamlDocument) {
  return document.errors.map((error) => error.message).join("\n");
}

async function loadEditableInputFile(path: string) {
  const source = await readFile(path, "utf8");
  const document = parseDocument(source, { keepSourceTokens: true });
  if (document.errors.length) {
    throw new Error(`Invalid YAML in ${path}:\n${formatYamlErrors(document)}`);
  }

  const inputConfig = parseInputConfig(document.toJS(), path);
  const rootMap = document.contents;
  if (!isMap(rootMap)) {
    throw new Error(`Expected ${path} to contain a YAML mapping`);
  }

  const collectionMap = rootMap.get("collection", true);
  if (!isMap(collectionMap)) {
    throw new Error(`Expected ${path} to contain a collection mapping`);
  }

  const items = rootMap.get("items", true);
  if (!isSeq(items)) {
    throw new Error(`Expected ${path} to contain an items sequence`);
  }

  const itemMaps = items.items.map((item, index) => {
    if (!isMap(item)) {
      throw new Error(`Expected item ${index + 1} in ${path} to be a mapping`);
    }
    return item;
  });

  return {
    collectionMap,
    document,
    inputConfig,
    itemMaps,
  };
}

async function saveEditableInputFile(
  path: string,
  document: EditableYamlDocument,
) {
  await writeFile(path, document.toString({ lineWidth: 0 }));
}

function getPairKey(pair: YAMLMap["items"][number]) {
  return isScalar(pair.key) ? pair.key.value : pair.key;
}

function findPairIndex(map: YAMLMap, key: string) {
  return map.items.findIndex((pair) => getPairKey(pair) === key);
}

function hasMapKey(map: YAMLMap, key: string) {
  return findPairIndex(map, key) !== -1;
}

function setMapValue(
  document: EditableYamlDocument,
  map: YAMLMap,
  key: string,
  value: unknown,
  options: { afterKey?: string; atStart?: boolean; overwrite?: boolean } = {},
) {
  const existingIndex = findPairIndex(map, key);
  if (existingIndex !== -1) {
    if (!options.overwrite) {
      return "unchanged";
    }
    map.items[existingIndex].value = document.createNode(value);
    return "updated";
  }

  const pair = document.createPair(key, value);
  if (options.atStart) {
    map.items.unshift(pair);
  } else if (options.afterKey) {
    const afterIndex = findPairIndex(map, options.afterKey);
    map.items.splice(
      afterIndex === -1 ? map.items.length : afterIndex + 1,
      0,
      pair,
    );
  } else {
    map.items.push(pair);
  }

  return "added";
}

function describeItem(item: InputItem) {
  if (item.tresor) return item.tresor;
  if (item.dlcs || item.dlcs === 0) return String(item.dlcs);
  if (item.guid) return item.guid;
  return "unknown item";
}

function getChangeVerb(write: boolean) {
  return write ? "Updated" : "Would update";
}

function hasChanges(stats: InputEditStats) {
  return Boolean(
    stats.collectionGuidsAdded ||
      stats.itemGuidsAdded ||
      stats.oclcLabelsAdded ||
      stats.oclcLabelsUpdated,
  );
}

export async function addMissingGuidsToInputFile(
  path: string,
  options: InputEditOptions,
) {
  const { collectionMap, document, inputConfig, itemMaps } =
    await loadEditableInputFile(path);
  const stats = emptyInputEditStats();
  stats.files = 1;

  if (!inputConfig.collection.guid) {
    setMapValue(document, collectionMap, "guid", v4(), { atStart: true });
    stats.collectionGuidsAdded++;
  }

  for (const [index, item] of inputConfig.items.entries()) {
    if (item.skip && !options.includeSkipped) {
      stats.skippedByConfig++;
      continue;
    }

    if (!item.guid) {
      setMapValue(document, itemMaps[index], "guid", v4(), { atStart: true });
      stats.itemGuidsAdded++;
    }
  }

  if (hasChanges(stats)) {
    stats.changedFiles = 1;
    if (options.write) {
      await saveEditableInputFile(path, document);
    }
    console.log(
      `${getChangeVerb(options.write)} ${path}: ${stats.collectionGuidsAdded} collection GUID(s), ${stats.itemGuidsAdded} item GUID(s).`,
    );
  } else {
    console.log(`No missing GUIDs found in ${path}`);
  }

  if (stats.skippedByConfig) {
    console.log(
      `Skipped ${stats.skippedByConfig} item(s) with skip: true in ${path}`,
    );
  }

  return stats;
}

async function fetchOclcResponses(
  item: InputItem,
  cache: InputEditCacheOptions,
) {
  const responses: OclcMetadataResponse[] = [];
  for (const oclcNumber of item.oclc ?? []) {
    const response = await fetchOclcMetadataWithCache(oclcNumber, cache);
    responses.push(response);
  }
  return responses;
}

export async function addOclcLabelsToInputFile(
  path: string,
  options: AddOclcLabelsOptions,
) {
  const { document, inputConfig, itemMaps } = await loadEditableInputFile(path);
  const stats = emptyInputEditStats();
  stats.files = 1;

  for (const [index, item] of inputConfig.items.entries()) {
    if (item.skip && !options.includeSkipped) {
      stats.skippedByConfig++;
      continue;
    }

    if (!item.oclc?.length) {
      stats.skippedNoOclc++;
      continue;
    }

    const itemMap = itemMaps[index];
    const hasLabel = hasMapKey(itemMap, "label");
    if (hasLabel && !options.overwrite) {
      stats.skippedExistingLabels++;
      continue;
    }

    const title = getFirstOclcTitle(
      await fetchOclcResponses(item, options.cache),
    );
    if (!title) {
      stats.skippedNoTitle++;
      console.log(`No OCLC title found for ${describeItem(item)} in ${path}`);
      continue;
    }

    const result = setMapValue(document, itemMap, "label", title, {
      afterKey: "oclc",
      overwrite: options.overwrite,
    });
    if (result === "added") {
      stats.oclcLabelsAdded++;
    } else if (result === "updated") {
      stats.oclcLabelsUpdated++;
    }

    console.log(
      `${options.write ? "Set" : "Would set"} label for ${describeItem(item)}: ${title}`,
    );
  }

  if (hasChanges(stats)) {
    stats.changedFiles = 1;
    if (options.write) {
      await saveEditableInputFile(path, document);
    }
    console.log(
      `${getChangeVerb(options.write)} ${path}: ${stats.oclcLabelsAdded} OCLC label(s) added, ${stats.oclcLabelsUpdated} updated.`,
    );
  } else {
    console.log(`No OCLC labels to add in ${path}`);
  }

  if (stats.skippedByConfig) {
    console.log(
      `Skipped ${stats.skippedByConfig} item(s) with skip: true in ${path}`,
    );
  }

  return stats;
}

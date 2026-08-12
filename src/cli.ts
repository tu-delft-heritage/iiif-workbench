import {
  closeLog,
  date,
  hasLog,
  setLogEnabled,
} from "./log.ts";
import {
  addStats,
  emptyStats,
  formatError,
  generateManifestsForInputFile,
} from "./manifest-runner.ts";
import {
  addInputEditStats,
  addMissingGuidsToInputFile,
  addOclcLabelsToInputFile,
  emptyInputEditStats,
} from "./input-editor.ts";
import {
  cacheTypes,
  clearCache,
  type CacheType,
} from "./shared.ts";

export type CliOptions = {
  cache: boolean;
  dryRun?: boolean;
  purgeDlcsCache?: boolean;
  useGuidFilenames?: boolean;
  useOutputFolder?: boolean;
};

export type InputEditCliOptions = {
  includeSkipped?: boolean;
  write?: boolean;
};

export type AddOclcLabelsCliOptions = InputEditCliOptions & {
  cache: boolean;
  overwrite?: boolean;
};

export type ClearCacheCliOptions = {
  dryRun?: boolean;
};

export function normalizeProcessArgv(argv: string[]) {
  const [runtime, script, ...args] = argv;
  return [runtime, script, ...args.filter((arg) => arg !== "--")];
}

function formatCacheTypes() {
  return ["all", ...cacheTypes].join(", ");
}

function isCacheType(value: string): value is CacheType {
  return cacheTypes.includes(value as CacheType);
}

function resolveCacheTypes(targets: string[]): CacheType[] {
  const normalizedTargets = targets.map((target) => target.toLowerCase());
  if (!normalizedTargets.length || normalizedTargets.includes("all")) {
    return [...cacheTypes];
  }

  const invalidTargets = normalizedTargets.filter(
    (target) => !isCacheType(target),
  );
  if (invalidTargets.length) {
    throw new Error(
      `Unknown cache type "${invalidTargets.join(", ")}". Expected one of: ${formatCacheTypes()}`,
    );
  }

  return [...new Set(normalizedTargets.filter(isCacheType))];
}

export async function runGenerateCli(files: string[], cliOptions: CliOptions) {
  const dryRun = Boolean(cliOptions.dryRun);
  setLogEnabled(!dryRun);

  const options = {
    cache: {
      read: cliOptions.cache,
      write: cliOptions.cache && !dryRun,
    },
    dryRun,
    purgeDlcsCache: Boolean(cliOptions.purgeDlcsCache),
    useGuidFilenames: Boolean(cliOptions.useGuidFilenames),
    useOutputFolder: Boolean(cliOptions.useOutputFolder),
  };

  const total = emptyStats();

  try {
    for (const file of files) {
      try {
        const stats = await generateManifestsForInputFile(file, options);
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
    `Finished ${files.length} input file(s): ${total.processed} manifests processed, ${total.created} created, ${total.overwritten} overwritten, ${total.wouldCreate} would be created, ${total.wouldOverwrite} would be overwritten, ${total.skipped} skipped (${total.skippedByConfig} by config), ${total.errors} errors.`,
  );

  if (hasLog()) {
    console.log(`Log: ${date}.txt`);
  }

  if (total.errors > 0) {
    process.exitCode = 1;
  }
}

export async function runAddGuidsCli(
  files: string[],
  cliOptions: InputEditCliOptions,
) {
  const total = emptyInputEditStats();

  for (const file of files) {
    try {
      const stats = await addMissingGuidsToInputFile(file, {
        includeSkipped: Boolean(cliOptions.includeSkipped),
        write: Boolean(cliOptions.write),
      });
      addInputEditStats(total, stats);
    } catch (err) {
      total.files++;
      total.errors++;
      console.error(`Error processing ${file}: ${formatError(err)}`);
    }
  }

  console.log(
    `Finished add-guids for ${files.length} input file(s): ${total.collectionGuidsAdded} collection GUID(s), ${total.itemGuidsAdded} item GUID(s), ${total.changedFiles} file(s) ${cliOptions.write ? "updated" : "would change"}, ${total.skippedByConfig} skipped by config, ${total.errors} errors.`,
  );

  if (total.errors > 0) {
    process.exitCode = 1;
  }
}

export async function runClearCacheCli(
  targets: string[],
  cliOptions: ClearCacheCliOptions,
) {
  const dryRun = Boolean(cliOptions.dryRun);
  let types: CacheType[];

  try {
    types = resolveCacheTypes(targets);
  } catch (err) {
    console.error(formatError(err));
    process.exitCode = 1;
    return;
  }

  const results = await clearCache(types, { dryRun });
  const totalFiles = results.reduce((total, result) => total + result.files, 0);

  for (const result of results) {
    if (dryRun) {
      console.log(
        `[dry-run] Would delete ${result.files} cache file(s) from ${result.path}`,
      );
    } else if (result.deleted) {
      console.log(
        `Deleted ${result.files} cache file(s) from ${result.path}`,
      );
    } else {
      console.log(`No cache files found in ${result.path}`);
    }
  }

  console.log(
    `${dryRun ? "Would delete" : "Deleted"} ${totalFiles} cache file(s) across ${results.length} cache type(s).`,
  );
}

export async function runAddOclcLabelsCli(
  files: string[],
  cliOptions: AddOclcLabelsCliOptions,
) {
  const write = Boolean(cliOptions.write);
  const total = emptyInputEditStats();
  const cache = {
    read: cliOptions.cache,
    write: cliOptions.cache && write,
  };

  for (const file of files) {
    try {
      const stats = await addOclcLabelsToInputFile(file, {
        cache,
        includeSkipped: Boolean(cliOptions.includeSkipped),
        overwrite: Boolean(cliOptions.overwrite),
        write,
      });
      addInputEditStats(total, stats);
    } catch (err) {
      total.files++;
      total.errors++;
      console.error(`Error processing ${file}: ${formatError(err)}`);
    }
  }

  console.log(
    `Finished add-oclc-labels for ${files.length} input file(s): ${total.oclcLabelsAdded} label(s) added, ${total.oclcLabelsUpdated} updated, ${total.changedFiles} file(s) ${write ? "updated" : "would change"}, ${total.skippedExistingLabels} existing label(s), ${total.skippedNoOclc} without OCLC, ${total.skippedNoTitle} without title, ${total.skippedByConfig} skipped by config, ${total.errors} errors.`,
  );

  if (total.errors > 0) {
    process.exitCode = 1;
  }
}

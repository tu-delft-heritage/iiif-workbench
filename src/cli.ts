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
  processInputFile,
} from "./manifest-runner.ts";

export type CliOptions = {
  cache: boolean;
  dryRun?: boolean;
  useGuidFilenames?: boolean;
  useOutputFolder?: boolean;
};

export function normalizeProcessArgv(argv: string[]) {
  const [runtime, script, ...args] = argv;
  return [runtime, script, ...args.filter((arg) => arg !== "--")];
}

export async function runFiles(files: string[], cliOptions: CliOptions) {
  const dryRun = Boolean(cliOptions.dryRun);
  setLogEnabled(!dryRun);

  const options = {
    cache: {
      read: cliOptions.cache,
      write: cliOptions.cache && !dryRun,
    },
    dryRun,
    useGuidFilenames: Boolean(cliOptions.useGuidFilenames),
    useOutputFolder: Boolean(cliOptions.useOutputFolder),
  };

  const total = emptyStats();

  try {
    for (const file of files) {
      try {
        const stats = await processInputFile(file, options);
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
    `Finished ${files.length} input file(s): ${total.processed} manifests processed, ${total.created} created, ${total.overwritten} overwritten, ${total.wouldCreate} would be created, ${total.wouldOverwrite} would be overwritten, ${total.skipped} skipped, ${total.errors} errors.`,
  );

  if (hasLog()) {
    console.log(`Log: ${date}.txt`);
  }

  if (total.errors > 0) {
    process.exitCode = 1;
  }
}

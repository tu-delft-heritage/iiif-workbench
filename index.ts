#!/usr/bin/env node
import { Command } from "commander";
import {
  normalizeProcessArgv,
  runCli,
  type CliOptions,
} from "./src/cli.ts";

const program = new Command();

program
  .name("iiif-workbench")
  .description("Generate IIIF manifests from DLCS skeletons and YAML/OCLC metadata.")
  .argument("<files...>", "input YAML file(s) to process")
  .option("--no-cache", "disable OCLC cache reads and writes")
  .option(
    "--dry-run",
    "fetch and process records without clearing output or writing files/cache",
  )
  .option(
    "--use-output-folder",
    "use collection.output instead of collection.guid for the output folder",
  )
  .option(
    "--use-guid-filenames",
    "use item GUIDs for manifest filenames instead of shelf-number filenames",
  )
  .showHelpAfterError()
  .action((files: string[], cliOptions: CliOptions) =>
    runCli(files, cliOptions),
  );

await program.parseAsync(normalizeProcessArgv(process.argv));

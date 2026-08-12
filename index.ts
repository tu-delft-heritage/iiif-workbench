#!/usr/bin/env node
import { Command } from "commander";
import {
  runAddGuidsCli,
  runAddOclcLabelsCli,
  runGenerateCli,
  normalizeProcessArgv,
  type AddOclcLabelsCliOptions,
  type CliOptions,
  type InputEditCliOptions,
} from "./src/cli.ts";

const program = new Command();

function addGenerateOptions(command: Command) {
  return command
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
    );
}

function addInputEditOptions(command: Command) {
  return command
    .option("--write", "write changes to the input YAML files")
    .option(
      "--include-skipped",
      "also edit items marked with skip: true",
    );
}

program
  .name("iiif-workbench")
  .description("Generate IIIF manifests from DLCS skeletons and YAML/OCLC metadata.")
  .showHelpAfterError();

addGenerateOptions(program)
  .argument("[files...]", "input YAML file(s) to process")
  .action((files: string[], cliOptions: CliOptions) => {
    if (!files.length) {
      program.help();
    }
    return runGenerateCli(files, cliOptions);
  });

addGenerateOptions(
  program
    .command("generate")
    .description("Generate IIIF manifests from input YAML files.")
    .argument("<files...>", "input YAML file(s) to process"),
).action((files: string[], cliOptions: CliOptions) =>
  runGenerateCli(files, cliOptions),
);

addInputEditOptions(
  program
    .command("add-guids")
    .description("Add missing collection and item GUIDs to input YAML files.")
    .argument("<files...>", "input YAML file(s) to update"),
).action((files: string[], cliOptions: InputEditCliOptions) =>
  runAddGuidsCli(files, cliOptions),
);

addInputEditOptions(
  program
    .command("add-oclc-labels")
    .description("Add missing item labels from OCLC titles.")
    .argument("<files...>", "input YAML file(s) to update")
    .option("--no-cache", "disable OCLC cache reads and writes")
    .option("--overwrite", "replace existing item labels"),
).action((files: string[], cliOptions: AddOclcLabelsCliOptions) =>
  runAddOclcLabelsCli(files, cliOptions),
);

await program.parseAsync(normalizeProcessArgv(process.argv));

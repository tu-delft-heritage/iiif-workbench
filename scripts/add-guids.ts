#!/usr/bin/env node
import { Command } from "commander";
import { v4 } from "uuid";
import { loadYaml } from "../src/input.ts";
import { closeLog } from "../src/log.ts";
import { saveYaml } from "../src/shared.ts";

const program = new Command();

program
  .name("add-guids")
  .description("Add missing collection and item GUIDs to input YAML files.")
  .argument("<files...>", "input YAML file(s) to update")
  .showHelpAfterError()
  .action(async (files: string[]) => {
    try {
      for (const path of files) {
        const inputConfig = await loadYaml(path);

        if (!inputConfig.collection.guid) {
          inputConfig.collection = { guid: v4(), ...inputConfig.collection };
        }

        inputConfig.items.forEach((item, index) => {
          if (!item.guid) {
            inputConfig.items[index] = { guid: v4(), ...item };
          }
        });

        // Not overwriting existing file in order to preserve comments, etc.
        const outputPath = path.replace(".yml", "-guids.yml");

        await saveYaml(outputPath, inputConfig);
        console.log(`Wrote ${outputPath}`);
      }
    } finally {
      await closeLog();
    }
  });

await program.parseAsync(process.argv);

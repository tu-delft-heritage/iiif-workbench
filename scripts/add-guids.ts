#!/usr/bin/env node
import { Command } from "commander";
import { v4 } from "uuid";
import { closeLog } from "../src/log.ts";
import { loadYml, saveYml } from "../src/shared.ts";

const program = new Command();

program
  .name("add-guids")
  .description("Add missing collection and item GUIDs to input YAML files.")
  .argument("<files...>", "input YAML file(s) to update")
  .showHelpAfterError()
  .action(async (files: string[]) => {
    try {
      for (const path of files) {
        const yml = await loadYml(path);

        if (!yml.collection.guid) {
          yml.collection = { guid: v4(), ...yml.collection };
        }

        yml.items.forEach((object, index) => {
          if (!object.guid) {
            yml.items[index] = { guid: v4(), ...object };
          }
        });

        // Not overwriting existing file in order to preserve comments, etc.
        const outputPath = path.replace(".yml", "-guids.yml");

        await saveYml(outputPath, yml);
        console.log(`Wrote ${outputPath}`);
      }
    } finally {
      await closeLog();
    }
  });

await program.parseAsync(process.argv);

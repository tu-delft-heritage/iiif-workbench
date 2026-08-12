import { selectFile, loadYml, saveYml } from "../src/shared.ts";
import { v4 } from "uuid";

const path = await selectFile("input/*.yml");
const yml = await loadYml(path);

// Adding missing guid to "start" of objects
if (!yml.collection.guid) {
  yml.collection = { guid: v4(), ...yml.collection };
}

yml.items.forEach((object, index) => {
  if (!object.guid) {
    yml.items[index] = { guid: v4(), ...object };
  }
});

// Not overwriting existing file in order to preserve comments, etc
const outputPath = path.replace(".yml", "-guids.yml");

await saveYml(outputPath, yml);

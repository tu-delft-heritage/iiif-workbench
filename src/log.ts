import { once } from "node:events";
import { createWriteStream, mkdirSync } from "node:fs";

export const date = new Date().toISOString().slice(0, -5).replaceAll(":", ".");

mkdirSync("logs", { recursive: true });

export const writer = createWriteStream(`logs/${date}.txt`, { flags: "a" });

export async function closeLog() {
  writer.end();
  await once(writer, "finish");
}

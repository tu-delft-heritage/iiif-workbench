import { once } from "node:events";
import { createWriteStream, mkdirSync, type WriteStream } from "node:fs";

export const date = new Date().toISOString().slice(0, -5).replaceAll(":", ".");

let enabled = true;
let stream: WriteStream | undefined = undefined;

function getStream() {
  if (!enabled) {
    return undefined;
  }

  if (!stream) {
    mkdirSync("logs", { recursive: true });
    stream = createWriteStream(`logs/${date}.txt`, { flags: "a" });
  }

  return stream;
}

export const writer = {
  write(message: string) {
    return getStream()?.write(message) ?? true;
  },
};

export function setLogEnabled(value: boolean) {
  enabled = value;
}

export function hasLog() {
  return Boolean(stream);
}

export async function closeLog() {
  if (!stream) {
    return;
  }

  stream.end();
  await once(stream, "finish");
}

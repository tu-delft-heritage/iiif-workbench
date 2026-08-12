import yaml from "js-yaml";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { writer } from "./log.ts";

const scalarSchema = z.union([z.string(), z.number()]);
const scalarOrArraySchema = z.union([scalarSchema, z.array(scalarSchema)]);

export const languageValueSchema = z
  .union([z.record(z.string(), scalarOrArraySchema), scalarOrArraySchema])
  .transform((value) => {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      Array.isArray(value)
    ) {
      return { none: value };
    }

    return value;
  });

export const metadataValuesSchema = z.record(z.string(), languageValueSchema);

const oclcNumberSchema = z.union([
  z.number().int().positive(),
  z
    .string()
    .trim()
    .regex(/^\d+$/, "OCLC number must contain only digits")
    .transform(Number),
]);

const oclcSchema = z
  .union([oclcNumberSchema, z.array(oclcNumberSchema).nonempty()])
  .transform((value) => (Array.isArray(value) ? value : [value]));

const metadataLabelSchema = z.string().trim().min(1);

const metadataLabelsSchema = z
  .union([metadataLabelSchema, z.array(metadataLabelSchema).nonempty()])
  .transform((value) => (Array.isArray(value) ? value : [value]));

const collectionSchema = z
  .object({
    guid: z.string().optional(),
    output: z.string().optional(),
    prefix: z.string().optional(),
    dlcs: z.record(z.string(), z.unknown()).optional(),
    label: languageValueSchema.optional(),
    summary: languageValueSchema.optional(),
    metadata: metadataValuesSchema.optional(),
  })
  .passthrough();

const itemSchema = z
  .object({
    guid: z.string().optional(),
    dlcs: z.union([z.string(), z.number()]),
    tresor: z.string().optional(),
    oclc: oclcSchema.optional(),
    metadata: metadataValuesSchema.optional(),
    skipMetadata: metadataLabelsSchema.optional(),
    "first-canvas": z.number().int().nonnegative().optional(),
    projects: z.array(z.record(z.string(), z.unknown())).optional(),
  })
  .passthrough();

export const inputConfigSchema = z
  .object({
    collection: collectionSchema,
    items: z.array(itemSchema),
  })
  .strict();

export type LanguageValue = z.output<typeof languageValueSchema>;
export type MetadataValues = z.output<typeof metadataValuesSchema>;
export type InputConfig = z.output<typeof inputConfigSchema>;

function formatPath(path: PropertyKey[]) {
  return path.length ? path.join(".") : "<root>";
}

function formatInputValidationError(error: z.ZodError) {
  return error.issues
    .map((issue) => `${formatPath(issue.path)}: ${issue.message}`)
    .join("\n");
}

export function parseInputConfig(input: unknown, sourcePath?: string) {
  const result = inputConfigSchema.safeParse(input);
  if (result.success) {
    return result.data;
  }

  const source = sourcePath ? ` in ${sourcePath}` : "";
  throw new Error(
    `Invalid input YAML${source}:\n${formatInputValidationError(result.error)}`,
  );
}

export async function loadYaml(path: string) {
  const file = await readFile(path, "utf8");
  writer.write(`Selected input file: ${path}\n`);
  return parseInputConfig(yaml.load(file), path);
}

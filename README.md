# IIIF Workbench

This repository is used to create IIIF Manifests for TU Delft Library's [academic heritage website](https://heritage.tudelft.nl/en).

OpenAPI yml file has been converted to typescript with [OpenAPI Typescript](https://openapi-ts.dev/):

```
pnpm run generate:types
```

To install dependencies:

```bash
pnpm install
```

To run:

```bash
pnpm start -- input/tu-lib-tresor.yml
pnpm start -- generate input/tu-lib-tresor.yml
```

You can process one or more input files:

```bash
pnpm start -- input/tu-lib-tresor.yml input/tu-lib-tresor-piranesi.yml
```

Because files are passed as normal CLI arguments, shell expansions work too:

```bash
pnpm start -- input/*.yml
pnpm start -- input/tu-lib-*.yml
pnpm start -- input/{tu-lib-tresor.yml,tu-lib-tresor-piranesi.yml}
```

Disable OCLC cache reads and writes:

```bash
pnpm start -- input/tu-lib-tresor.yml --no-cache
```

Run without clearing output folders or writing manifests, collection files, or new cache files:

```bash
pnpm start -- input/tu-lib-tresor.yml --dry-run
```

Use `collection.output` instead of `collection.guid` for output folders:

```bash
pnpm start -- input/tu-lib-tresor.yml --use-output-folder
```

`collection.output` is appended to the `outputDirBase` setting, so an output value like `lib-tresor` writes to `output/dlcs/lib-tresor`. If `collection.output` is empty or missing, the input filename is used instead, so `input/tu-lib-tresor.yml` writes to `output/dlcs/tu-lib-tresor`.

Use item GUIDs for manifest filenames instead of the custom shelf-number filenames:

```bash
pnpm start -- input/tu-lib-tresor.yml --use-guid-filenames
```

These flags can be combined:

```bash
pnpm start -- input/tu-lib-tresor.yml --use-output-folder --use-guid-filenames
```

Input YAML is validated with Zod before any output folder is cleared. The `oclc` field accepts either a single number or an array:

```yaml
oclc: 842525508
oclc:
  - 842525508
  - 842552167
```

An item can be marked as intentionally skipped. Skipped items are reported by
the CLI and are not used to generate manifests:

```yaml
skip: true
comment: No OCLC number
```

Use item-level `label` to override the manifest label while keeping full OCLC
title metadata intact. If `label` is missing, the manifest label falls back to
metadata `title`:

```yaml
oclc: 842525508
label: Short display title
```

OCLC metadata fields without values are omitted. To skip a generated OCLC
metadata field, use the metadata slug from `objectLabels`:

```yaml
skipMetadata: notes
skipMetadata:
  - physical_description
  - notes
```

Items can combine OCLC metadata with additional custom metadata. Final metadata
order follows `objectLabels` in `src/settings.ts`. Custom metadata is applied
after generated OCLC fields, so a matching slug overrides the OCLC value:

```yaml
oclc: 842525508
metadata:
  title:
    en: Manually corrected full title
  author:
    none: Manually corrected author
```

To add missing GUIDs:

```bash
pnpm run add-guids -- input/tu-lib-tresor.yml
pnpm start -- add-guids input/tu-lib-tresor.yml
pnpm start -- add-guids input/tu-lib-tresor.yml --write
```

Input-editing commands are dry runs unless `--write` is provided. They preserve
YAML comments when writing. Items marked with `skip: true` are ignored unless
`--include-skipped` is provided.

To add item labels from OCLC titles:

```bash
pnpm start -- add-oclc-labels input/tu-lib-tresor-piranesi.yml
pnpm start -- add-oclc-labels input/tu-lib-tresor-piranesi.yml --write
pnpm start -- add-oclc-labels input/tu-lib-tresor-piranesi.yml --overwrite --write
```

To typecheck:

```bash
pnpm run typecheck
```

This project uses Node.js to run erasable TypeScript directly. Use Node.js 24.12.0 or newer.

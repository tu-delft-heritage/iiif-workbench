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

To add missing GUIDs:

```bash
pnpm run add-guids -- input/tu-lib-tresor.yml
```

To typecheck:

```bash
pnpm run typecheck
```

This project uses Node.js to run erasable TypeScript directly. Use Node.js 24.12.0 or newer.

# IIIF Workbench

This repository is used to create IIIF Manifests for TU Delft Library's [academic heritage website](https://heritage.tudelft.nl/en).

OpenAPI yml file has been converted to typescript with [OpenAPI Typescript](https://openapi-ts.dev/):

```
npm run generate:types
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

Disable OCLC cache reads and writes:

```bash
pnpm start -- input/tu-lib-tresor.yml --no-cache
```

Run without clearing output folders or writing manifests, collection files, or new cache files:

```bash
pnpm start -- input/tu-lib-tresor.yml --dry-run
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

# IIIF Workbench

This repository is used to create IIIF Manifests for TU Delft Library's [academic heritage website](https://heritage.tudelft.nl/en).

OpenAPI yml file has been converted to typescript with [OpenAPI Typescript](https://openapi-ts.dev/):

```
npm run generate:types
```

To install dependencies:

```bash
npm install
```

To run:

```bash
npm start
```

To typecheck:

```bash
npm run typecheck
```

This project uses Node.js to run erasable TypeScript directly. Use Node.js 24.12.0 or newer.

# IIIF Workbench

This repository is used to create IIIF Manifests for TU Delft Library's [academic heritage website](https://heritage.tudelft.nl/en).

OpenAPI yml file has been converted to typescript with [OpenAPI Typescript](bun openapi-typescript ./src/open-api-schema.yml -o ./src/open-api-schema.ts)

```
bun openapi-typescript ./src/open-api-schema.yml -o ./src/open-api-schema.ts
```

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

---

This project was created using `bun init` in bun v1.0.23. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.

import type { InternationalString } from "@iiif/presentation-3";

export const cacheDir = ".cache/";
export const dlcsImageBase = "https://dlc.services/iiif-img/v3/7/";
export const dlcsQueryBase = `https://dlc.services/iiif-resource/v3/7/string1string2string3/`;
export const outputDirBase = "output/dlcs";

export const objectLabels = {
  label: {
    en: ["Title"],
    nl: ["Titel"],
  },
  contributor: {
    en: ["Maker"],
    nl: ["Maker"],
  },
  publisher: {
    en: ["Publisher"],
    nl: ["Uitgever"],
  },
  collection: {
    en: ["Archive"],
    nl: ["Archief"],
  },
  journal: {
    en: ["Journal"],
    nl: ["Tijdschrift"],
  },
  year: {
    en: ["Year"],
    nl: ["Jaar"],
  },
  format: {
    en: ["Format"],
    nl: ["Formaat"],
  },
  description: {
    en: ["Description"],
    nl: ["Beschrijving"],
  },
  notes: {
    en: ["Notes"],
    nl: ["Noot"],
  },
  rights: {
    en: ["Rights"],
    nl: ["Rechten"],
  },
  oclc_number: {
    en: ["OCLC Number"],
    nl: ["OCLC nummer"],
  },
  inventory_number: {
    en: ["Inventory number"],
    nl: ["Inventarisnummer"],
  },
  permalink: {
    en: ["Permalink"],
    nl: ["Permalink"],
  },
} satisfies Record<string, InternationalString>;

export const collectionLabels = {
  institution: {
    en: ["Managing institution"],
    nl: ["Beherende instelling"],
  },
  collection: {
    en: ["Collection"],
    nl: ["Collectie"],
  },
} satisfies Record<string, InternationalString>;

import { objectLabels } from "./settings.ts";

import type { InternationalString, MetadataItem } from "@iiif/presentation-3";
import type { LanguageValue, MetadataValues } from "./input.ts";

export type MetadataKey = keyof typeof objectLabels;
export type MetadataValueMap = Partial<Record<MetadataKey, InternationalString>>;

export const metadataKeys = Object.keys(objectLabels) as MetadataKey[];

const metadataKeySet = new Set<string>(metadataKeys);

export function isMetadataKey(value: string): value is MetadataKey {
  return metadataKeySet.has(value);
}

export function formatMetadataKeys() {
  return metadataKeys.join(", ");
}

function toArray<T>(input: T | T[]) {
  return Array.isArray(input) ? input : [input];
}

export function toInternationalString(value: LanguageValue) {
  const internationalString: InternationalString = {};
  for (const [lang, langValue] of Object.entries(value)) {
    internationalString[lang] = toArray(langValue).map(String);
  }
  return internationalString;
}

export function hasMetadataValue(
  value: InternationalString | undefined,
): value is InternationalString {
  return Boolean(
    value &&
      Object.values(value).some((values) =>
        values?.some((item) => item.trim()),
      ),
  );
}

export function buildManualMetadataValues(props: MetadataValues) {
  const metadataValues: MetadataValueMap = {};
  for (const [key, value] of Object.entries(props)) {
    if (isMetadataKey(key)) {
      const metadataValue = toInternationalString(value);
      if (hasMetadataValue(metadataValue)) {
        metadataValues[key] = metadataValue;
      }
    }
  }
  return metadataValues;
}

export function buildMetadataItems(metadataValues: MetadataValueMap) {
  return metadataKeys.flatMap((key): MetadataItem[] => {
    const value = metadataValues[key];
    if (!hasMetadataValue(value)) {
      return [];
    }

    return [
      {
        label: objectLabels[key],
        value,
      },
    ];
  });
}

export function getTitleMetadataValue(metadataValues: MetadataValueMap) {
  return metadataValues.title;
}

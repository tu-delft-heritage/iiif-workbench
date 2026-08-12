import createClient, { type Middleware } from "openapi-fetch";
import { writer } from "./log.ts";
import { formats } from "./formats.ts";

import type { paths } from "./types/openapi-schema.ts";
import type { InternationalString, MetadataItem } from "@iiif/presentation-3";

type SuccessResponse =
  paths["/bibs/{oclcNumber}"]["get"]["responses"][200]["content"]["application/json"];
export type OclcMetadataResponse = SuccessResponse;

const worldCatBaseUrl = "https://tudelft.on.worldcat.org/oclc/";
let accessToken: string | undefined = undefined;

async function getToken() {
  const apiKey = process.env.OCLC_SEARCH_API_TOKEN;
  if (!apiKey) {
    throw new Error("No API key found in environmental variables");
  }
  return await fetch("https://oauth.oclc.org/token", {
    method: "POST",
    headers: new Headers({
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${btoa(apiKey)}`,
    }),
    body: "grant_type=client_credentials&scope=wcapi",
  }).then((response: any) => response.json());
}

// From: https://openapi-ts.pages.dev/openapi-fetch/middleware-auth
const authMiddleware: Middleware = {
  async onRequest(req) {
    // fetch token, if it doesn’t exist
    if (!accessToken) {
      const authRes = await getToken();
      if (authRes.access_token) {
        accessToken = authRes.access_token;
      } else {
        throw new Error("Could not fetch access token", authRes);
      }
    }
    // (optional) add logic here to refresh token when it expires
    // add Authorization header to every request
    req.headers.set("Authorization", `Bearer ${accessToken}`);
    return req;
  },
};

const client = createClient<paths>({
  baseUrl: "https://americas.discovery.api.oclc.org/worldcat/search/v2",
});
client.use(authMiddleware);

export async function fetchOclcMetadata(oclcNumber: number) {
  return await client.GET("/bibs/{oclcNumber}", {
    params: {
      path: { oclcNumber },
    },
  });
}

export function getOclcTitles(response: OclcMetadataResponse) {
  return (response.title?.mainTitles ?? [])
    .map((item) => item.text?.trim())
    .filter((title): title is string => Boolean(title));
}

export function getFirstOclcTitle(responses: OclcMetadataResponse[]) {
  return responses.flatMap(getOclcTitles)[0];
}

export type OclcMetadataOptions = {
  skipMetadata?: string[];
};

type OclcMetadataData = {
  shelfNumber: string;
  oclcLinks: string[];
  titles: string[];
  contributors: string[];
  publishers: string[];
  years: string[];
  objectName?: InternationalString;
  descriptions: string[];
  notes: string[];
};

type OclcMetadataField = {
  label:
    | InternationalString
    | ((data: OclcMetadataData) => InternationalString);
  getValue: (data: OclcMetadataData) => InternationalString | undefined;
};

function createLabel(en: string, nl: string): InternationalString {
  return {
    en: [en],
    nl: [nl],
  };
}

function createMetadataValue(
  values: string[],
  options: { unique?: boolean } = {},
): InternationalString | undefined {
  const cleanedValues = values.map((value) => value.trim()).filter(Boolean);
  const finalValues = options.unique
    ? [...new Set(cleanedValues)]
    : cleanedValues;

  if (!finalValues.length) {
    return undefined;
  }

  return { none: finalValues };
}

function hasMetadataValue(
  value: InternationalString | undefined,
): value is InternationalString {
  return Boolean(
    value &&
      Object.values(value).some((values) =>
        values?.some((item) => item.trim()),
      ),
  );
}

function getMetadataLabelValues(label: InternationalString) {
  return Object.values(label)
    .flat()
    .filter((value): value is string => Boolean(value));
}

function normalizeMetadataLabel(label: string) {
  return label.trim().toLowerCase();
}

function createSkippedMetadataLabelSet(labels: string[] | undefined) {
  return new Set(labels?.map(normalizeMetadataLabel));
}

function shouldSkipMetadataItem(
  label: InternationalString,
  skippedLabels: Set<string>,
) {
  return getMetadataLabelValues(label).some((value) =>
    skippedLabels.has(normalizeMetadataLabel(value)),
  );
}

const oclcMetadataFields: OclcMetadataField[] = [
  {
    label: createLabel("Title", "Titel"),
    getValue: (data) => createMetadataValue(data.titles),
  },
  {
    label: (data) =>
      createLabel(
        data.contributors.length <= 1 ? "Author" : "Authors",
        data.contributors.length <= 1 ? "Auteur" : "Auteurs",
      ),
    getValue: (data) =>
      createMetadataValue(data.contributors, { unique: true }),
  },
  {
    label: createLabel("Publication", "Publicatie"),
    getValue: (data) => createMetadataValue(data.publishers, { unique: true }),
  },
  {
    label: createLabel("Year", "Jaar"),
    getValue: (data) => createMetadataValue(data.years, { unique: true }),
  },
  {
    label: createLabel("Object name", "Objectnaam"),
    getValue: (data) => data.objectName,
  },
  {
    label: createLabel("Physical description", "Fysieke beschrijving"),
    getValue: (data) => createMetadataValue(data.descriptions),
  },
  {
    label: createLabel("Notes", "Opmerkingen"),
    getValue: (data) => createMetadataValue(data.notes),
  },
  {
    label: (data) =>
      createLabel(
        data.oclcLinks.length <= 1 ? "OCLC number" : "OCLC numbers",
        data.oclcLinks.length <= 1 ? "OCLC nummer" : "OCLC nummers",
      ),
    getValue: (data) => createMetadataValue(data.oclcLinks),
  },
  {
    label: createLabel("Shelf number", "Plaatsnummer"),
    getValue: (data) =>
      createMetadataValue([data.shelfNumber.replaceAll("-", " ")]),
  },
];

function getWorldCatUrl(identifier: number | string | undefined) {
  return identifier ? `${worldCatBaseUrl}${identifier}` : worldCatBaseUrl;
}

function collectOclcMetadata(
  responses: SuccessResponse[],
  shelfNumber: string,
): OclcMetadataData {
  const data: OclcMetadataData = {
    shelfNumber,
    oclcLinks: [],
    titles: [],
    contributors: [],
    publishers: [],
    years: [],
    descriptions: [],
    notes: [],
  };

  if (responses.length > 1) {
    const urls = responses
      .map((response) => response.identifier?.oclcNumber)
      .filter((identifier): identifier is number => Boolean(identifier))
      .map(getWorldCatUrl);
    writer.write(
      `${shelfNumber} heeft meerdere OCLC nummers (${urls.join(", ")})\n`,
    );
  }

  for (const response of responses) {
    const identifier = response.identifier?.oclcNumber;
    const worldCatUrl = getWorldCatUrl(identifier);
    if (identifier) {
      data.oclcLinks.push(`<a href="${worldCatUrl}">${identifier}</a>`);
    }
    data.titles.push(...getOclcTitles(response));
    // Alternative: response.contributor.statementOfResponsibility
    if (response.contributor?.creators) {
      response.contributor.creators.forEach((item) => {
        let name: string | null = null;
        if (item.nonPersonName?.text) {
          name = item.nonPersonName?.text;
        } else if (item.firstName?.text && item.secondName?.text) {
          name = item.firstName?.text + " " + item.secondName?.text;
        } else if (item.firstName?.text) {
          name = item.firstName?.text;
          writer.write(
            `${shelfNumber} heeft een auteur met alleen een voornaam (${worldCatUrl})\n`,
          );
        } else if (item.secondName?.text) {
          name = item.secondName?.text;
          writer.write(
            `${shelfNumber} heeft een auteur met alleen een achternaam (${worldCatUrl})\n`,
          );
        }
        if (name && item.creatorNotes) {
          name = name.concat(" (", item.creatorNotes.join(", "), ")");
        }
        if (name) {
          data.contributors.push(name);
        }
      });
    } else {
      writer.write(`${shelfNumber} heeft geen auteur (${worldCatUrl})\n`);
    }
    if (response.publishers) {
      response.publishers.forEach((item) => {
        const publication = [
          item.publisherName?.text,
          item.publicationPlace,
        ].filter(Boolean);
        if (publication.length) {
          data.publishers.push(publication.join(", "));
        }
      });
    }
    if (response.date?.publicationDate) {
      const content = response.date.publicationDate;
      data.years.push(content);
      if (content.length < 4 || content.includes("?")) {
        writer.write(
          `${shelfNumber} heeft als jaartal "${content}" (${worldCatUrl})\n`,
        );
      }
    }
    if (response.description?.summaries) {
      const content = response.description.summaries
        .map((item) => item.text)
        .filter((item): item is string => Boolean(item));
      data.descriptions.push(...content);
    }
    // Sometimes physicalDescription can be found in bibliographies property
    if (response.description?.bibliographies) {
      const content = response.description.bibliographies
        .map((item) => item.text)
        .filter((item): item is string => Boolean(item));
      data.descriptions.push(...content);
      writer.write(
        `${shelfNumber} bevat de volgende informatie onder "Bibliografieën": "${content.join(
          ", ",
        )}" (${worldCatUrl})\n`,
      );
    }
    if (response.description?.physicalDescription) {
      data.descriptions.push(response.description.physicalDescription);
    }
    if (response.description?.contents) {
      writer.write(
        `${shelfNumber} bevat informatie onder "Inhoud" (${worldCatUrl})\n`,
      );
    }
    // Contains references to other parts of the same volume
    if (response.note?.generalNotes) {
      response.note.generalNotes.forEach((item) => {
        if (item.text) {
          data.notes.push(item.text);
        }
      });
    }
    if (response.format?.generalFormat) {
      const parsedFormat =
        formats[response.format.generalFormat as keyof typeof formats];
      if (parsedFormat) {
        data.objectName = parsedFormat;
      } else {
        writer.write(
          `${shelfNumber} heeft een onbekend formaat "${response.format.generalFormat}" (${worldCatUrl})\n`,
        );
      }
    }
  }

  return data;
}

export function buildOclcMetadata(
  responses: SuccessResponse[],
  shelfNumber: string,
  options: OclcMetadataOptions = {},
): MetadataItem[] {
  const data = collectOclcMetadata(responses, shelfNumber);
  const skippedLabels = createSkippedMetadataLabelSet(options.skipMetadata);

  return oclcMetadataFields.flatMap((field) => {
    const label =
      typeof field.label === "function" ? field.label(data) : field.label;
    const value = field.getValue(data);

    if (
      !hasMetadataValue(value) ||
      shouldSkipMetadataItem(label, skippedLabels)
    ) {
      return [];
    }

    return [{ label, value }];
  });
}

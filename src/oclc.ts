import createClient, { type Middleware } from "openapi-fetch";
import { writer } from "./log.ts";
import { formatLabels } from "./formats.ts";
import { hasMetadataValue, isMetadataKey } from "./metadata.ts";

import type { paths } from "./types/openapi-schema.ts";
import type { InternationalString } from "@iiif/presentation-3";
import type { MetadataKey, MetadataValueMap } from "./metadata.ts";

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

type OclcMetadataSourceValue =
  | string[]
  | InternationalString
  | undefined;

function createMetadataValue(
  values: string[],
): InternationalString | undefined {
  const cleanedValues = values.map((value) => value.trim()).filter(Boolean);
  const uniqueValues = [...new Set(cleanedValues)];

  if (!uniqueValues.length) {
    return undefined;
  }

  return { none: uniqueValues };
}

function createSkippedMetadataKeySet(keys: string[] | undefined) {
  return new Set(keys?.filter(isMetadataKey));
}

function toMetadataValue(value: OclcMetadataSourceValue) {
  return Array.isArray(value) ? createMetadataValue(value) : value;
}

function getOclcMetadataEntries(
  metadataValues: Partial<Record<MetadataKey, OclcMetadataSourceValue>>,
) {
  return Object.entries(metadataValues) as [
    MetadataKey,
    OclcMetadataSourceValue,
  ][];
}

function getWorldCatUrl(identifier: number | string | undefined) {
  return identifier ? `${worldCatBaseUrl}${identifier}` : worldCatBaseUrl;
}

export function buildOclcMetadataValues(
  responses: SuccessResponse[],
  shelfNumber: string,
  options: OclcMetadataOptions = {},
): MetadataValueMap {
  const skippedKeys = createSkippedMetadataKeySet(options.skipMetadata);
  const oclcMetadataValues = {
    title: [] as string[],
    author: [] as string[],
    publisher: [] as string[],
    year: [] as string[],
    format: undefined as InternationalString | undefined,
    physical_description: [] as string[],
    notes: [] as string[],
    oclc_number: [] as string[],
    shelf_number: [shelfNumber.replaceAll("-", " ")],
  } satisfies Partial<Record<MetadataKey, OclcMetadataSourceValue>>;

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
      oclcMetadataValues.oclc_number.push(
        `<a href="${worldCatUrl}">${identifier}</a>`,
      );
    }
    oclcMetadataValues.title.push(...getOclcTitles(response));
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
          oclcMetadataValues.author.push(name);
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
          oclcMetadataValues.publisher.push(publication.join(", "));
        }
      });
    }
    if (response.date?.publicationDate) {
      const content = response.date.publicationDate;
      oclcMetadataValues.year.push(content);
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
      oclcMetadataValues.physical_description.push(...content);
    }
    // Sometimes physicalDescription can be found in bibliographies property
    if (response.description?.bibliographies) {
      const content = response.description.bibliographies
        .map((item) => item.text)
        .filter((item): item is string => Boolean(item));
      oclcMetadataValues.physical_description.push(...content);
      writer.write(
        `${shelfNumber} bevat de volgende informatie onder "Bibliografieën": "${content.join(
          ", ",
        )}" (${worldCatUrl})\n`,
      );
    }
    if (response.description?.physicalDescription) {
      oclcMetadataValues.physical_description.push(
        response.description.physicalDescription,
      );
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
          oclcMetadataValues.notes.push(item.text);
        }
      });
    }
    if (response.format?.generalFormat) {
      const parsedFormat =
        formatLabels[
          response.format.generalFormat as keyof typeof formatLabels
        ];
      if (parsedFormat) {
        oclcMetadataValues.format = parsedFormat;
      } else {
        writer.write(
          `${shelfNumber} heeft een onbekend formaat "${response.format.generalFormat}" (${worldCatUrl})\n`,
        );
      }
    }
  }

  return Object.fromEntries(
    getOclcMetadataEntries(oclcMetadataValues)
      .filter(([key]) => !skippedKeys.has(key))
      .map(([key, value]) => [key, toMetadataValue(value)] as const)
      .filter((entry): entry is [MetadataKey, InternationalString] =>
        hasMetadataValue(entry[1]),
      ),
  ) as MetadataValueMap;
}

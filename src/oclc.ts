import createClient, { type Middleware } from "openapi-fetch";
import { writer } from "./log.ts";
import { formats } from "./formats.ts";

import type { paths } from "./types/openapi-schema.ts";
import type { InternationalString, MetadataItem } from "@iiif/presentation-3";

type SuccessResponse =
  paths["/bibs/{oclcNumber}"]["get"]["responses"][200]["content"]["application/json"];

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

export function buildOclcMetadata(
  responses: SuccessResponse[],
  shelfNumber: string,
): MetadataItem[] {
  const oclcLinks: string[] = [];
  const titles: string[] = [];
  const contributors: string[] = [];
  const publishers: string[] = [];
  const years: string[] = [];
  const descriptions: string[] = [];
  const notes: string[] = [];
  let objectName: InternationalString = { none: ["n/a"] };

  // Todo: process language:
  //     "language": {
  //       "itemLanguage": "dut",
  //       "catalogingLanguage": "dut"
  //   },

  if (responses.length > 1) {
    const urls = responses.map(
      (response) => worldCatBaseUrl + response.identifier?.oclcNumber,
    );
    writer.write(
      `${shelfNumber} heeft meerdere OCLC nummers (${urls.join(", ")})\n`,
    );
  }

  for (const response of responses) {
    const identifier = response.identifier?.oclcNumber;
    const worldCatUrl = worldCatBaseUrl + identifier;
    if (identifier) {
      oclcLinks.push(`<a href="${worldCatUrl}">${identifier}</a>`);
    }
    if (response.title?.mainTitles) {
      response.title.mainTitles.forEach((item) => {
        if (item.text) {
          titles.push(item.text);
        }
      });
    }
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
          contributors.push(name);
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
          publishers.push(publication.join(", "));
        }
      });
    }
    if (response.date?.publicationDate) {
      const content = response.date.publicationDate;
      years.push(content);
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
      descriptions.push(...content);
    }
    // Sometimes physicalDescription can be found in bibliographies property
    if (response.description?.bibliographies) {
      const content = response.description.bibliographies
        .map((item) => item.text)
        .filter((item): item is string => Boolean(item));
      descriptions.push(...content);
      writer.write(
        `${shelfNumber} bevat de volgende informatie onder "Bibliografieën": "${content.join(
          ", ",
        )}" (${worldCatUrl})\n`,
      );
    }
    if (response.description?.physicalDescription) {
      descriptions.push(response.description.physicalDescription);
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
          notes.push(item.text);
        }
      });
    }
    if (response.format?.generalFormat) {
      const parsedFormat =
        formats[response.format.generalFormat as keyof typeof formats];
      if (parsedFormat) {
        objectName = parsedFormat;
      } else {
        writer.write(
          `${shelfNumber} heeft een onbekend formaat "${response.format.generalFormat}" (${worldCatUrl})\n`,
        );
      }
    }
  }

  return [
    {
      label: {
        en: ["Title"],
        nl: ["Titel"],
      },
      value: { none: titles.length ? titles : ["n/a"] },
    },
    {
      label: {
        en: contributors.length <= 1 ? ["Author"] : ["Authors"],
        nl: contributors.length <= 1 ? ["Auteur"] : ["Auteurs"],
      },
      value: {
        none: contributors.length ? [...new Set(contributors)] : ["n/a"],
      },
    },
    {
      label: {
        en: ["Publication"],
        nl: ["Publicatie"],
      },
      value: { none: publishers.length ? [...new Set(publishers)] : ["n/a"] },
    },
    {
      label: {
        en: ["Year"],
        nl: ["Jaar"],
      },
      value: { none: years.length ? [...new Set(years)] : ["n/a"] },
    },
    {
      label: {
        en: ["Object name"],
        nl: ["Objectnaam"],
      },
      value: objectName,
    },
    {
      label: {
        en: ["Physical description"],
        nl: ["Fysieke beschrijving"],
      },
      value: { none: descriptions.length ? descriptions : ["n/a"] },
    },
    {
      label: {
        en: ["Notes"],
        nl: ["Opmerkingen"],
      },
      value: { none: notes.length ? notes : ["n/a"] },
    },
    {
      label: {
        en: oclcLinks.length <= 1 ? ["OCLC number"] : ["OCLC numbers"],
        nl: oclcLinks.length <= 1 ? ["OCLC nummer"] : ["OCLC nummers"],
      },
      value: { none: oclcLinks.length ? oclcLinks : ["n/a"] },
    },
    {
      label: { en: ["Shelf number"], nl: ["Plaatsnummer"] },
      value: { none: [shelfNumber.replaceAll("-", " ")] },
    },
  ];
}

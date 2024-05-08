import createClient, { type Middleware } from "openapi-fetch";
import { writer } from "./log.ts";
import type { paths } from "./types/openapi-schema.ts";
import { formats } from "./formats.ts";

type SuccessResponse =
  paths["/bibs/{oclcNumber}"]["get"]["responses"][200]["content"]["application/json"];

const worldCatBase = "https://tudelft.on.worldcat.org/oclc/";
let accessToken: string | undefined = undefined;

async function getToken() {
  const apiKey = Bun.env.OCLC_SEARCH_API_TOKEN;
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

export function processOclcMetadata(
  respArray: SuccessResponse[],
  shelfNumber: string
) {
  const oclcNumber = new Array();
  const title = new Array();
  const contributor = new Array();
  const publisher = new Array();
  const year = new Array();
  const description = new Array();
  const notes = new Array();
  const format = new Array();

  if (respArray.length > 1) {
    const urls = respArray.map((i) => worldCatBase + i.identifier?.oclcNumber);
    writer.write(
      `${shelfNumber} heeft meerdere OCLC nummers (${urls.join(", ")})\n`
    );
  }

  for (const resp of respArray) {
    const url = worldCatBase + resp.identifier?.oclcNumber;
    oclcNumber.push(`<a href="${url}">${resp.identifier?.oclcNumber}</a>`);
    if (resp.title?.mainTitles) {
      resp.title.mainTitles.forEach((item) => title.push(item.text));
    }
    // Alternative: resp.contributor.statementOfResponsibility
    if (resp.contributor?.creators) {
      resp.contributor.creators.forEach((item) => {
        let name = null;
        if (item.nonPersonName?.text) {
          name = item.nonPersonName?.text;
        } else if (item.firstName?.text && item.secondName?.text) {
          name = item.firstName?.text + " " + item.secondName?.text;
        } else if (item.firstName?.text) {
          name = item.firstName?.text;
          writer.write(
            `${shelfNumber} heeft een auteur met alleen een voornaam (${url})\n`
          );
        } else if (item.secondName?.text) {
          name = item.secondName?.text;
          writer.write(
            `${shelfNumber} heeft een auteur met alleen een achternaam (${url})\n`
          );
        }
        if (name && item.creatorNotes) {
          name = name.concat(" (", item.creatorNotes.join(", "), ")");
        }
        contributor.push(name);
      });
    } else {
      writer.write(`${shelfNumber} heeft geen auteur (${url})\n`);
    }
    if (resp.publishers) {
      resp.publishers.forEach((item) =>
        publisher.push(item.publisherName?.text + ", " + item.publicationPlace)
      );
    }
    if (resp.date?.publicationDate) {
      const content = resp.date.publicationDate;
      year.push(content);
      if (content.length < 4 || content.includes("?")) {
        writer.write(
          `${shelfNumber} heeft als jaartal "${content}" (${url})\n`
        );
      }
    }
    // Sometimes physicalDescription can be found in bibliographies property
    if (resp.description?.bibliographies) {
      const content = resp.description.bibliographies.map((item) => item.text);
      content.forEach((item) => description.push(item));
      writer.write(
        `${shelfNumber} bevat de volgende informatie onder "Bibliografieën": "${content.join(
          ", "
        )}" (${url})\n`
      );
    } else if (resp.description?.physicalDescription) {
      description.push(resp.description.physicalDescription);
    }
    if (resp.description?.contents) {
      writer.write(`${shelfNumber} bevat informatie onder "Inhoud" (${url})\n`);
    }
    // Contains references to other parts of the same volume
    if (resp.note?.generalNotes) {
      resp.note.generalNotes.forEach((item) => notes.push(item.text));
    }
    if (resp.format?.generalFormat) {
      const betterFormat = formats[resp.format.generalFormat];
      format.push(betterFormat);
    }
  }

  return [
    {
      label: {
        en: ["Title"],
        nl: ["Titel"],
      },
      value: { none: title.length ? title : [""] },
    },
    {
      label: {
        en: contributor.length <= 1 ? ["Contributor"] : ["Contributors"],
        nl: contributor.length <= 1 ? ["Maker"] : ["Makers"],
      },
      value: { none: contributor.length ? [...new Set(contributor)] : [""] },
    },
    {
      label: {
        en: ["Publisher"],
        nl: ["Uitgever"],
      },
      value: { none: publisher.length ? [...new Set(publisher)] : [""] },
    },
    {
      label: {
        en: ["Year"],
        nl: ["Jaar"],
      },
      value: { none: year.length ? [...new Set(year)] : [""] },
    },
    {
      label: {
        en: ["Format"],
        nl: ["Formaat"],
      },
      value: { none: format.length ? [...new Set(format)] : [""] },
    },
    {
      label: {
        en: ["Description"],
        nl: ["Omschrijving"],
      },
      value: { none: description.length ? description : [""] },
    },
    {
      label: {
        en: ["Notes"],
        nl: ["Noot"],
      },
      value: { none: notes.length ? notes : [""] },
    },
    {
      label: {
        en: oclcNumber.length <= 1 ? ["OCLC Number"] : ["OCLC Numbers"],
        nl: oclcNumber.length <= 1 ? ["OCLC nummer"] : ["OCLC nummers"],
      },
      value: { none: oclcNumber.length ? oclcNumber : [""] },
    },
    {
      label: { en: ["Shelf Number"], nl: ["Plaatsnummer"] },
      value: { none: [shelfNumber.replaceAll("-", " ")] },
    },
  ];
}

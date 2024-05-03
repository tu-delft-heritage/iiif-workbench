import type { paths } from "./types/openapi-schema.ts";
import createClient, { type Middleware } from "openapi-fetch";

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

export async function fetchMetadata(oclcNumber: number) {
  return await client.GET("/bibs/{oclcNumber}", {
    params: {
      path: { oclcNumber },
    },
  });
}

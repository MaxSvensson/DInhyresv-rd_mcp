import { writeFileSync, existsSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ENV_PATH = join(__dirname, "../.env");
export const BASE_URL = "https://publicapilandlord.azurewebsites.net";

let tokenCache = null;
let tokenExpiry = null;

export function hasCredentials() {
  return !!(process.env.DH_USERNAME && process.env.DH_PASSWORD);
}

export async function testAndSaveCredentials(username, password) {
  const res = await fetch(`${BASE_URL}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    throw new Error(`Invalid credentials: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const token = data.token ?? data.access_token ?? data.accessToken;
  if (!token) throw new Error("No token in auth response");

  // Save to .env
  writeFileSync(ENV_PATH, `DH_USERNAME=${username}\nDH_PASSWORD=${password}\n`);

  // Update process env and cache for this session
  process.env.DH_USERNAME = username;
  process.env.DH_PASSWORD = password;
  tokenCache = token;
  tokenExpiry = Date.now() + 50 * 60 * 1000;
}

export async function getToken() {
  if (tokenCache && tokenExpiry && Date.now() < tokenExpiry) {
    return tokenCache;
  }

  const username = process.env.DH_USERNAME;
  const password = process.env.DH_PASSWORD;

  if (!username || !password) {
    throw new Error("NOT_CONFIGURED");
  }

  const res = await fetch(`${BASE_URL}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    throw new Error(`Authentication failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  tokenCache = data.token ?? data.access_token ?? data.accessToken;

  if (!tokenCache) {
    throw new Error("No token found in auth response: " + JSON.stringify(data));
  }

  tokenExpiry = Date.now() + 50 * 60 * 1000;
  return tokenCache;
}

export async function apiFetch(path, { method = "GET", query = {}, body } = {}) {
  const token = await getToken();

  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept-Language": "en-GB",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API error ${res.status}: ${text || res.statusText}`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return res.json();
  }
  const buf = await res.arrayBuffer();
  return { _binary: true, contentType, data: Buffer.from(buf).toString("base64") };
}

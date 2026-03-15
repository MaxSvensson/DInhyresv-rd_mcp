const BASE_URL = "https://publicapilandlord.azurewebsites.net";

let tokenCache = null;
let tokenExpiry = null;

export async function getToken() {
  if (tokenCache && tokenExpiry && Date.now() < tokenExpiry) {
    return tokenCache;
  }

  const username = process.env.DH_USERNAME;
  const password = process.env.DH_PASSWORD;

  if (!username || !password) {
    throw new Error("DH_USERNAME and DH_PASSWORD environment variables are required");
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

  // Cache for 50 minutes (tokens typically last 60)
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
  // For PDFs etc., return base64
  const buf = await res.arrayBuffer();
  return { _binary: true, contentType, data: Buffer.from(buf).toString("base64") };
}

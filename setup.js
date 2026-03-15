import { createInterface } from "readline";
import { writeFileSync, existsSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = join(__dirname, ".env");
const BASE_URL = "https://publicapilandlord.azurewebsites.net";

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

async function testCredentials(username, password) {
  const res = await fetch(`${BASE_URL}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.token ?? data.access_token ?? data.accessToken ?? null;
}

function parseEnv(content) {
  const vars = {};
  for (const line of content.split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) vars[match[1].trim()] = match[2].trim();
  }
  return vars;
}

console.log("\n=== DinHyresvärd MCP Setup ===\n");

// Check if already configured
if (existsSync(ENV_PATH)) {
  const existing = parseEnv(readFileSync(ENV_PATH, "utf8"));
  if (existing.DH_USERNAME && existing.DH_PASSWORD) {
    const overwrite = await ask(
      `Credentials already saved for user "${existing.DH_USERNAME}". Overwrite? (y/N): `
    );
    if (overwrite.trim().toLowerCase() !== "y") {
      console.log("Keeping existing credentials.");
      rl.close();
      process.exit(0);
    }
  }
}

const username = await ask("Username: ");
// Hide password input
process.stdout.write("Password: ");
process.stdin.setRawMode?.(true);
let password = "";
process.stdin.resume();
process.stdin.setEncoding("utf8");
await new Promise((res) => {
  process.stdin.on("data", function handler(ch) {
    if (ch === "\r" || ch === "\n") {
      process.stdin.setRawMode?.(false);
      process.stdin.removeListener("data", handler);
      process.stdout.write("\n");
      res();
    } else if (ch === "\u0003") {
      process.exit();
    } else if (ch === "\u007f") {
      if (password.length > 0) {
        password = password.slice(0, -1);
        process.stdout.write("\b \b");
      }
    } else {
      password += ch;
      process.stdout.write("*");
    }
  });
});

process.stdout.write("Testing credentials... ");

const token = await testCredentials(username, password);
if (!token) {
  console.log("FAILED\n\nInvalid username or password. Please try again.");
  rl.close();
  process.exit(1);
}

console.log("OK\n");

writeFileSync(ENV_PATH, `DH_USERNAME=${username}\nDH_PASSWORD=${password}\n`);
console.log(`Credentials saved to .env\nYou can now start the MCP server with: npm start\n`);

rl.close();

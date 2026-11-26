import { google } from "googleapis";
import fs from "node:fs";
import http from "node:http";
import { URL } from "node:url";
import { CREDENTIALS_PATH, TOKEN_PATH, SCOPES } from "./lib/config.js";

const PORT = Number(process.env.GOOGLE_CHAT_AUTH_PORT || 8091);
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

if (!fs.existsSync(CREDENTIALS_PATH)) {
  console.error(
    `Missing ${CREDENTIALS_PATH}. Download your "Desktop app" OAuth client JSON from ` +
      `Google Cloud Console > APIs & Services > Credentials, and save it at that path ` +
      `(or point GOOGLE_CHAT_CREDENTIALS at it).`
  );
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf8"));
const clientConfig = raw.installed || raw.web;
if (!clientConfig) {
  console.error('Unrecognized credentials file (expected an "installed" Desktop app client).');
  process.exit(1);
}

const oAuth2Client = new google.auth.OAuth2(clientConfig.client_id, clientConfig.client_secret, REDIRECT_URI);

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: SCOPES,
});

console.log("\nThis will request the following Google Chat permissions:");
for (const s of SCOPES) console.log(`  - ${s}`);
console.log("\nOpen this URL in your browser and sign in with your Google account:\n");
console.log(authUrl + "\n");
console.log(`Waiting for the browser redirect on ${REDIRECT_URI} ...`);

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.pathname !== "/oauth2callback") {
      res.writeHead(404).end();
      return;
    }
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");

    if (error || !code) {
      res
        .writeHead(400, { "Content-Type": "text/html" })
        .end(`<h1>Authorization failed</h1><p>${escapeHtml(error || "No code returned")}</p>`);
      console.error(`Authorization failed: ${error || "no code returned"}`);
      server.close();
      process.exit(1);
    }

    const { tokens } = await oAuth2Client.getToken(code);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2), { mode: 0o600 });

    res
      .writeHead(200, { "Content-Type": "text/html" })
      .end("<h1>Success</h1><p>You can close this tab and go back to the terminal.</p>");

    console.log(`\nSaved token to ${TOKEN_PATH}. You can now run: npm start`);
    server.close();
    process.exit(0);
  } catch (err) {
    console.error("Failed to exchange code for token:", err.message);
    res.writeHead(500).end("Token exchange failed, check the terminal.");
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, "127.0.0.1");

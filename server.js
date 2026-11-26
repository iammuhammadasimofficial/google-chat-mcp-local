#!/usr/bin/env node
import { google } from "googleapis";
import fs from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./lib/tools.js";
import { CREDENTIALS_PATH, TOKEN_PATH, MISSING_CREDENTIALS_MESSAGE, saveToken } from "./lib/config.js";

// stdout is reserved for the MCP protocol, so all diagnostics go to stderr.
function fail(msg) {
  console.error(msg);
  process.exit(1);
}

if (!fs.existsSync(CREDENTIALS_PATH)) {
  fail(MISSING_CREDENTIALS_MESSAGE);
}
if (!fs.existsSync(TOKEN_PATH)) {
  fail(`Missing token file ${TOKEN_PATH}. Sign in first with: npx -y google-chat-mcp-local auth`);
}

const raw = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf8"));
const clientConfig = raw.installed || raw.web;
if (!clientConfig) fail("Unrecognized credentials file (expected a Desktop app OAuth client).");
const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));

const oAuth2Client = new google.auth.OAuth2(clientConfig.client_id, clientConfig.client_secret);
oAuth2Client.setCredentials(token);

// Persist refreshed access tokens so future runs reuse them.
oAuth2Client.on("tokens", (newTokens) => {
  const merged = { ...token, ...newTokens };
  saveToken(merged);
});

const chat = google.chat({ version: "v1", auth: oAuth2Client });

const server = new McpServer({ name: "google-chat-local", version: "1.0.0" });
registerTools(server, chat);

const transport = new StdioServerTransport();
await server.connect(transport);

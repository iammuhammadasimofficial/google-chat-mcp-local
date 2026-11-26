#!/usr/bin/env node
import fs from "node:fs";

const USAGE = `google-chat-mcp-local: a local Google Chat MCP server (stdio)

Usage:
  google-chat-mcp-local [start]   Run the MCP server on stdio (default)
  google-chat-mcp-local auth      Sign in with Google and save your token
  google-chat-mcp-local --help    Show this help
  google-chat-mcp-local --version Show the version

Files (in ~/.google-chat-mcp/):
  credentials.json   your Google "Desktop app" OAuth client (you provide it)
  token.json         created by "auth"

Environment overrides: GOOGLE_CHAT_CREDENTIALS, GOOGLE_CHAT_TOKEN, GOOGLE_CHAT_AUTH_PORT
`;

const arg = process.argv[2];

if (arg === "--help" || arg === "-h" || arg === "help") {
  process.stdout.write(USAGE);
} else if (arg === "--version" || arg === "-v") {
  const pkg = JSON.parse(fs.readFileSync(new URL("./package.json", import.meta.url), "utf8"));
  process.stdout.write(pkg.version + "\n");
} else if (arg === "auth") {
  await import("./auth.js");
} else if (arg === undefined || arg === "start") {
  await import("./server.js");
} else {
  process.stderr.write(`Unknown command: ${arg}\n\n${USAGE}`);
  process.exit(1);
}

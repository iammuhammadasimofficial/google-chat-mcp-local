import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Per-user config folder: ~/.google-chat-mcp/
export const CONFIG_DIR = path.join(os.homedir(), ".google-chat-mcp");

const DEFAULT_CREDENTIALS = path.join(CONFIG_DIR, "credentials.json");
const DEFAULT_TOKEN = path.join(CONFIG_DIR, "token.json");

// Resolution order: environment variable, then (legacy) file in the current folder,
// then the per-user folder. Paths are absolute so they behave the same on every OS.
function resolvePath(envName, legacyName, defaultPath) {
  if (process.env[envName]) return path.resolve(process.env[envName]);
  const legacy = path.resolve(legacyName);
  if (fs.existsSync(legacy)) {
    console.error(`google-chat-mcp-local: using ${legacy} from the current folder (legacy location). Preferred: ${defaultPath}`);
    return legacy;
  }
  return defaultPath;
}

export const CREDENTIALS_PATH = resolvePath("GOOGLE_CHAT_CREDENTIALS", "./credentials.json", DEFAULT_CREDENTIALS);
export const TOKEN_PATH = resolvePath("GOOGLE_CHAT_TOKEN", "./token.json", DEFAULT_TOKEN);

export const MISSING_CREDENTIALS_MESSAGE =
  `Missing credentials file. Save your Google "Desktop app" OAuth client JSON as:\n  ${DEFAULT_CREDENTIALS}\n` +
  `(or set GOOGLE_CHAT_CREDENTIALS to its path). Currently looking at: ${CREDENTIALS_PATH}\n` +
  `See the README for the Google Cloud setup steps.`;

// Writes the token, creating the config folder with owner-only permissions if needed.
export function saveToken(tokens) {
  const dir = path.dirname(TOKEN_PATH);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2), { mode: 0o600 });
  // `mode` only applies when the file is created, so tighten an existing file too.
  // On Windows this is a no-op; the file is protected by your user profile's permissions.
  try {
    fs.chmodSync(TOKEN_PATH, 0o600);
    fs.chmodSync(dir, 0o700);
  } catch {
    // ignore: some file systems do not support POSIX permissions
  }
}

// Only the scopes the tools need:
//  - chat.spaces.readonly : list_spaces
//  - chat.messages        : list_messages, send_message (incl. attachments), update_message,
//                           delete_message, add_reaction, download_attachment
export const SCOPES = [
  "https://www.googleapis.com/auth/chat.spaces.readonly",
  "https://www.googleapis.com/auth/chat.messages",
];

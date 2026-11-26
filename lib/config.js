import path from "node:path";

// Paths are resolved to absolute paths, so they behave the same on Windows, macOS and Linux.
export const CREDENTIALS_PATH = path.resolve(process.env.GOOGLE_CHAT_CREDENTIALS || "./credentials.json");
export const TOKEN_PATH = path.resolve(process.env.GOOGLE_CHAT_TOKEN || "./token.json");

// Only the scopes the tools need:
//  - chat.spaces.readonly : list_spaces
//  - chat.messages        : list_messages, send_message (incl. attachments), update_message,
//                           delete_message, add_reaction
export const SCOPES = [
  "https://www.googleapis.com/auth/chat.spaces.readonly",
  "https://www.googleapis.com/auth/chat.messages",
];

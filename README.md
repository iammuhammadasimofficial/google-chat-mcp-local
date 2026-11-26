# google-chat-mcp-local

## What it is

`google-chat-mcp-local` is a small [MCP](https://modelcontextprotocol.io) server that lets an AI assistant (such as Claude) work with your Google Chat: list your spaces and direct messages, read messages and threads, send replies with real @mentions and file attachments, react to messages, and edit or delete your own messages. It runs as a program on your own computer and signs in with your own Google account.

## Why local is safer

- It runs only on your machine and talks to your MCP client over stdio (no network port is opened for the server).
- It calls Google's official Google Chat API (`googleapis.com`) directly, using a Google OAuth client that you create.
- There is no third-party server and no hosted service. Nobody else stores your messages or your tokens.
- Your sign-in token stays on your disk in `~/.google-chat-mcp/`.
- You choose exactly two permissions (scopes): `chat.spaces.readonly` and `chat.messages`.
- You can revoke access at any time at https://myaccount.google.com/permissions.
- It is open source. The whole thing is about 300 lines of code that anyone can read.

## Advantages over hosted or cloud Google Chat connectors

Compared with many hosted connectors:

- **No repeated sign-in prompts.** The refresh token is stored locally and refreshed automatically.
- **Full feature set.** List spaces and DMs, read messages and threads, send in threads, real @mentions, upload file attachments, read and download attachments, react, edit and delete your messages.
- **Works in any MCP client.** Claude Desktop, Claude Code and others.
- **No extra cost or third-party account.** You only need a Google account and a free Google Cloud project.

## Quick start with npx

You need [Node.js](https://nodejs.org) 18 or newer. There is nothing to install or build: `npx` downloads and runs the package.

### 1. Google Cloud setup (one time)

1. Go to https://console.cloud.google.com and create a project (or pick an existing one).
2. Enable the **Google Chat API** (APIs & Services > Library > "Google Chat API" > Enable). Also open its **Configuration** tab and give the Chat app a name (required by Google, it is not published).
3. Set up the **OAuth consent screen** (APIs & Services > OAuth consent screen). Choose **Internal** if you use Google Workspace and want only your organization, otherwise **External** and add your own Google account under **Test users**.
4. Create credentials: APIs & Services > Credentials > Create credentials > **OAuth client ID** > Application type **Desktop app**.
5. Download the JSON file and save it as:
   - Windows: `C:\Users\<you>\.google-chat-mcp\credentials.json`
   - macOS / Linux: `~/.google-chat-mcp/credentials.json`

   Create the `.google-chat-mcp` folder if it does not exist.

### 2. Sign in

```
npx -y google-chat-mcp-local auth
```

Open the printed link, sign in, and approve the two permissions. The token is saved to `~/.google-chat-mcp/token.json`.

### 3. Add it to your MCP client

**Claude Desktop**: add this to `claude_desktop_config.json` and restart Claude Desktop.

```json
{
  "mcpServers": {
    "google-chat": {
      "command": "npx",
      "args": ["-y", "google-chat-mcp-local"]
    }
  }
}
```

**Claude Code**:

```
claude mcp add google-chat -- npx -y google-chat-mcp-local
```

## Install from GitHub source

To run the latest code without npm, `npx -y github:iammuhammadasimofficial/google-chat-mcp-local` (and `... auth`) works too. To work on the code:

```
git clone https://github.com/iammuhammadasimofficial/google-chat-mcp-local.git
cd google-chat-mcp-local
npm install
npm run auth     # sign in
npm start        # run the server
```

For clients, point the command at `node` with the full path to `cli.js`, for example `"command": "node", "args": ["/path/to/google-chat-mcp-local/cli.js"]`.

Settings:

| Variable | Meaning | Default |
|---|---|---|
| `GOOGLE_CHAT_CREDENTIALS` | Path to the OAuth client JSON | `~/.google-chat-mcp/credentials.json` |
| `GOOGLE_CHAT_TOKEN` | Path to the saved token | `~/.google-chat-mcp/token.json` |
| `GOOGLE_CHAT_AUTH_PORT` | Local port for the sign-in redirect | `8091` |

For backward compatibility, if `credentials.json` or `token.json` exist in the current folder and the variables are not set, they are used and a note is printed on stderr.

CLI: `google-chat-mcp-local [start]`, `google-chat-mcp-local auth`, `--help`, `--version`.

## Tools reference

| Tool | What it does |
|---|---|
| `list_spaces` | List your spaces and DMs. |
| `list_messages` | List recent messages in a space, optionally only one thread (`threadName`). Each message shows its sender, text, time, `threadName` and attachments (name, contentName, contentType, resourceName). |
| `send_message` | Send a message, optionally inside a thread. `@Full Name` is turned into a real mention when the person is found in recent history. Optional `attachmentPaths` uploads local files. |
| `download_attachment` | Save a message attachment to a folder (default `~/Downloads`). Give `resourceName`, or `messageName` plus `index`. Returns the saved path, size and MIME type. |
| `add_reaction` | Add an emoji reaction to a message. |
| `update_message` | Edit a message you sent. |
| `delete_message` | Delete a message you sent. |

Scopes: only `chat.spaces.readonly` and `chat.messages`. The `chat.messages` scope already covers downloading attachments, so no extra scope is needed.

## Safety notes and permissions

- `token.json` lets whoever holds it read and send Google Chat messages as you, within the two scopes above. Keep it private and never commit or share it. The folder is created owner-only where the OS supports it.
- Everything the assistant sends is sent as you, under your name. Review what it plans to send, especially messages to many people.
- `delete_message` is permanent.
- `download_attachment` writes files to your disk. Treat downloaded files like any file from the internet.
- To stop all access, remove the app at https://myaccount.google.com/permissions and delete `~/.google-chat-mcp/token.json`.

## Troubleshooting

- **"Missing credentials file"**: save your Desktop app OAuth client JSON as `~/.google-chat-mcp/credentials.json` (the error message prints the exact path).
- **"Missing token file"**: run the `auth` command again.
- **"Access blocked" or "app not verified"**: on an External consent screen, add your account under Test users.
- **403 or "Chat app not found"**: enable the Google Chat API and fill in its Configuration tab.
- **Port 8091 in use during sign-in**: set `GOOGLE_CHAT_AUTH_PORT` to another port and add that redirect if your client requires it.
- **Token expired every week**: External apps in Testing mode expire refresh tokens after 7 days. Publish the consent screen or use Internal, then sign in again.
- **Nothing shows in the client**: restart the client and check its MCP logs. The server writes diagnostics to stderr only.

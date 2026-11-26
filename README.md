# google-chat-mcp-local

A small **local MCP server for Google Chat**. It lets an AI assistant that supports the
[Model Context Protocol](https://modelcontextprotocol.io) (Claude Desktop, Claude Code, and others)
list your Chat spaces, read messages, send replies in threads, react, edit and delete.

- It is **not an official Google product**.
- It runs **on your own machine** over stdio. There is no hosted service.
- It signs in **as you**, using your own Google OAuth client. That is why it can read and send
  messages as you, and why you should treat it carefully (see Safety).

## Safety notes

- `token.json` gives access to your Google Chat. Keep it private and never commit or share it.
  The same goes for `credentials.json` (your OAuth client secret). Both are in `.gitignore`.
- Anything the assistant sends is sent **as you**, and others will see it as coming from you.
  Review what your assistant is about to send.
- You can revoke access at any time at <https://myaccount.google.com/permissions>.
- Only these permissions are requested (see `lib/config.js`):
  - `https://www.googleapis.com/auth/chat.spaces.readonly` to list spaces
  - `https://www.googleapis.com/auth/chat.messages` to read, send, edit, delete and react to messages

## Prerequisites

- Node.js 18 or newer
- A Google account with access to Google Chat
- A Google Cloud project (free) where you create the OAuth client

## Setup

### 1. Create a Google Cloud project and enable the Chat API

1. Go to <https://console.cloud.google.com/> and create a project (or pick an existing one).
2. Open **APIs & Services > Library**, search for **Google Chat API** and click **Enable**.

### 2. Configure the OAuth consent screen

1. Open **APIs & Services > OAuth consent screen** (in newer consoles: **Google Auth Platform**).
2. Choose the user type:
   - **Internal** if you use Google Workspace and only your organisation will use it.
   - **External** otherwise. While the app is in "Testing", add your own Google account under
     **Test users**.
3. Fill in the app name and your email, then save. Adding the scopes here is optional.

### 3. Create the OAuth client (Desktop app)

1. Open **APIs & Services > Credentials > Create credentials > OAuth client ID**.
2. Application type: **Desktop app**. Name it anything.
3. Click **Download JSON** and save the file as `credentials.json` in this folder
   (or anywhere, and set `GOOGLE_CHAT_CREDENTIALS`, see below).

Note: in a Google Workspace organisation, an admin may need to allow the app (or allow
third-party / internal apps to access Chat data) before you can sign in.

### 4. Install and sign in

```bash
npm install
npm run auth
```

`npm run auth` prints a URL. Open it, sign in, and approve the permissions. The tool listens on
`http://localhost:8091/oauth2callback` (change with `GOOGLE_CHAT_AUTH_PORT`) and saves `token.json`.

### 5. Configuration

| Variable | Default | Meaning |
|---|---|---|
| `GOOGLE_CHAT_CREDENTIALS` | `./credentials.json` | Path to the OAuth client JSON |
| `GOOGLE_CHAT_TOKEN` | `./token.json` | Path where the token is saved and read |
| `GOOGLE_CHAT_AUTH_PORT` | `8091` | Local port for the sign-in redirect (`npm run auth` only) |

Relative paths are resolved from the folder the server is started in, so use **absolute paths**
when connecting a client.

## Connect it to a client

### Claude Desktop

Edit `claude_desktop_config.json` (Settings > Developer > Edit Config) and add the server.

Windows:

```json
{
  "mcpServers": {
    "google-chat": {
      "command": "node",
      "args": ["C:\\Users\\you\\google-chat-mcp-local\\server.js"],
      "env": {
        "GOOGLE_CHAT_CREDENTIALS": "C:\\Users\\you\\google-chat-mcp-local\\credentials.json",
        "GOOGLE_CHAT_TOKEN": "C:\\Users\\you\\google-chat-mcp-local\\token.json"
      }
    }
  }
}
```

macOS:

```json
{
  "mcpServers": {
    "google-chat": {
      "command": "node",
      "args": ["/Users/you/google-chat-mcp-local/server.js"],
      "env": {
        "GOOGLE_CHAT_CREDENTIALS": "/Users/you/google-chat-mcp-local/credentials.json",
        "GOOGLE_CHAT_TOKEN": "/Users/you/google-chat-mcp-local/token.json"
      }
    }
  }
}
```

Restart Claude Desktop afterwards.

### Claude Code

```bash
claude mcp add google-chat \
  -e GOOGLE_CHAT_CREDENTIALS=/abs/path/credentials.json \
  -e GOOGLE_CHAT_TOKEN=/abs/path/token.json \
  -- node /abs/path/server.js
```

### Any other MCP client

Run `node /abs/path/server.js` as a stdio server, with the two environment variables set. The
server name is `google-chat-local`.

## Tools

| Tool | What it does |
|---|---|
| `list_spaces` | Lists the spaces (rooms and direct messages) you are in |
| `list_messages` | Lists recent messages in a space, newest first, with sender, text, time and thread name |
| `send_message` | Sends a message to a space. Pass `threadName` to reply in a thread, and `attachmentPaths` to attach local images or PDFs. Writing `@Full Name` is turned into a real mention when that person appears in recent history of the space |
| `update_message` | Edits the text of a message you sent |
| `delete_message` | Deletes a message you sent |
| `add_reaction` | Adds an emoji reaction to a message |

Spaces are identified as `spaces/SPACE_ID`; get them from `list_spaces`.

## Troubleshooting

- **Token expired or revoked, or `invalid_grant`:** delete `token.json` and run `npm run auth` again.
  (If your consent screen is External and in "Testing", Google expires refresh tokens after 7 days.
  Publish the app, or just re-run the sign-in.)
- **403 `insufficient authentication scopes`:** the token was created with other scopes. Delete it and
  re-run `npm run auth`.
- **403 / "access blocked" at sign-in in a Workspace org:** an admin policy is blocking the app. Ask an
  admin to allow it. In External + Testing mode, make sure your account is listed under Test users.
- **404 or "Chat app not found":** make sure the Google Chat API is enabled in the same project as
  your OAuth client. This server acts as you through OAuth, so it does not need a Chat app to be
  published. If a call still complains about app configuration, open the Chat API "Configuration"
  page in the Cloud console and save a basic app configuration for the project.
- **`Missing ... credentials.json` / `token.json`:** use absolute paths in the environment variables.
- **Port 8091 already in use during sign-in:** set `GOOGLE_CHAT_AUTH_PORT` to another port.

## License

MIT. See [LICENSE](LICENSE).

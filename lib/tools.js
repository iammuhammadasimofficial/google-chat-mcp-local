import { z } from "zod";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";

const MIME_BY_EXT = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

// Uploads local files to a space (Google Chat media.upload) and returns the attachment
// references to put on a message. Works because the files are on disk (local stdio
// server).
export async function uploadAttachments(chat, spaceName, filePaths = []) {
  const attachments = [];
  for (const filePath of filePaths) {
    const ext = path.extname(filePath).toLowerCase();
    const res = await chat.media.upload({
      parent: spaceName,
      requestBody: { filename: path.basename(filePath) },
      media: { mimeType: MIME_BY_EXT[ext] || "application/octet-stream", body: fs.createReadStream(filePath) },
    });
    attachments.push({ attachmentDataRef: res.data.attachmentDataRef });
  }
  return attachments;
}

// Reduces a message's attachments to the fields a caller needs, including the resource
// name that download_attachment accepts.
export function summarizeAttachments(m) {
  return (m.attachment || []).map((a, index) => ({
    index,
    name: a.name,
    contentName: a.contentName,
    contentType: a.contentType,
    source: a.source,
    resourceName: a.attachmentDataRef?.resourceName,
  }));
}

// Registers every Google Chat tool on the given MCP server (used by server.js).
export function registerTools(server, chat) {
  // Google Chat's members.list doesn't return display names (privacy restriction for
  // user-authenticated apps), so to turn "@Full Name" into a real, notifying mention we
  // mine recent message history: past mentions carry both the "@Full Name" text and the
  // resolved numeric user ID together as an annotation.
  async function buildNameDirectory(spaceName, maxPages = 4) {
    const directory = new Map();
    let pageToken;
    for (let i = 0; i < maxPages; i++) {
      const res = await chat.spaces.messages.list({
        parent: spaceName,
        pageSize: 50,
        orderBy: "createTime desc",
        pageToken,
      });
      for (const m of res.data.messages || []) {
        for (const a of m.annotations || []) {
          if (a.type !== "USER_MENTION" || !a.userMention?.user?.name) continue;
          const mentionText = (m.text || "").substring(a.startIndex, a.startIndex + a.length);
          const name = mentionText.replace(/^@/, "").trim();
          if (name) directory.set(name.toLowerCase(), a.userMention.user.name);
        }
      }
      pageToken = res.data.nextPageToken;
      if (!pageToken) break;
    }
    return directory;
  }

  // Replaces "@Full Name" spans with Chat's "<users/ID>" mention syntax when a confident
  // match is found in the directory; anything unresolved is left as plain text.
  function resolveMentionsInText(text, directory) {
    const candidateRegex = /@([A-Z][\p{L}'-]*(?:\s[A-Z][\p{L}'-]*){0,3})/gu;
    const unresolved = [];
    const resolvedText = text.replace(candidateRegex, (full, namePart) => {
      const words = namePart.trim().split(/\s+/);
      for (let len = words.length; len >= 1; len--) {
        const candidate = words.slice(0, len).join(" ");
        const id = directory.get(candidate.toLowerCase());
        if (id) {
          const consumedLength = 1 + candidate.length; // "@" + candidate
          const remainder = full.slice(consumedLength);
          return `<${id}>${remainder}`;
        }
      }
      unresolved.push(namePart);
      return full;
    });
    return { resolvedText, unresolved };
  }

  server.registerTool(
    "list_spaces",
    {
      title: "List Google Chat spaces",
      description: "List the Google Chat spaces (DMs and rooms) the authenticated user is a member of.",
      inputSchema: { pageSize: z.number().int().min(1).max(100).optional() },
    },
    async ({ pageSize }) => {
      const res = await chat.spaces.list({ pageSize: pageSize ?? 50 });
      const spaces = (res.data.spaces || []).map((s) => ({
        name: s.name,
        displayName: s.displayName || "(direct message)",
        type: s.spaceType,
      }));
      return { content: [{ type: "text", text: JSON.stringify(spaces, null, 2) }] };
    }
  );

  server.registerTool(
    "list_messages",
    {
      title: "List messages in a space",
      description:
        "List recent messages in a Google Chat space, optionally limited to one thread. Each message includes its attachments " +
        "(name, contentName, contentType, resourceName) for use with download_attachment. Use list_spaces first to get the space's `name` (e.g. spaces/SPACE_ID).",
      inputSchema: {
        spaceName: z.string().describe("The space resource name, e.g. spaces/SPACE_ID"),
        pageSize: z.number().int().min(1).max(100).optional(),
        threadName: z
          .string()
          .optional()
          .describe("Optional: only return messages in this thread, e.g. spaces/SPACE_ID/threads/THREAD_ID"),
      },
    },
    async ({ spaceName, pageSize, threadName }) => {
      const res = await chat.spaces.messages.list({
        parent: spaceName,
        pageSize: pageSize ?? 25,
        orderBy: "createTime desc",
        ...(threadName ? { filter: `thread.name = "${threadName.replace(/"/g, "")}"` } : {}),
      });
      const messages = (res.data.messages || []).map((m) => ({
        name: m.name,
        sender: m.sender?.displayName || m.sender?.name,
        text: m.text,
        createTime: m.createTime,
        threadName: m.thread?.name,
        attachments: summarizeAttachments(m),
      }));
      return { content: [{ type: "text", text: JSON.stringify(messages, null, 2) }] };
    }
  );

  server.registerTool(
    "send_message",
    {
      title: "Send a Google Chat message",
      description:
        "Send a message to a Google Chat space, optionally as a reply inside an existing thread. Write @mentions " +
        "as plain '@Full Name' text (e.g. '@Jane Doe please review'), and this tool automatically resolves " +
        "recognized names to real, notifying mentions by scanning recent space history; unresolved names are " +
        "reported back and sent as plain text instead. Use list_spaces first to get the space's `name`. To reply " +
        "in a thread, pass the `threadName` from a message returned by list_messages " +
        "(e.g. spaces/SPACE_ID/threads/THREAD_ID); if omitted, a new top-level message/thread is created.",
      inputSchema: {
        spaceName: z.string().describe("The space resource name, e.g. spaces/SPACE_ID"),
        text: z.string().min(1),
        threadName: z
          .string()
          .optional()
          .describe("Optional thread resource name to reply into, e.g. spaces/SPACE_ID/threads/THREAD_ID"),
        attachmentPaths: z
          .array(z.string())
          .optional()
          .describe("Optional absolute paths of local files (images, PDF) to attach to the message"),
      },
    },
    async ({ spaceName, text, threadName, attachmentPaths }) => {
      const directory = await buildNameDirectory(spaceName);
      const { resolvedText, unresolved } = resolveMentionsInText(text, directory);

      const requestBody = { text: resolvedText };
      if (attachmentPaths?.length) {
        requestBody.attachment = await uploadAttachments(chat, spaceName, attachmentPaths);
      }
      const params = { parent: spaceName, requestBody };

      if (threadName) {
        requestBody.thread = { name: threadName };
        params.messageReplyOption = "REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD";
      }

      const res = await chat.spaces.messages.create(params);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                name: res.data.name,
                createTime: res.data.createTime,
                threadName: res.data.thread?.name,
                unresolvedMentions: unresolved.length ? unresolved : undefined,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerTool(
    "update_message",
    {
      title: "Edit a Google Chat message",
      description: "Edit the text of a message you previously sent. Requires the message's `name` (from send_message or list_messages).",
      inputSchema: {
        messageName: z.string().describe("Message resource name, e.g. spaces/SPACE_ID/messages/MESSAGE_ID"),
        text: z.string().min(1),
      },
    },
    async ({ messageName, text }) => {
      const res = await chat.spaces.messages.update({
        name: messageName,
        updateMask: "text",
        requestBody: { text },
      });
      return { content: [{ type: "text", text: JSON.stringify({ name: res.data.name, text: res.data.text }, null, 2) }] };
    }
  );

  server.registerTool(
    "delete_message",
    {
      title: "Delete a Google Chat message",
      description: "Permanently delete a message you previously sent. Requires the message's `name`.",
      inputSchema: {
        messageName: z.string().describe("Message resource name, e.g. spaces/SPACE_ID/messages/MESSAGE_ID"),
      },
    },
    async ({ messageName }) => {
      await chat.spaces.messages.delete({ name: messageName });
      return { content: [{ type: "text", text: `Deleted ${messageName}` }] };
    }
  );

  server.registerTool(
    "add_reaction",
    {
      title: "React to a Google Chat message",
      description: "Add an emoji reaction to a message. Requires the message's `name` and a unicode emoji (e.g. \"👍\").",
      inputSchema: {
        messageName: z.string().describe("Message resource name, e.g. spaces/SPACE_ID/messages/MESSAGE_ID"),
        emoji: z.string().min(1).describe("Unicode emoji character, e.g. 👍"),
      },
    },
    async ({ messageName, emoji }) => {
      const res = await chat.spaces.messages.reactions.create({
        parent: messageName,
        requestBody: { emoji: { unicode: emoji } },
      });
      return { content: [{ type: "text", text: JSON.stringify({ name: res.data.name }, null, 2) }] };
    }
  );

  server.registerTool(
    "download_attachment",
    {
      title: "Download a message attachment",
      description:
        "Download an uploaded attachment from a Google Chat message to a local folder (default ~/Downloads). " +
        "Pass either `resourceName` (attachmentDataRef resource name from list_messages) or `messageName` plus " +
        "`index` (position in the message's attachments). Returns the saved path, size and MIME type.",
      inputSchema: {
        resourceName: z.string().optional().describe("attachmentDataRef.resourceName from list_messages"),
        messageName: z.string().optional().describe("Message resource name, e.g. spaces/SPACE_ID/messages/MESSAGE_ID"),
        index: z.number().int().min(0).optional().describe("Attachment index within the message (default 0)"),
        folder: z.string().optional().describe("Folder to save into (default ~/Downloads)"),
      },
    },
    async ({ resourceName, messageName, index, folder }) => {
      let ref = resourceName;
      let fileName;
      let contentType;
      if (!ref) {
        if (!messageName) throw new Error("Provide resourceName, or messageName (with optional index).");
        const msg = await chat.spaces.messages.get({ name: messageName });
        const atts = summarizeAttachments(msg.data);
        const att = atts[index ?? 0];
        if (!att?.resourceName) throw new Error(`No downloadable attachment at index ${index ?? 0} (found ${atts.length}).`);
        ref = att.resourceName;
        fileName = att.contentName;
        contentType = att.contentType;
      }
      const dir = path.resolve(folder || path.join(os.homedir(), "Downloads"));
      fs.mkdirSync(dir, { recursive: true });
      // Strip path parts from the remote file name so it cannot escape the folder.
      const base = path.basename(fileName || "attachment").replace(/[\/:*?"<>|]/g, "_") || "attachment";
      let target = path.join(dir, base);
      for (let n = 1; fs.existsSync(target); n++) {
        const ext = path.extname(base);
        target = path.join(dir, `${path.basename(base, ext)} (${n})${ext}`);
      }
      const res = await chat.media.download({ resourceName: ref, alt: "media" }, { responseType: "stream" });
      await pipeline(res.data, fs.createWriteStream(target));
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                savedPath: target,
                sizeBytes: fs.statSync(target).size,
                mimeType: contentType || res.headers?.["content-type"] || "application/octet-stream",
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}

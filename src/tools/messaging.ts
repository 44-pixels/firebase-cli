import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GoogleClient } from "../google.js";
import { run } from "./utils.js";

export function registerMessagingTools(server: McpServer, google: GoogleClient): void {
  server.registerTool(
    "fcm_send",
    {
      title: "Send FCM message",
      description:
        "Send a push notification via FCM HTTP v1. Pass a `message` object per the FCM v1 schema (token / topic / condition + notification + data + android/apns/webpush blocks).",
      inputSchema: {
        project_id: z.string().optional(),
        message: z.record(z.any()).describe("FCM `Message` object"),
        validate_only: z.boolean().optional().describe("Don't actually deliver; only validate"),
      },
    },
    async ({ project_id, message, validate_only }) =>
      run(() =>
        google.request({
          method: "POST",
          url: `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(google.projectId(project_id))}/messages:send`,
          body: { message, ...(validate_only ? { validate_only } : {}) },
        }),
      ),
  );
}

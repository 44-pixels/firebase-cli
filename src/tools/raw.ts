import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GoogleClient } from "../google.js";
import { run } from "./utils.js";

export function registerRawTool(server: McpServer, google: GoogleClient): void {
  server.registerTool(
    "google_request",
    {
      title: "Raw Google API request",
      description:
        "Escape hatch for any Google / Firebase REST endpoint not covered by a dedicated tool. Pass an absolute https://... URL plus method, optional query, and optional JSON body. The bearer token is forwarded automatically.",
      inputSchema: {
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
        url: z.string().describe("Absolute https URL of the API endpoint"),
        query: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
        body: z.any().optional(),
        accept: z.string().optional(),
      },
    },
    async ({ method, url, query, body, accept }) =>
      run(() => google.request({ method, url, query, body, accept })),
  );
}

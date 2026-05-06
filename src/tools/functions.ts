import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GoogleClient } from "../google.js";
import { run } from "./utils.js";

const FN_BASE = "https://cloudfunctions.googleapis.com/v2";

export function registerFunctionsTools(server: McpServer, google: GoogleClient): void {
  const projectArg = z.string().optional();
  const locationArg = z
    .string()
    .optional()
    .describe("Cloud Functions location/region (defaults to FIREBASE_FUNCTIONS_LOCATION)");

  server.registerTool(
    "functions_list",
    {
      title: "List Cloud Functions",
      description:
        "List Cloud Functions (gen 2) in the given project + location. Use location='-' to list across all regions.",
      inputSchema: {
        project_id: projectArg,
        location: locationArg,
        page_size: z.number().int().optional(),
        page_token: z.string().optional(),
        filter: z.string().optional(),
      },
    },
    async ({ project_id, location, page_size, page_token, filter }) => {
      const loc = location ?? google.defaultFunctionsLocation;
      return run(() =>
        google.request({
          url: `${FN_BASE}/projects/${encodeURIComponent(google.projectId(project_id))}/locations/${encodeURIComponent(loc)}/functions`,
          query: { pageSize: page_size, pageToken: page_token, filter },
        }),
      );
    },
  );

  server.registerTool(
    "functions_get",
    {
      title: "Get Cloud Function",
      description: "Fetch a single function's configuration.",
      inputSchema: {
        project_id: projectArg,
        location: locationArg,
        function_name: z.string().describe("Function id (last path segment)"),
      },
    },
    async ({ project_id, location, function_name }) => {
      const loc = location ?? google.defaultFunctionsLocation;
      return run(() =>
        google.request({
          url: `${FN_BASE}/projects/${encodeURIComponent(google.projectId(project_id))}/locations/${encodeURIComponent(loc)}/functions/${encodeURIComponent(function_name)}`,
        }),
      );
    },
  );

  server.registerTool(
    "functions_list_locations",
    {
      title: "List Cloud Functions locations",
      description: "List GCP locations where Cloud Functions can be deployed.",
      inputSchema: { project_id: projectArg },
    },
    async ({ project_id }) =>
      run(() =>
        google.request({
          url: `${FN_BASE}/projects/${encodeURIComponent(google.projectId(project_id))}/locations`,
        }),
      ),
  );
}

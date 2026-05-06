import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GoogleClient } from "../google.js";
import { run } from "./utils.js";

const RC_BASE = "https://firebaseremoteconfig.googleapis.com/v1";

export function registerRemoteConfigTools(server: McpServer, google: GoogleClient): void {
  const projectArg = z.string().optional();

  server.registerTool(
    "remoteconfig_get",
    {
      title: "Get Remote Config template",
      description: "Fetch the active Remote Config template (parameters, conditions, version).",
      inputSchema: { project_id: projectArg },
    },
    async ({ project_id }) =>
      run(() =>
        google.request({
          url: `${RC_BASE}/projects/${encodeURIComponent(google.projectId(project_id))}/remoteConfig`,
        }),
      ),
  );

  server.registerTool(
    "remoteconfig_publish",
    {
      title: "Publish Remote Config template",
      description:
        "PUT a new Remote Config template. Pass the full template body. The required `If-Match` header is automatically derived from `etag` (use `*` to force overwrite).",
      inputSchema: {
        project_id: projectArg,
        template: z.record(z.any()).describe("Full RC template body"),
        etag: z.string().describe("ETag of current template, or '*' to force"),
        validate_only: z.boolean().optional(),
      },
    },
    async ({ project_id, template, etag, validate_only }) =>
      run(async () => {
        const url = new URL(
          `${RC_BASE}/projects/${encodeURIComponent(google.projectId(project_id))}/remoteConfig`,
        );
        if (validate_only) url.searchParams.set("validateOnly", "true");
        const res = await fetch(url, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${google.accessToken}`,
            Accept: "application/json",
            "Content-Type": "application/json; UTF-8",
            "If-Match": etag,
          },
          body: JSON.stringify(template),
        });
        const text = await res.text();
        let parsed: unknown = text;
        try {
          parsed = JSON.parse(text);
        } catch {
          // leave as text
        }
        if (!res.ok) {
          throw new Error(`Remote Config publish ${res.status} ${res.statusText}: ${text}`);
        }
        return { etag: res.headers.get("etag"), body: parsed };
      }),
  );

  server.registerTool(
    "remoteconfig_list_versions",
    {
      title: "List Remote Config versions",
      description: "List historical Remote Config versions.",
      inputSchema: {
        project_id: projectArg,
        page_size: z.number().int().optional(),
        page_token: z.string().optional(),
        end_version_number: z.string().optional(),
        start_time: z.string().optional(),
        end_time: z.string().optional(),
      },
    },
    async ({
      project_id,
      page_size,
      page_token,
      end_version_number,
      start_time,
      end_time,
    }) =>
      run(() =>
        google.request({
          url: `${RC_BASE}/projects/${encodeURIComponent(google.projectId(project_id))}/remoteConfig:listVersions`,
          query: {
            pageSize: page_size,
            pageToken: page_token,
            endVersionNumber: end_version_number,
            startTime: start_time,
            endTime: end_time,
          },
        }),
      ),
  );

  server.registerTool(
    "remoteconfig_rollback",
    {
      title: "Rollback Remote Config",
      description: "Rollback to a previous Remote Config version.",
      inputSchema: {
        project_id: projectArg,
        version_number: z.string(),
      },
    },
    async ({ project_id, version_number }) =>
      run(() =>
        google.request({
          method: "POST",
          url: `${RC_BASE}/projects/${encodeURIComponent(google.projectId(project_id))}/remoteConfig:rollback`,
          body: { versionNumber: version_number },
        }),
      ),
  );
}

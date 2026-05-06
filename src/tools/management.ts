import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GoogleClient } from "../google.js";
import { run } from "./utils.js";

const FB_BASE = "https://firebase.googleapis.com/v1beta1";

export function registerManagementTools(server: McpServer, google: GoogleClient): void {
  const projectArg = z.string().optional();

  // ── Projects ────────────────────────────────────────────────────────────────
  server.registerTool(
    "firebase_list_projects",
    {
      title: "List Firebase projects",
      description: "List all Firebase projects the bearer token has access to.",
      inputSchema: {
        page_size: z.number().int().optional(),
        page_token: z.string().optional(),
      },
    },
    async ({ page_size, page_token }) =>
      run(() =>
        google.request({
          url: `${FB_BASE}/projects`,
          query: { pageSize: page_size, pageToken: page_token },
        }),
      ),
  );

  server.registerTool(
    "firebase_get_project",
    {
      title: "Get Firebase project",
      description: "Get details for a single Firebase project.",
      inputSchema: { project_id: projectArg },
    },
    async ({ project_id }) =>
      run(() =>
        google.request({
          url: `${FB_BASE}/projects/${encodeURIComponent(google.projectId(project_id))}`,
        }),
      ),
  );

  server.registerTool(
    "firebase_get_admin_sdk_config",
    {
      title: "Get Admin SDK config",
      description:
        "Return the Admin SDK configuration JSON for the project (project id, database URL, storage bucket).",
      inputSchema: { project_id: projectArg },
    },
    async ({ project_id }) =>
      run(() =>
        google.request({
          url: `${FB_BASE}/projects/${encodeURIComponent(google.projectId(project_id))}/adminSdkConfig`,
        }),
      ),
  );

  // ── Apps ────────────────────────────────────────────────────────────────────
  for (const [tool, platform] of [
    ["firebase_list_android_apps", "androidApps"],
    ["firebase_list_ios_apps", "iosApps"],
    ["firebase_list_web_apps", "webApps"],
  ] as const) {
    server.registerTool(
      tool,
      {
        title: `List ${platform}`,
        description: `List ${platform} for the project.`,
        inputSchema: {
          project_id: projectArg,
          page_size: z.number().int().optional(),
          page_token: z.string().optional(),
        },
      },
      async ({ project_id, page_size, page_token }) =>
        run(() =>
          google.request({
            url: `${FB_BASE}/projects/${encodeURIComponent(google.projectId(project_id))}/${platform}`,
            query: { pageSize: page_size, pageToken: page_token },
          }),
        ),
    );
  }

  for (const [tool, platform, label] of [
    ["firebase_get_android_app_config", "androidApps", "Android"],
    ["firebase_get_ios_app_config", "iosApps", "iOS"],
    ["firebase_get_web_app_config", "webApps", "Web"],
  ] as const) {
    server.registerTool(
      tool,
      {
        title: `Get ${label} app config`,
        description: `Return the ${label} app's client configuration (e.g. google-services.json shape).`,
        inputSchema: {
          project_id: projectArg,
          app_id: z.string().describe(`${label} app id (e.g. '1:12345:android:abcdef')`),
        },
      },
      async ({ project_id, app_id }) =>
        run(() =>
          google.request({
            url: `${FB_BASE}/projects/${encodeURIComponent(google.projectId(project_id))}/${platform}/${encodeURIComponent(app_id)}/config`,
          }),
        ),
    );
  }

  server.registerTool(
    "firebase_search_apps",
    {
      title: "Search apps",
      description: "Return all apps (Android, iOS, web) registered against the project.",
      inputSchema: {
        project_id: projectArg,
        page_size: z.number().int().optional(),
        page_token: z.string().optional(),
      },
    },
    async ({ project_id, page_size, page_token }) =>
      run(() =>
        google.request({
          url: `${FB_BASE}/projects/${encodeURIComponent(google.projectId(project_id))}:searchApps`,
          query: { pageSize: page_size, pageToken: page_token },
        }),
      ),
  );

  // ── Available locations ─────────────────────────────────────────────────────
  server.registerTool(
    "firebase_list_available_locations",
    {
      title: "List available GCP locations",
      description: "List GCP locations available for default-resource selection.",
      inputSchema: { project_id: projectArg },
    },
    async ({ project_id }) =>
      run(() =>
        google.request({
          url: `${FB_BASE}/projects/${encodeURIComponent(google.projectId(project_id))}/availableLocations`,
        }),
      ),
  );
}

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GoogleClient } from "../google.js";
import { run } from "./utils.js";

const HOSTING_BASE = "https://firebasehosting.googleapis.com/v1beta1";

export function registerHostingTools(server: McpServer, google: GoogleClient): void {
  const projectArg = z.string().optional();

  server.registerTool(
    "hosting_list_sites",
    {
      title: "List Hosting sites",
      description: "List Hosting sites for the project.",
      inputSchema: {
        project_id: projectArg,
        page_size: z.number().int().optional(),
        page_token: z.string().optional(),
      },
    },
    async ({ project_id, page_size, page_token }) =>
      run(() =>
        google.request({
          url: `${HOSTING_BASE}/projects/${encodeURIComponent(google.projectId(project_id))}/sites`,
          query: { pageSize: page_size, pageToken: page_token },
        }),
      ),
  );

  server.registerTool(
    "hosting_get_site",
    {
      title: "Get Hosting site",
      description: "Get a Hosting site's metadata.",
      inputSchema: {
        project_id: projectArg,
        site_id: z.string(),
      },
    },
    async ({ project_id, site_id }) =>
      run(() =>
        google.request({
          url: `${HOSTING_BASE}/projects/${encodeURIComponent(google.projectId(project_id))}/sites/${encodeURIComponent(site_id)}`,
        }),
      ),
  );

  server.registerTool(
    "hosting_list_releases",
    {
      title: "List Hosting releases",
      description: "List recent releases (deploys) for a Hosting site.",
      inputSchema: {
        site_id: z.string(),
        channel_id: z
          .string()
          .optional()
          .describe("Optional channel id (e.g. 'live'); omit for all channels"),
        page_size: z.number().int().optional(),
        page_token: z.string().optional(),
      },
    },
    async ({ site_id, channel_id, page_size, page_token }) => {
      const path = channel_id
        ? `sites/${encodeURIComponent(site_id)}/channels/${encodeURIComponent(channel_id)}/releases`
        : `sites/${encodeURIComponent(site_id)}/releases`;
      return run(() =>
        google.request({
          url: `${HOSTING_BASE}/${path}`,
          query: { pageSize: page_size, pageToken: page_token },
        }),
      );
    },
  );

  server.registerTool(
    "hosting_list_versions",
    {
      title: "List Hosting versions",
      description: "List versions for a Hosting site.",
      inputSchema: {
        site_id: z.string(),
        page_size: z.number().int().optional(),
        page_token: z.string().optional(),
        filter: z.string().optional(),
      },
    },
    async ({ site_id, page_size, page_token, filter }) =>
      run(() =>
        google.request({
          url: `${HOSTING_BASE}/sites/${encodeURIComponent(site_id)}/versions`,
          query: { pageSize: page_size, pageToken: page_token, filter },
        }),
      ),
  );

  server.registerTool(
    "hosting_list_channels",
    {
      title: "List preview channels",
      description: "List preview channels for a Hosting site.",
      inputSchema: {
        site_id: z.string(),
        page_size: z.number().int().optional(),
        page_token: z.string().optional(),
      },
    },
    async ({ site_id, page_size, page_token }) =>
      run(() =>
        google.request({
          url: `${HOSTING_BASE}/sites/${encodeURIComponent(site_id)}/channels`,
          query: { pageSize: page_size, pageToken: page_token },
        }),
      ),
  );

  server.registerTool(
    "hosting_list_domains",
    {
      title: "List custom domains",
      description: "List custom domains attached to a Hosting site.",
      inputSchema: { site_id: z.string() },
    },
    async ({ site_id }) =>
      run(() =>
        google.request({
          url: `${HOSTING_BASE}/sites/${encodeURIComponent(site_id)}/domains`,
        }),
      ),
  );
}

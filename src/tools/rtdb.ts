import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GoogleClient } from "../google.js";
import { run } from "./utils.js";

function rtdbUrl(base: string, path: string): string {
  const cleanPath = path.replace(/^\/+|\/+$/g, "");
  return `${base}/${cleanPath}.json`;
}

export function registerRtdbTools(server: McpServer, google: GoogleClient): void {
  const databaseArg = z
    .string()
    .optional()
    .describe("RTDB instance URL (defaults to FIREBASE_DATABASE_URL)");

  server.registerTool(
    "rtdb_get",
    {
      title: "Get RTDB data",
      description: "Read the JSON value at the given Realtime Database path.",
      inputSchema: {
        database_url: databaseArg,
        path: z.string().describe("Path within the database, e.g. 'users/abc'"),
        shallow: z.boolean().optional().describe("Return only top-level keys"),
        order_by: z.string().optional(),
        limit_to_first: z.number().int().optional(),
        limit_to_last: z.number().int().optional(),
        start_at: z.string().optional(),
        end_at: z.string().optional(),
        equal_to: z.string().optional(),
      },
    },
    async ({
      database_url,
      path,
      shallow,
      order_by,
      limit_to_first,
      limit_to_last,
      start_at,
      end_at,
      equal_to,
    }) =>
      run(() =>
        google.request({
          url: rtdbUrl(google.databaseUrl(database_url), path),
          query: {
            shallow,
            orderBy: order_by,
            limitToFirst: limit_to_first,
            limitToLast: limit_to_last,
            startAt: start_at,
            endAt: end_at,
            equalTo: equal_to,
          },
        }),
      ),
  );

  server.registerTool(
    "rtdb_set",
    {
      title: "Set RTDB data",
      description: "PUT (overwrite) the JSON value at the given path.",
      inputSchema: {
        database_url: databaseArg,
        path: z.string(),
        value: z.any().describe("JSON value to write at the path"),
      },
    },
    async ({ database_url, path, value }) =>
      run(() =>
        google.request({
          method: "PUT",
          url: rtdbUrl(google.databaseUrl(database_url), path),
          body: value,
        }),
      ),
  );

  server.registerTool(
    "rtdb_update",
    {
      title: "Update RTDB data",
      description: "PATCH (merge) an object of child values at the given path.",
      inputSchema: {
        database_url: databaseArg,
        path: z.string(),
        updates: z.record(z.any()),
      },
    },
    async ({ database_url, path, updates }) =>
      run(() =>
        google.request({
          method: "PATCH",
          url: rtdbUrl(google.databaseUrl(database_url), path),
          body: updates,
        }),
      ),
  );

  server.registerTool(
    "rtdb_push",
    {
      title: "Push to RTDB list",
      description: "POST a new child with an auto-generated id under the given path.",
      inputSchema: {
        database_url: databaseArg,
        path: z.string(),
        value: z.any(),
      },
    },
    async ({ database_url, path, value }) =>
      run(() =>
        google.request({
          method: "POST",
          url: rtdbUrl(google.databaseUrl(database_url), path),
          body: value,
        }),
      ),
  );

  server.registerTool(
    "rtdb_delete",
    {
      title: "Delete RTDB data",
      description: "DELETE the data at the given path.",
      inputSchema: {
        database_url: databaseArg,
        path: z.string(),
      },
    },
    async ({ database_url, path }) =>
      run(() =>
        google.request({
          method: "DELETE",
          url: rtdbUrl(google.databaseUrl(database_url), path),
        }),
      ),
  );

  server.registerTool(
    "rtdb_get_rules",
    {
      title: "Get RTDB security rules",
      description: "Return the current security rules document for the database.",
      inputSchema: { database_url: databaseArg },
    },
    async ({ database_url }) =>
      run(() =>
        google.request({
          url: `${google.databaseUrl(database_url)}/.settings/rules.json`,
          asText: true,
        }),
      ),
  );
}

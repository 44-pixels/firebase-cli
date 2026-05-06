import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GoogleClient } from "../google.js";
import { run } from "./utils.js";

const GCS_BASE = "https://storage.googleapis.com/storage/v1";
const GCS_UPLOAD = "https://storage.googleapis.com/upload/storage/v1";

export function registerStorageTools(server: McpServer, google: GoogleClient): void {
  const projectArg = z.string().optional();
  const bucketArg = z
    .string()
    .optional()
    .describe("Cloud Storage bucket name (defaults to FIREBASE_STORAGE_BUCKET)");

  server.registerTool(
    "storage_list_buckets",
    {
      title: "List storage buckets",
      description: "List Cloud Storage buckets in the project.",
      inputSchema: {
        project_id: projectArg,
        prefix: z.string().optional(),
        page_token: z.string().optional(),
        max_results: z.number().int().optional(),
      },
    },
    async ({ project_id, prefix, page_token, max_results }) =>
      run(() =>
        google.request({
          url: `${GCS_BASE}/b`,
          query: {
            project: google.projectId(project_id),
            prefix,
            pageToken: page_token,
            maxResults: max_results,
          },
        }),
      ),
  );

  server.registerTool(
    "storage_get_bucket",
    {
      title: "Get storage bucket",
      description: "Get metadata for a single bucket.",
      inputSchema: { bucket: bucketArg },
    },
    async ({ bucket }) =>
      run(() =>
        google.request({
          url: `${GCS_BASE}/b/${encodeURIComponent(google.storageBucket(bucket))}`,
        }),
      ),
  );

  server.registerTool(
    "storage_list_objects",
    {
      title: "List objects in bucket",
      description: "List objects in a Cloud Storage bucket.",
      inputSchema: {
        bucket: bucketArg,
        prefix: z.string().optional(),
        delimiter: z.string().optional().describe("Use '/' for folder-like browsing"),
        page_token: z.string().optional(),
        max_results: z.number().int().optional(),
        versions: z.boolean().optional(),
      },
    },
    async ({ bucket, prefix, delimiter, page_token, max_results, versions }) =>
      run(() =>
        google.request({
          url: `${GCS_BASE}/b/${encodeURIComponent(google.storageBucket(bucket))}/o`,
          query: {
            prefix,
            delimiter,
            pageToken: page_token,
            maxResults: max_results,
            versions,
          },
        }),
      ),
  );

  server.registerTool(
    "storage_get_object_metadata",
    {
      title: "Get object metadata",
      description: "Fetch metadata for a single object (does NOT download content).",
      inputSchema: {
        bucket: bucketArg,
        object: z.string().describe("Object name (path within bucket)"),
      },
    },
    async ({ bucket, object }) =>
      run(() =>
        google.request({
          url: `${GCS_BASE}/b/${encodeURIComponent(google.storageBucket(bucket))}/o/${encodeURIComponent(object)}`,
        }),
      ),
  );

  server.registerTool(
    "storage_download_object_text",
    {
      title: "Download object as text",
      description:
        "Download an object's contents as text. Suitable for JSON/text/log files; binary content will be returned base64-encoded if `as_base64` is true.",
      inputSchema: {
        bucket: bucketArg,
        object: z.string(),
        as_base64: z.boolean().optional().describe("Base64-encode the response (for binary)"),
      },
    },
    async ({ bucket, object, as_base64 }) =>
      run(async () => {
        const url = new URL(
          `${GCS_BASE}/b/${encodeURIComponent(google.storageBucket(bucket))}/o/${encodeURIComponent(object)}`,
        );
        url.searchParams.set("alt", "media");
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${google.accessToken}` },
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`GCS download ${res.status} ${res.statusText}: ${text}`);
        }
        if (as_base64) {
          const buf = Buffer.from(await res.arrayBuffer());
          return { encoding: "base64", data: buf.toString("base64") };
        }
        return { encoding: "utf-8", data: await res.text() };
      }),
  );

  server.registerTool(
    "storage_upload_object",
    {
      title: "Upload object",
      description:
        "Upload an object via simple upload. Pass `content` as a UTF-8 string or `content_base64` for binary.",
      inputSchema: {
        bucket: bucketArg,
        name: z.string().describe("Object name (path within bucket)"),
        content: z.string().optional(),
        content_base64: z.string().optional(),
        content_type: z.string().optional().describe("Defaults to text/plain or application/octet-stream"),
      },
    },
    async ({ bucket, name, content, content_base64, content_type }) =>
      run(async () => {
        if (content === undefined && content_base64 === undefined) {
          throw new Error("Provide either `content` or `content_base64`.");
        }
        const body: Uint8Array | string =
          content_base64 !== undefined ? Buffer.from(content_base64, "base64") : content!;
        const inferredType =
          content_type ?? (content_base64 !== undefined ? "application/octet-stream" : "text/plain");
        const url = new URL(
          `${GCS_UPLOAD}/b/${encodeURIComponent(google.storageBucket(bucket))}/o`,
        );
        url.searchParams.set("uploadType", "media");
        url.searchParams.set("name", name);
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${google.accessToken}`,
            "Content-Type": inferredType,
          },
          body,
        });
        const text = await res.text();
        let parsed: unknown = text;
        try {
          parsed = JSON.parse(text);
        } catch {
          // leave as text
        }
        if (!res.ok) {
          throw new Error(`GCS upload ${res.status} ${res.statusText}: ${text}`);
        }
        return parsed;
      }),
  );

  server.registerTool(
    "storage_delete_object",
    {
      title: "Delete object",
      description: "Delete an object from a bucket.",
      inputSchema: { bucket: bucketArg, object: z.string() },
    },
    async ({ bucket, object }) =>
      run(() =>
        google.request({
          method: "DELETE",
          url: `${GCS_BASE}/b/${encodeURIComponent(google.storageBucket(bucket))}/o/${encodeURIComponent(object)}`,
        }),
      ),
  );
}

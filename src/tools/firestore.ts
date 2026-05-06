import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GoogleClient } from "../google.js";
import { run } from "./utils.js";

const FIRESTORE_BASE = "https://firestore.googleapis.com/v1";

function dbPath(projectId: string, databaseId: string): string {
  return `projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}`;
}

export function registerFirestoreTools(server: McpServer, google: GoogleClient): void {
  const projectArg = z.string().optional();
  const databaseArg = z
    .string()
    .optional()
    .describe("Firestore database id (defaults to '(default)')");

  server.registerTool(
    "firestore_list_databases",
    {
      title: "List Firestore databases",
      description: "List all Firestore databases for the project.",
      inputSchema: { project_id: projectArg },
    },
    async ({ project_id }) =>
      run(() =>
        google.request({
          url: `${FIRESTORE_BASE}/projects/${encodeURIComponent(google.projectId(project_id))}/databases`,
        }),
      ),
  );

  server.registerTool(
    "firestore_list_collections",
    {
      title: "List collection ids",
      description:
        "List collection ids under a parent document. Pass `parent: ''` (default) for root-level collections, or `parent: 'users/abc'`.",
      inputSchema: {
        project_id: projectArg,
        database_id: databaseArg,
        parent: z.string().optional().describe("Parent document path (relative). Empty for root."),
        page_size: z.number().int().optional(),
        page_token: z.string().optional(),
      },
    },
    async ({ project_id, database_id, parent, page_size, page_token }) => {
      const db = dbPath(google.projectId(project_id), database_id ?? "(default)");
      const docRoot = parent ? `${db}/documents/${parent}` : `${db}/documents`;
      return run(() =>
        google.request({
          method: "POST",
          url: `${FIRESTORE_BASE}/${docRoot}:listCollectionIds`,
          body: {
            ...(page_size ? { pageSize: page_size } : {}),
            ...(page_token ? { pageToken: page_token } : {}),
          },
        }),
      );
    },
  );

  server.registerTool(
    "firestore_list_documents",
    {
      title: "List documents in collection",
      description: "List documents directly under the given collection.",
      inputSchema: {
        project_id: projectArg,
        database_id: databaseArg,
        collection: z.string().describe("Collection path, e.g. 'users' or 'users/abc/posts'"),
        page_size: z.number().int().optional(),
        page_token: z.string().optional(),
        order_by: z.string().optional(),
        show_missing: z.boolean().optional(),
        mask_field_paths: z.array(z.string()).optional().describe("Project a subset of fields"),
      },
    },
    async ({
      project_id,
      database_id,
      collection,
      page_size,
      page_token,
      order_by,
      show_missing,
      mask_field_paths,
    }) => {
      const db = dbPath(google.projectId(project_id), database_id ?? "(default)");
      const query: Record<string, string | number | boolean | undefined> = {
        pageSize: page_size,
        pageToken: page_token,
        orderBy: order_by,
        showMissing: show_missing,
      };
      const url = new URL(
        `${FIRESTORE_BASE}/${db}/documents/${collection.replace(/^\/+/, "")}`,
      );
      if (mask_field_paths) {
        for (const f of mask_field_paths) url.searchParams.append("mask.fieldPaths", f);
      }
      return run(() => google.request({ url: url.href, query }));
    },
  );

  server.registerTool(
    "firestore_get_document",
    {
      title: "Get document",
      description: "Fetch a single document by path.",
      inputSchema: {
        project_id: projectArg,
        database_id: databaseArg,
        path: z.string().describe("Document path, e.g. 'users/abc'"),
        mask_field_paths: z.array(z.string()).optional(),
      },
    },
    async ({ project_id, database_id, path, mask_field_paths }) => {
      const db = dbPath(google.projectId(project_id), database_id ?? "(default)");
      const url = new URL(`${FIRESTORE_BASE}/${db}/documents/${path.replace(/^\/+/, "")}`);
      if (mask_field_paths) {
        for (const f of mask_field_paths) url.searchParams.append("mask.fieldPaths", f);
      }
      return run(() => google.request({ url: url.href }));
    },
  );

  server.registerTool(
    "firestore_create_document",
    {
      title: "Create document",
      description:
        "Create a new document under a collection. Pass `fields` in Firestore typed-value form (e.g. `{ name: { stringValue: 'x' } }`).",
      inputSchema: {
        project_id: projectArg,
        database_id: databaseArg,
        parent: z
          .string()
          .describe("Parent path: collection (e.g. 'users') or subcollection (e.g. 'users/abc/posts')"),
        document_id: z.string().optional().describe("Optional id; auto-generated if omitted"),
        fields: z.record(z.any()).describe("Firestore typed-value field map"),
      },
    },
    async ({ project_id, database_id, parent, document_id, fields }) => {
      const db = dbPath(google.projectId(project_id), database_id ?? "(default)");
      const segments = parent.replace(/^\/+|\/+$/g, "").split("/");
      const collectionId = segments.pop()!;
      const parentPath =
        segments.length > 0 ? `${db}/documents/${segments.join("/")}` : `${db}/documents`;
      return run(() =>
        google.request({
          method: "POST",
          url: `${FIRESTORE_BASE}/${parentPath}`,
          query: {
            collectionId,
            ...(document_id ? { documentId: document_id } : {}),
          },
          body: { fields },
        }),
      );
    },
  );

  server.registerTool(
    "firestore_update_document",
    {
      title: "Update / patch document",
      description:
        "PATCH a document. Pass `fields` in Firestore typed-value form. Use `update_mask_field_paths` to limit which fields are written; omit it to upsert the whole document.",
      inputSchema: {
        project_id: projectArg,
        database_id: databaseArg,
        path: z.string().describe("Document path, e.g. 'users/abc'"),
        fields: z.record(z.any()),
        update_mask_field_paths: z.array(z.string()).optional(),
        current_document_exists: z.boolean().optional(),
      },
    },
    async ({
      project_id,
      database_id,
      path,
      fields,
      update_mask_field_paths,
      current_document_exists,
    }) => {
      const db = dbPath(google.projectId(project_id), database_id ?? "(default)");
      const url = new URL(`${FIRESTORE_BASE}/${db}/documents/${path.replace(/^\/+/, "")}`);
      if (update_mask_field_paths) {
        for (const f of update_mask_field_paths) url.searchParams.append("updateMask.fieldPaths", f);
      }
      if (current_document_exists !== undefined) {
        url.searchParams.set("currentDocument.exists", String(current_document_exists));
      }
      return run(() =>
        google.request({
          method: "PATCH",
          url: url.href,
          body: { fields },
        }),
      );
    },
  );

  server.registerTool(
    "firestore_delete_document",
    {
      title: "Delete document",
      description: "Delete a document by path.",
      inputSchema: {
        project_id: projectArg,
        database_id: databaseArg,
        path: z.string(),
      },
    },
    async ({ project_id, database_id, path }) => {
      const db = dbPath(google.projectId(project_id), database_id ?? "(default)");
      return run(() =>
        google.request({
          method: "DELETE",
          url: `${FIRESTORE_BASE}/${db}/documents/${path.replace(/^\/+/, "")}`,
        }),
      );
    },
  );

  server.registerTool(
    "firestore_run_query",
    {
      title: "Run structured query",
      description:
        "Run a Firestore structured query. Pass a `structuredQuery` object per the runQuery REST shape (from, where, orderBy, limit, etc.).",
      inputSchema: {
        project_id: projectArg,
        database_id: databaseArg,
        parent: z
          .string()
          .optional()
          .describe("Parent document path (default: root). e.g. 'users/abc' for subcollection queries."),
        structured_query: z.record(z.any()).describe("Firestore StructuredQuery object"),
      },
    },
    async ({ project_id, database_id, parent, structured_query }) => {
      const db = dbPath(google.projectId(project_id), database_id ?? "(default)");
      const docRoot = parent ? `${db}/documents/${parent}` : `${db}/documents`;
      return run(() =>
        google.request({
          method: "POST",
          url: `${FIRESTORE_BASE}/${docRoot}:runQuery`,
          body: { structuredQuery: structured_query },
        }),
      );
    },
  );

  server.registerTool(
    "firestore_commit",
    {
      title: "Commit batched writes",
      description:
        "Commit a batch of writes (update / delete / transform) atomically. Pass `writes` per the commit REST shape.",
      inputSchema: {
        project_id: projectArg,
        database_id: databaseArg,
        writes: z.array(z.record(z.any())),
        transaction: z.string().optional().describe("Optional transaction id from beginTransaction"),
      },
    },
    async ({ project_id, database_id, writes, transaction }) => {
      const db = dbPath(google.projectId(project_id), database_id ?? "(default)");
      return run(() =>
        google.request({
          method: "POST",
          url: `${FIRESTORE_BASE}/${db}/documents:commit`,
          body: { writes, ...(transaction ? { transaction } : {}) },
        }),
      );
    },
  );

  // ── Indexes ─────────────────────────────────────────────────────────────────
  server.registerTool(
    "firestore_list_indexes",
    {
      title: "List Firestore indexes",
      description: "List composite indexes for a Firestore collection group.",
      inputSchema: {
        project_id: projectArg,
        database_id: databaseArg,
        collection_group: z.string(),
        page_size: z.number().int().optional(),
        page_token: z.string().optional(),
      },
    },
    async ({ project_id, database_id, collection_group, page_size, page_token }) => {
      const db = dbPath(google.projectId(project_id), database_id ?? "(default)");
      return run(() =>
        google.request({
          url: `${FIRESTORE_BASE}/${db}/collectionGroups/${encodeURIComponent(collection_group)}/indexes`,
          query: { pageSize: page_size, pageToken: page_token },
        }),
      );
    },
  );
}

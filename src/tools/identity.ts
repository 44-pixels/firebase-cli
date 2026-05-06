import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GoogleClient } from "../google.js";
import { run } from "./utils.js";

export function registerIdentityTools(server: McpServer, google: GoogleClient): void {
  server.registerTool(
    "google_userinfo",
    {
      title: "Get OAuth user info",
      description:
        "Returns the OpenID Connect user info for the bearer token (email, sub, name, picture). Useful for proving who Gatana / Google authorized.",
      inputSchema: {},
    },
    async () =>
      run(() =>
        google.request({
          url: "https://openidconnect.googleapis.com/v1/userinfo",
        }),
      ),
  );

  server.registerTool(
    "google_token_info",
    {
      title: "Inspect access token",
      description:
        "Returns Google's tokeninfo response for the current bearer token: scope, audience, expiry. Useful for debugging.",
      inputSchema: {},
    },
    async () => {
      // tokeninfo is the only Google endpoint that doesn't accept Authorization;
      // the token is passed as a query parameter.
      const url = new URL("https://oauth2.googleapis.com/tokeninfo");
      url.searchParams.set("access_token", google.accessToken);
      const res = await fetch(url);
      const text = await res.text();
      let parsed: unknown = text;
      try {
        parsed = JSON.parse(text);
      } catch {
        // leave as text
      }
      return { content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }] };
    },
  );

  server.registerTool(
    "firebase_default_context",
    {
      title: "Show defaults",
      description:
        "Returns the project / database / bucket / location defaults this server was started with.",
      inputSchema: {},
    },
    async () =>
      run(async () => ({
        default_project_id: google.defaultProjectId ?? null,
        default_database_url: google.defaultDatabaseUrl ?? null,
        default_storage_bucket: google.defaultStorageBucket ?? null,
        default_functions_location: google.defaultFunctionsLocation,
      })),
  );

  // ── Firebase Auth admin (Identity Toolkit) ─────────────────────────────────
  // These call the Identity Toolkit `accounts:*` endpoints on a project basis,
  // which is the supported path for the Admin SDK (vs. the legacy
  // `relyingparty` endpoints).

  const userBatchInput = {
    project_id: z.string().optional(),
    max_results: z.number().int().min(1).max(1000).optional(),
    next_page_token: z.string().optional(),
  };

  server.registerTool(
    "auth_list_users",
    {
      title: "List Firebase Auth users",
      description: "List user accounts in the Firebase Auth project (paginated).",
      inputSchema: userBatchInput,
    },
    async ({ project_id, max_results, next_page_token }) =>
      run(() =>
        google.request({
          method: "GET",
          url: `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(google.projectId(project_id))}/accounts:batchGet`,
          query: { maxResults: max_results, nextPageToken: next_page_token },
        }),
      ),
  );

  server.registerTool(
    "auth_get_user",
    {
      title: "Get Firebase Auth user(s)",
      description:
        "Look up users by uid, email, phone, federated identity, or email-as-substring. Pass any combination of the array fields.",
      inputSchema: {
        project_id: z.string().optional(),
        local_id: z.array(z.string()).optional().describe("Firebase Auth uid(s)"),
        email: z.array(z.string()).optional(),
        phone_number: z.array(z.string()).optional(),
        federated_user_id: z
          .array(z.object({ providerId: z.string(), rawId: z.string() }))
          .optional(),
      },
    },
    async ({ project_id, local_id, email, phone_number, federated_user_id }) =>
      run(() =>
        google.request({
          method: "POST",
          url: `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(google.projectId(project_id))}/accounts:lookup`,
          body: {
            ...(local_id ? { localId: local_id } : {}),
            ...(email ? { email } : {}),
            ...(phone_number ? { phoneNumber: phone_number } : {}),
            ...(federated_user_id ? { federatedUserId: federated_user_id } : {}),
          },
        }),
      ),
  );

  server.registerTool(
    "auth_create_user",
    {
      title: "Create Firebase Auth user",
      description: "Create a new user account in Firebase Authentication.",
      inputSchema: {
        project_id: z.string().optional(),
        local_id: z.string().optional().describe("Optional uid; auto-generated if omitted"),
        email: z.string().optional(),
        password: z.string().optional(),
        display_name: z.string().optional(),
        photo_url: z.string().optional(),
        phone_number: z.string().optional(),
        email_verified: z.boolean().optional(),
        disabled: z.boolean().optional(),
        custom_attributes: z
          .string()
          .optional()
          .describe("Stringified JSON for customClaims (max 1000 chars)"),
      },
    },
    async (args) => {
      const { project_id, ...rest } = args;
      const body: Record<string, unknown> = {};
      if (rest.local_id) body.localId = rest.local_id;
      if (rest.email !== undefined) body.email = rest.email;
      if (rest.password !== undefined) body.password = rest.password;
      if (rest.display_name !== undefined) body.displayName = rest.display_name;
      if (rest.photo_url !== undefined) body.photoUrl = rest.photo_url;
      if (rest.phone_number !== undefined) body.phoneNumber = rest.phone_number;
      if (rest.email_verified !== undefined) body.emailVerified = rest.email_verified;
      if (rest.disabled !== undefined) body.disabled = rest.disabled;
      if (rest.custom_attributes !== undefined) body.customAttributes = rest.custom_attributes;
      return run(() =>
        google.request({
          method: "POST",
          url: `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(google.projectId(project_id))}/accounts`,
          body,
        }),
      );
    },
  );

  server.registerTool(
    "auth_update_user",
    {
      title: "Update Firebase Auth user",
      description:
        "Update an existing user account. Required: local_id. Use delete_attribute / delete_provider to clear fields.",
      inputSchema: {
        project_id: z.string().optional(),
        local_id: z.string(),
        email: z.string().optional(),
        password: z.string().optional(),
        display_name: z.string().optional(),
        photo_url: z.string().optional(),
        phone_number: z.string().optional(),
        email_verified: z.boolean().optional(),
        disabled: z.boolean().optional(),
        custom_attributes: z.string().optional(),
        delete_attribute: z
          .array(z.enum(["DISPLAY_NAME", "PHOTO_URL"]))
          .optional()
          .describe("Profile fields to clear"),
        delete_provider: z
          .array(z.string())
          .optional()
          .describe("Provider IDs to unlink (e.g. 'google.com', 'phone')"),
      },
    },
    async ({
      project_id,
      local_id,
      email,
      password,
      display_name,
      photo_url,
      phone_number,
      email_verified,
      disabled,
      custom_attributes,
      delete_attribute,
      delete_provider,
    }) =>
      run(() =>
        google.request({
          method: "POST",
          url: `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(google.projectId(project_id))}/accounts:update`,
          body: {
            localId: local_id,
            ...(email !== undefined ? { email } : {}),
            ...(password !== undefined ? { password } : {}),
            ...(display_name !== undefined ? { displayName: display_name } : {}),
            ...(photo_url !== undefined ? { photoUrl: photo_url } : {}),
            ...(phone_number !== undefined ? { phoneNumber: phone_number } : {}),
            ...(email_verified !== undefined ? { emailVerified: email_verified } : {}),
            ...(disabled !== undefined ? { disableUser: disabled } : {}),
            ...(custom_attributes !== undefined ? { customAttributes: custom_attributes } : {}),
            ...(delete_attribute ? { deleteAttribute: delete_attribute } : {}),
            ...(delete_provider ? { deleteProvider: delete_provider } : {}),
          },
        }),
      ),
  );

  server.registerTool(
    "auth_delete_user",
    {
      title: "Delete Firebase Auth user",
      description: "Permanently delete a user account.",
      inputSchema: {
        project_id: z.string().optional(),
        local_id: z.string(),
      },
    },
    async ({ project_id, local_id }) =>
      run(() =>
        google.request({
          method: "POST",
          url: `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(google.projectId(project_id))}/accounts:delete`,
          body: { localId: local_id },
        }),
      ),
  );

  server.registerTool(
    "auth_set_custom_claims",
    {
      title: "Set custom claims on user",
      description:
        "Convenience wrapper around auth_update_user that JSON-encodes a claims object into the customAttributes string.",
      inputSchema: {
        project_id: z.string().optional(),
        local_id: z.string(),
        claims: z.record(z.any()).describe("Plain JSON object (max ~1000 bytes serialized)"),
      },
    },
    async ({ project_id, local_id, claims }) =>
      run(() =>
        google.request({
          method: "POST",
          url: `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(google.projectId(project_id))}/accounts:update`,
          body: { localId: local_id, customAttributes: JSON.stringify(claims) },
        }),
      ),
  );

  server.registerTool(
    "auth_send_oob_code",
    {
      title: "Send OOB code",
      description:
        "Send password-reset, email-verification, or sign-in link emails. `requestType` selects the flavor.",
      inputSchema: {
        project_id: z.string().optional(),
        request_type: z.enum([
          "PASSWORD_RESET",
          "EMAIL_SIGNIN",
          "VERIFY_EMAIL",
          "VERIFY_AND_CHANGE_EMAIL",
        ]),
        email: z.string(),
        new_email: z.string().optional(),
        continue_url: z.string().optional(),
        return_oob_link: z.boolean().optional().describe("Return the link instead of sending email"),
      },
    },
    async ({ project_id, request_type, email, new_email, continue_url, return_oob_link }) =>
      run(() =>
        google.request({
          method: "POST",
          url: `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(google.projectId(project_id))}/accounts:sendOobCode`,
          body: {
            requestType: request_type,
            email,
            ...(new_email ? { newEmail: new_email } : {}),
            ...(continue_url ? { continueUrl: continue_url } : {}),
            ...(return_oob_link ? { returnOobLink: return_oob_link } : {}),
          },
        }),
      ),
  );
}

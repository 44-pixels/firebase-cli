# firebase-mcp

A Model Context Protocol (MCP) server that exposes the **Firebase / Google
APIs** as tools, built on the official
[`@modelcontextprotocol/sdk`][sdk] using the **Streamable HTTP** transport,
designed to sit behind an MCP gateway (Gatana, Cloudflare AI Gateway, etc.)
that brokers Google OAuth on the user's behalf.

[sdk]: https://github.com/modelcontextprotocol/typescript-sdk

## Authorization model

This server is a pure **OAuth 2.1 resource server** — it does **not** run an
OAuth flow itself. Instead it advertises Google as the upstream authorization
server via [RFC 9728 Protected Resource Metadata][rfc9728] and expects every
MCP request to carry a Google OAuth access token in
`Authorization: Bearer …`. The gateway is responsible for the user-facing
OAuth dance, refresh-token handling, and token forwarding.

[rfc9728]: https://datatracker.ietf.org/doc/html/rfc9728

```
┌────────┐  user-facing OAuth   ┌─────────┐   bearer token    ┌──────────┐
│ Client │  ───────────────►    │ Gateway │  ───────────────► │ MCP (us) │ ─► Google APIs
└────────┘                      └─────────┘                   └──────────┘
                  ▲                                ▲
                  │      Protected Resource        │
                  └─── Metadata discovery ─────────┘
```

Because this server uses Google **OAuth access tokens**, not Firebase Auth
**ID tokens**, it operates at the **admin tier** — bypassing Firestore /
RTDB security rules. That is the same posture as a service-account-backed
admin SDK, just per-user.

### Discovery

| URL                                                | Purpose                                                    |
| -------------------------------------------------- | ---------------------------------------------------------- |
| `POST /mcp`                                        | MCP Streamable HTTP transport (stateless mode).            |
| `GET  /.well-known/oauth-protected-resource`       | RFC 9728 Protected Resource Metadata.                      |
| `GET  /.well-known/oauth-protected-resource/mcp`   | Same metadata, served at the path-bound URL per RFC 9728.  |
| `GET  /`                                           | Public health/info JSON.                                   |

A request to `/mcp` without a valid Bearer token returns:

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer error="invalid_request",
                  error_description="No access token was provided in this request",
                  resource_metadata="https://your-host/.well-known/oauth-protected-resource/mcp"
```

The PRM JSON looks like:

```json
{
  "resource": "https://your-host/mcp",
  "authorization_servers": ["https://accounts.google.com"],
  "scopes_supported": [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/firebase",
    "https://www.googleapis.com/auth/firebase.database",
    "https://www.googleapis.com/auth/firebase.messaging",
    "https://www.googleapis.com/auth/firebase.readonly",
    "https://www.googleapis.com/auth/datastore",
    "https://www.googleapis.com/auth/identitytoolkit",
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/cloud-platform.read-only"
  ],
  "bearer_methods_supported": ["header"],
  "resource_name": "Firebase MCP Server"
}
```

Google publishes proper OAuth/OIDC discovery metadata at
`https://accounts.google.com/.well-known/openid-configuration`, so any
gateway that supports RFC 8414 / OIDC discovery can auto-configure the
upstream from the PRM advertisement above.

## Quick start

### Run from GitHub via `npx`

```bash
npx -y github:44-pixels/firebase-cli
```

Per-call defaults can be set via env vars (all optional):

```bash
FIREBASE_PROJECT_ID=my-project \
FIREBASE_DATABASE_URL=https://my-project-default-rtdb.firebaseio.com \
FIREBASE_STORAGE_BUCKET=my-project.appspot.com \
  npx -y github:44-pixels/firebase-cli
```

### Plug it into a gateway

Point the gateway at:

- **MCP endpoint**: `https://<host>/mcp`
- **Authorization server**: whatever the PRM advertises (default
  `https://accounts.google.com`)
- **Scopes** to request: pick from the PRM `scopes_supported` list. For
  full Firebase admin coverage, request at minimum
  `https://www.googleapis.com/auth/cloud-platform` plus
  `https://www.googleapis.com/auth/firebase`.

The gateway performs the OAuth flow with Google (Authorization Code +
PKCE, with `access_type=offline` for refresh tokens) and forwards the
access token to `/mcp` as a Bearer header on every request.

## Configuration

All configuration is via environment variables. **None are required** —
the server will boot with sensible Google defaults and ask for
`project_id` / `database_url` / `bucket` per tool call when no defaults
are configured.

| Variable                       | Default                                          | Notes                                                                            |
| ------------------------------ | ------------------------------------------------ | -------------------------------------------------------------------------------- |
| `PORT`                         | `3000`                                           | HTTP port.                                                                       |
| `PUBLIC_URL`                   | `http://localhost:${PORT}`                       | Used to derive `resourceUrl` and the PRM URL when not overridden.                |
| `MCP_RESOURCE_URL`             | `${PUBLIC_URL}/mcp`                              | Canonical RFC 8707 resource identifier; advertised in PRM and validated by AS.   |
| `MCP_RESOURCE_NAME`            | `Firebase MCP Server`                            | Human-readable name advertised in PRM.                                           |
| `MCP_AUTHORIZATION_SERVERS`    | `https://accounts.google.com`                    | Comma-separated AS URLs. Override when fronting with a gateway-issued AS.        |
| `MCP_SCOPES_SUPPORTED`         | a sensible Firebase / GCP default set            | Comma-separated OAuth scopes.                                                    |
| `FIREBASE_PROJECT_ID`          | (none)                                           | Default project id used by tools when the caller omits one.                      |
| `FIREBASE_DATABASE_URL`        | (none)                                           | Default RTDB instance URL (e.g. `https://<project>-default-rtdb.firebaseio.com`). |
| `FIREBASE_STORAGE_BUCKET`      | (none)                                           | Default Cloud Storage bucket.                                                    |
| `FIREBASE_FUNCTIONS_LOCATION`  | `us-central1`                                    | Default Cloud Functions region.                                                  |

### Pointing at a gateway-issued AS

If your gateway (e.g. Gatana) issues its own OAuth tokens that map to
Google internally:

```bash
MCP_AUTHORIZATION_SERVERS=https://gatana.example.com/oauth \
PUBLIC_URL=https://firebase.mcp.example.com \
  npx -y github:44-pixels/firebase-cli
```

## Tools

The server registers tools across nine surfaces. Each tool that addresses a
resource will fall back to the `FIREBASE_PROJECT_ID` /
`FIREBASE_DATABASE_URL` / `FIREBASE_STORAGE_BUCKET` env vars when the
matching argument is omitted.

### Identity / introspection
- `google_userinfo` — OIDC userinfo for the bearer token
- `google_token_info` — token scope/audience/expiry diagnostics
- `firebase_default_context` — show the configured defaults

### Firebase Auth (Identity Toolkit)
- `auth_list_users`, `auth_get_user`, `auth_create_user`, `auth_update_user`,
  `auth_delete_user`, `auth_set_custom_claims`, `auth_send_oob_code`

### Firebase Project Management
- `firebase_list_projects`, `firebase_get_project`,
  `firebase_get_admin_sdk_config`, `firebase_search_apps`,
  `firebase_list_available_locations`
- `firebase_list_android_apps` / `firebase_get_android_app_config`
- `firebase_list_ios_apps` / `firebase_get_ios_app_config`
- `firebase_list_web_apps` / `firebase_get_web_app_config`

### Firestore
- `firestore_list_databases`, `firestore_list_collections`,
  `firestore_list_documents`, `firestore_get_document`,
  `firestore_create_document`, `firestore_update_document`,
  `firestore_delete_document`, `firestore_run_query`, `firestore_commit`,
  `firestore_list_indexes`

### Realtime Database
- `rtdb_get`, `rtdb_set`, `rtdb_update`, `rtdb_push`, `rtdb_delete`,
  `rtdb_get_rules`

### Cloud Messaging (FCM v1)
- `fcm_send`

### Hosting
- `hosting_list_sites`, `hosting_get_site`, `hosting_list_releases`,
  `hosting_list_versions`, `hosting_list_channels`, `hosting_list_domains`

### Remote Config
- `remoteconfig_get`, `remoteconfig_publish`, `remoteconfig_list_versions`,
  `remoteconfig_rollback`

### Cloud Functions (gen 2)
- `functions_list`, `functions_get`, `functions_list_locations`

### Cloud Storage
- `storage_list_buckets`, `storage_get_bucket`, `storage_list_objects`,
  `storage_get_object_metadata`, `storage_download_object_text`,
  `storage_upload_object`, `storage_delete_object`

### Escape hatch
- `google_request` — raw method/URL/query/body, bearer forwarded
  automatically. Use for any Google REST API not covered above.

## Development

```bash
npm install
npm run build      # tsc → dist/
npm run dev        # tsx src/index.ts
npm start          # node dist/index.js
```

The build emits a CLI entry at `dist/index.js` with a `#!/usr/bin/env node`
shebang and a `bin` mapping in `package.json`, so `npx firebase-mcp`
launches the server. The `prepare` script runs `tsc` automatically on
`npm install` (including when invoked via `npx github:…`), so the package
self-builds at install time without a published pre-built artifact.

## Notes on transport choice

This server uses the SDK's **stateless Streamable HTTP** transport
(`sessionIdGenerator: undefined`). Each POST to `/mcp` is fully
independent: the server reads the Bearer token, builds a `GoogleClient`
bound to that token, registers tools, and tears everything down when the
response closes. This makes the server safe to run behind any HTTP load
balancer and trivial to deploy serverless.

## License

MIT

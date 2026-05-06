export interface Config {
  port: number;
  publicUrl: string;
  resourceUrl: string;
  resourceName: string;
  authorizationServers: string[];
  scopesSupported: string[];
  /** Default Firebase / GCP project id used by tools when the caller omits one. */
  defaultProjectId?: string;
  /**
   * Default Realtime Database URL (e.g. `https://<project>-default-rtdb.firebaseio.com`)
   * used by RTDB tools when the caller omits one.
   */
  defaultDatabaseUrl?: string;
  /** Default Cloud Storage bucket used by Storage tools when the caller omits one. */
  defaultStorageBucket?: string;
  /** Default Cloud Functions location (region) used when the caller omits one. */
  defaultFunctionsLocation: string;
}

const DEFAULT_GOOGLE_AUTH_SERVER = "https://accounts.google.com";

const DEFAULT_SCOPES = [
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
  "https://www.googleapis.com/auth/cloud-platform.read-only",
];

function parseList(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? "3000");
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid PORT: ${env.PORT}`);
  }

  const publicUrl = (env.PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/+$/, "");
  const resourceUrl =
    (env.MCP_RESOURCE_URL ?? `${publicUrl}/mcp`).replace(/\/+$/, "") || `${publicUrl}/mcp`;
  const resourceName = env.MCP_RESOURCE_NAME ?? "Firebase MCP Server";
  const authorizationServers = parseList(
    env.MCP_AUTHORIZATION_SERVERS,
    [DEFAULT_GOOGLE_AUTH_SERVER],
  );
  const scopesSupported = parseList(env.MCP_SCOPES_SUPPORTED, DEFAULT_SCOPES);

  return {
    port,
    publicUrl,
    resourceUrl,
    resourceName,
    authorizationServers,
    scopesSupported,
    defaultProjectId: env.FIREBASE_PROJECT_ID || undefined,
    defaultDatabaseUrl: env.FIREBASE_DATABASE_URL?.replace(/\/+$/, "") || undefined,
    defaultStorageBucket: env.FIREBASE_STORAGE_BUCKET || undefined,
    defaultFunctionsLocation: env.FIREBASE_FUNCTIONS_LOCATION || "us-central1",
  };
}

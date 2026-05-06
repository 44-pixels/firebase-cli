import type { Config } from "./config.js";

export class GoogleApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body: unknown,
  ) {
    const detail =
      typeof body === "object" && body && "error" in body
        ? JSON.stringify((body as { error: unknown }).error)
        : typeof body === "string"
          ? body
          : JSON.stringify(body);
    super(`Google API ${status} ${statusText}: ${detail}`);
    this.name = "GoogleApiError";
  }
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface GoogleRequestOptions {
  method?: HttpMethod;
  /** Either a fully-qualified `https://...` URL, or a path beginning with `/`
   *  that will be resolved against `baseUrl`. */
  url: string;
  /** Used to resolve a path-only `url`. Defaults to `https://firebase.googleapis.com`. */
  baseUrl?: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  /** Override the Accept header (defaults to application/json). */
  accept?: string;
  /** Treat the response as opaque text instead of JSON-decoding it. */
  asText?: boolean;
}

const DEFAULT_BASE = "https://firebase.googleapis.com";

export class GoogleClient {
  readonly accessToken: string;
  readonly defaultProjectId?: string;
  readonly defaultDatabaseUrl?: string;
  readonly defaultStorageBucket?: string;
  readonly defaultFunctionsLocation: string;

  constructor(config: Config, accessToken: string) {
    this.accessToken = accessToken;
    this.defaultProjectId = config.defaultProjectId;
    this.defaultDatabaseUrl = config.defaultDatabaseUrl;
    this.defaultStorageBucket = config.defaultStorageBucket;
    this.defaultFunctionsLocation = config.defaultFunctionsLocation;
  }

  /** Returns the project id to use, throwing if neither argument nor default is set. */
  projectId(override?: string): string {
    const id = override ?? this.defaultProjectId;
    if (!id) {
      throw new Error(
        "No Firebase project id supplied. Pass `project_id` to the tool or set FIREBASE_PROJECT_ID.",
      );
    }
    return id;
  }

  databaseUrl(override?: string): string {
    const url = (override ?? this.defaultDatabaseUrl)?.replace(/\/+$/, "");
    if (!url) {
      throw new Error(
        "No Realtime Database URL supplied. Pass `database_url` to the tool or set FIREBASE_DATABASE_URL.",
      );
    }
    return url;
  }

  storageBucket(override?: string): string {
    const bucket = override ?? this.defaultStorageBucket;
    if (!bucket) {
      throw new Error(
        "No storage bucket supplied. Pass `bucket` to the tool or set FIREBASE_STORAGE_BUCKET.",
      );
    }
    return bucket;
  }

  async request<T = unknown>({
    method = "GET",
    url,
    baseUrl = DEFAULT_BASE,
    query,
    body,
    accept,
    asText = false,
  }: GoogleRequestOptions): Promise<T> {
    const isAbsolute = /^https?:\/\//i.test(url);
    const target = isAbsolute ? new URL(url) : new URL(url.startsWith("/") ? url : `/${url}`, baseUrl);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null && value !== "") {
          target.searchParams.set(key, String(value));
        }
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: accept ?? "application/json",
    };
    let payload: string | Uint8Array | undefined;
    if (body !== undefined) {
      if (typeof body === "string" || body instanceof Uint8Array) {
        payload = body;
        if (!headers["Content-Type"]) headers["Content-Type"] = "application/octet-stream";
      } else {
        headers["Content-Type"] = "application/json";
        payload = JSON.stringify(body);
      }
    }

    const res = await fetch(target, { method, headers, body: payload });
    const text = await res.text();
    let parsed: unknown = text;
    if (text && !asText) {
      try {
        parsed = JSON.parse(text);
      } catch {
        // leave as text
      }
    }
    if (!res.ok) {
      throw new GoogleApiError(res.status, res.statusText, parsed);
    }
    return parsed as T;
  }
}

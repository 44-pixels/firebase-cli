import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { GoogleApiError } from "../google.js";

export function jsonResult(data: unknown): CallToolResult {
  const text =
    typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: "text", text: text || "(empty response)" }] };
}

export function errorResult(err: unknown): CallToolResult {
  const message =
    err instanceof GoogleApiError
      ? `${err.status} ${err.statusText}: ${typeof err.body === "string" ? err.body : JSON.stringify(err.body)}`
      : err instanceof Error
        ? err.message
        : String(err);
  return { isError: true, content: [{ type: "text", text: message }] };
}

export async function run<T>(fn: () => Promise<T>): Promise<CallToolResult> {
  try {
    return jsonResult(await fn());
  } catch (err) {
    return errorResult(err);
  }
}

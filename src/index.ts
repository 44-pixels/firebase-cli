#!/usr/bin/env node
import type { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";

import { loadConfig, type Config } from "./config.js";
import { GoogleClient } from "./google.js";
import { requireBearerToken } from "./auth.js";
import { createMetadataRouter, protectedResourceMetadataUrl } from "./resource.js";
import { registerAllTools } from "./tools/index.js";

const PKG_NAME = "firebase-mcp";
const PKG_VERSION = "0.1.0";

function buildMcpServer(google: GoogleClient): McpServer {
  const server = new McpServer({ name: PKG_NAME, version: PKG_VERSION });
  registerAllTools(server, google);
  return server;
}

function printStartupBanner(config: Config, prmUrl: string): void {
  const lines = [
    `${PKG_NAME} v${PKG_VERSION}`,
    `MCP endpoint:          ${config.resourceUrl}`,
    `Resource metadata:     ${prmUrl}`,
    `Authorization servers: ${config.authorizationServers.join(", ")}`,
    `Default project:       ${config.defaultProjectId ?? "(none — pass project_id per call)"}`,
    `Default RTDB URL:      ${config.defaultDatabaseUrl ?? "(none)"}`,
    `Default GCS bucket:    ${config.defaultStorageBucket ?? "(none)"}`,
    `Default fns location:  ${config.defaultFunctionsLocation}`,
  ];
  console.log(lines.map((l) => `  ${l}`).join("\n"));
}

async function main(): Promise<void> {
  const config = loadConfig();
  const prmUrl = protectedResourceMetadataUrl(config);

  // Bind on all interfaces; auth is enforced by Bearer token validation, not
  // hostname allow-listing.
  const app = createMcpExpressApp({ host: "0.0.0.0" });

  // Public discovery endpoints — no auth.
  app.use(createMetadataRouter(config));

  app.get("/", (_req: Request, res: Response) => {
    res.json({
      name: PKG_NAME,
      version: PKG_VERSION,
      mcp_endpoint: config.resourceUrl,
      protected_resource_metadata: prmUrl,
      authorization_servers: config.authorizationServers,
    });
  });

  // The MCP endpoint requires a Google OAuth bearer token issued by the
  // upstream authorization server (Gatana, Google, etc.). The token is forwarded
  // verbatim as the Authorization header on every outbound Google API call.
  const requireToken = requireBearerToken({ resourceMetadataUrl: prmUrl });

  app.post("/mcp", requireToken, async (req: Request, res: Response) => {
    const token = req.googleToken!;
    const google = new GoogleClient(config, token);
    const server = buildMcpServer(google);
    try {
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on("close", () => {
        transport.close().catch(() => undefined);
        server.close().catch(() => undefined);
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("Error handling MCP request:", err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  const methodNotAllowed = (_req: Request, res: Response) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    });
  };
  app.get("/mcp", methodNotAllowed);
  app.delete("/mcp", methodNotAllowed);

  app.listen(config.port, "0.0.0.0", (err?: Error) => {
    if (err) {
      console.error("Failed to start server:", err);
      process.exit(1);
    }
    console.log(`\n${PKG_NAME} listening on :${config.port}`);
    printStartupBanner(config, prmUrl);
  });

  const shutdown = (signal: string) => {
    console.log(`\nReceived ${signal}, shutting down…`);
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

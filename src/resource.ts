import { Router, type Request, type Response } from "express";
import type { Config } from "./config.js";

/**
 * Per RFC 9728, the path is `/.well-known/oauth-protected-resource` followed
 * by the path component of the resource URL.
 */
export function protectedResourceMetadataUrl(config: Config): string {
  const u = new URL(config.resourceUrl);
  const rsPath = u.pathname && u.pathname !== "/" ? u.pathname : "";
  return new URL(`/.well-known/oauth-protected-resource${rsPath}`, u).href;
}

function pathOf(url: string): string {
  const p = new URL(url).pathname;
  return p === "/" ? "" : p;
}

export function buildProtectedResourceMetadata(config: Config) {
  return {
    resource: config.resourceUrl,
    authorization_servers: config.authorizationServers,
    scopes_supported: config.scopesSupported,
    bearer_methods_supported: ["header"],
    resource_name: config.resourceName,
  };
}

export function createMetadataRouter(config: Config): Router {
  const router = Router();
  const metadata = buildProtectedResourceMetadata(config);

  const rsPath = pathOf(config.resourceUrl);
  const handler = (_req: Request, res: Response) => {
    res
      .set("Cache-Control", "public, max-age=300")
      .set("Access-Control-Allow-Origin", "*")
      .json(metadata);
  };

  router.get("/.well-known/oauth-protected-resource", handler);
  if (rsPath) {
    router.get(`/.well-known/oauth-protected-resource${rsPath}`, handler);
  }

  return router;
}

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GoogleClient } from "../google.js";

import { registerIdentityTools } from "./identity.js";
import { registerManagementTools } from "./management.js";
import { registerFirestoreTools } from "./firestore.js";
import { registerRtdbTools } from "./rtdb.js";
import { registerMessagingTools } from "./messaging.js";
import { registerHostingTools } from "./hosting.js";
import { registerRemoteConfigTools } from "./remoteconfig.js";
import { registerFunctionsTools } from "./functions.js";
import { registerStorageTools } from "./storage.js";
import { registerRawTool } from "./raw.js";

export function registerAllTools(server: McpServer, google: GoogleClient): void {
  registerIdentityTools(server, google);
  registerManagementTools(server, google);
  registerFirestoreTools(server, google);
  registerRtdbTools(server, google);
  registerMessagingTools(server, google);
  registerHostingTools(server, google);
  registerRemoteConfigTools(server, google);
  registerFunctionsTools(server, google);
  registerStorageTools(server, google);
  registerRawTool(server, google);
}

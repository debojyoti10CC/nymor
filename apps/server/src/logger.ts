import pino from "pino";
import { config } from "./config.js";

// MCP stdio transport uses stdout for protocol messages — the logger must
// never write there, only to the log file.
export const logger = pino(
  { level: config.logLevel },
  pino.destination({ dest: config.logPath, sync: false }),
);

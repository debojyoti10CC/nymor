import pino from "pino";
import { config } from "./config.js";

export const logger = pino(
  { level: config.logLevel },
  pino.destination({ dest: config.logPath, sync: false }),
);

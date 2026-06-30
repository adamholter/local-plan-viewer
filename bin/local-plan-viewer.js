#!/usr/bin/env node
import { startServer } from "../src/server.js";

const args = process.argv.slice(2);
const opts = {};

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === "--root") opts.root = args[++i];
  else if (arg === "--port") opts.port = Number(args[++i]);
  else if (arg === "--host") opts.host = args[++i];
  else if (arg === "--open") opts.open = true;
  else if (arg === "--help" || arg === "-h") {
    console.log(`Usage: local-plan-viewer [--root <plans-dir>] [--port 8796] [--host 127.0.0.1] [--open]

Default root:
  ./demo-plans
`);
    process.exit(0);
  }
}

await startServer(opts);

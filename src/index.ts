#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { logStderr } from './lib/log.js';
import { createServer } from './server.js';

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr (stdout is reserved for MCP protocol on stdio)
  logStderr('MCP server started on stdio');
}

main().catch((error: unknown) => {
  logStderr(
    `Fatal error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
  );
  process.exit(1);
});

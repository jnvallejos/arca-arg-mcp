#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr (stdout is reserved for MCP protocol on stdio)
  console.error('[arca-arg-mcp] MCP server started on stdio');
}

main().catch((error: unknown) => {
  console.error('[arca-arg-mcp] Fatal error:', error);
  process.exit(1);
});

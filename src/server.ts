import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { handlePing, pingTool } from './tools/ping.js';

export function createServer(): Server {
  const server = new Server(
    {
      name: 'arca-arg-mcp',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [pingTool],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'ping':
        return handlePing(args);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });

  return server;
}

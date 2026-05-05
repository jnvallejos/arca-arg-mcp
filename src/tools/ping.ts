import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const pingTool: Tool = {
  name: 'ping',
  description: 'Health check tool. Returns "pong" to verify the MCP server is reachable.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

export async function handlePing(_args: unknown): Promise<{
  content: Array<{ type: 'text'; text: string }>;
}> {
  return {
    content: [
      {
        type: 'text',
        text: 'pong',
      },
    ],
  };
}

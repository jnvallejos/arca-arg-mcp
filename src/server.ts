import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { loadConfig } from './config/env.js';
import type { ArcaConfig } from './config/types.js';
import { WSAA_ENDPOINTS } from './config/types.js';
import { logStderr, logStderrWarn } from './lib/log.js';
import { arcaConsultarCuitTool, handleArcaConsultarCuit } from './tools/arca-consultar-cuit.js';
import { arcaStatusTool, handleArcaStatus } from './tools/arca-status.js';
import { handlePing, pingTool } from './tools/ping.js';

export function createServer(): Server {
  const config = loadConfig();
  logStartupInfo(config);

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
    tools: [pingTool, arcaStatusTool, arcaConsultarCuitTool],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'ping':
        return handlePing(args);
      case 'arca_status':
        return handleArcaStatus(config, args);
      case 'arca_consultar_cuit':
        return handleArcaConsultarCuit(config, args);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });

  return server;
}

function logStartupInfo(config: ArcaConfig): void {
  const endpoints = WSAA_ENDPOINTS[config.env];
  if (config.env === 'production') {
    logStderrWarn('Starting in PRODUCTION mode. CAEs will be legally valid.');
  } else {
    logStderr(`Starting in HOMOLOGATION mode (ARCA_ENV=${config.env})`);
  }
  logStderr(`CUIT: ${config.cuit}`);
  logStderr(`WSAA endpoint: ${endpoints.url}`);
  logStderr(`Cert path: ${config.certPath}`);
  logStderr(`Cache dir: ${config.cacheDir}`);
}

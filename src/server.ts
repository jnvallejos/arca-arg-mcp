import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { loadConfig } from './config/env.js';
import type { ArcaConfig } from './config/types.js';
import { WSAA_ENDPOINTS } from './config/types.js';
import { logStderr, logStderrWarn } from './lib/log.js';
import {
  arcaConsultarComprobanteTool,
  handleArcaConsultarComprobante,
} from './tools/arca-consultar-comprobante.js';
import { arcaConsultarCuitTool, handleArcaConsultarCuit } from './tools/arca-consultar-cuit.js';
import {
  arcaConsultarFacturaExportacionTool,
  handleArcaConsultarFacturaExportacion,
} from './tools/arca-consultar-factura-exportacion.js';
import { arcaEmitirFacturaTool, handleArcaEmitirFactura } from './tools/arca-emitir-factura.js';
import {
  arcaEmitirFacturaExportacionTool,
  handleArcaEmitirFacturaExportacion,
} from './tools/arca-emitir-factura-exportacion.js';
import {
  arcaListarTiposComprobanteTool,
  handleArcaListarTiposComprobante,
} from './tools/arca-listar-tipos-comprobante.js';
import {
  arcaObtenerCotizacionMonedaTool,
  handleArcaObtenerCotizacionMoneda,
} from './tools/arca-obtener-cotizacion-moneda.js';
import {
  arcaObtenerUltimoComprobanteTool,
  handleArcaObtenerUltimoComprobante,
} from './tools/arca-obtener-ultimo-comprobante.js';
import {
  arcaObtenerUltimoComprobanteExportacionTool,
  handleArcaObtenerUltimoComprobanteExportacion,
} from './tools/arca-obtener-ultimo-comprobante-exportacion.js';
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
    tools: [
      pingTool,
      arcaStatusTool,
      arcaConsultarCuitTool,
      arcaEmitirFacturaTool,
      arcaObtenerUltimoComprobanteTool,
      arcaConsultarComprobanteTool,
      arcaListarTiposComprobanteTool,
      arcaEmitirFacturaExportacionTool,
      arcaObtenerUltimoComprobanteExportacionTool,
      arcaConsultarFacturaExportacionTool,
      arcaObtenerCotizacionMonedaTool,
    ],
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
      case 'arca_emitir_factura':
        return handleArcaEmitirFactura(config, args);
      case 'arca_obtener_ultimo_comprobante':
        return handleArcaObtenerUltimoComprobante(config, args);
      case 'arca_consultar_comprobante':
        return handleArcaConsultarComprobante(config, args);
      case 'arca_listar_tipos_comprobante':
        return handleArcaListarTiposComprobante(args);
      case 'arca_emitir_factura_exportacion':
        return handleArcaEmitirFacturaExportacion(config, args);
      case 'arca_obtener_ultimo_comprobante_exportacion':
        return handleArcaObtenerUltimoComprobanteExportacion(config, args);
      case 'arca_consultar_factura_exportacion':
        return handleArcaConsultarFacturaExportacion(config, args);
      case 'arca_obtener_cotizacion_moneda':
        return handleArcaObtenerCotizacionMoneda(config, args);
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

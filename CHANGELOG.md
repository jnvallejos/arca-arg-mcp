# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] — 2026-05-14

### Added

- WSAA certificate-based authentication with file-based TA caching
- Padrón A13 CUIT lookup (`arca_consultar_cuit`)
- WSFE Factura A / B / C emission, query, and listing
  - `arca_emitir_factura`
  - `arca_obtener_ultimo_comprobante`
  - `arca_consultar_comprobante`
  - `arca_listar_tipos_comprobante`
- WSFEX Factura E (export) emission, query, and currency cotización
  - `arca_emitir_factura_exportacion`
  - `arca_obtener_ultimo_comprobante_exportacion`
  - `arca_consultar_factura_exportacion`
  - `arca_obtener_cotizacion_moneda`
- Health-check and status tools (`ping`, `arca_status`)
- Friendly Spanish-language error hints for common ARCA codes (RG 5616, validations 500/607/608/609/650/1550/1671/1672/1674/1736/1820/10246)
- Smoke scripts for all four web services
- MCP stdio transport, single-tenant, no external dependencies beyond ARCA
- Bilingual README (English + Spanish)
- Mermaid architecture diagram
- Demo gif showing Claude Desktop integration
- npm package published as `arca-arg-mcp`

### Known limitations (deferred to V2)

- Notas de Crédito and Notas de Débito (WSFE tipos 2, 3, 7, 8, 12, 13)
- Permisos de embarque (WSFEX physical-goods export)
- Notas de Crédito and Débito de Exportación (WSFEX tipos 20, 21)
- Comprobantes asociados (`CmpAsoc`)
- Opcionales (`Opcionales`)
- Tributos array (provincial perceptions, internal taxes)
- Batch emission

[Unreleased]: https://github.com/jnvallejos/arca-arg-mcp/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/jnvallejos/arca-arg-mcp/releases/tag/v1.0.0

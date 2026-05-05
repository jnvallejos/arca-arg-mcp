# Phase 0 Spec — Project Setup & MCP Scaffolding

**Repo:** `arca-arg-mcp`
**Path:** `/Users/javiervallejos/Projects/arca-arg-mcp`
**Stack:** TypeScript 5.x, Node.js 20+, Vitest, MCP SDK
**Approach:** Project scaffolding + CI + minimal MCP server stub
**Branch:** `phase-0-setup`

---

## 1. Goal of Phase 0

Set up the repository with a working TypeScript + MCP scaffolding that:
- Compiles cleanly
- Has CI green on first push
- Exposes a single trivial MCP tool (`ping`) that returns "pong"
- Establishes all conventions (linting, testing, commits) for subsequent phases

At the end of Phase 0:
- Repo is fully bootstrapped (package.json, tsconfig, etc.)
- `npm install` works
- `npm run build` produces a working `dist/index.js`
- `npm test` runs Vitest with at least one passing test
- `npm run lint` runs and passes
- A `ping` MCP tool exists and is invokable
- GitHub Actions CI runs on push and PR
- README has a minimal "what this is" intro
- LICENSE (MIT) is committed
- `CLAUDE.md` exists at repo root with operating conventions
- `docs/phase-0-spec.md` is committed

**No fiscal logic yet. No SOAP. No certs. Just clean scaffolding.**

---

## 2. Folder Structure

```
arca-arg-mcp/
├── .github/
│   └── workflows/
│       └── ci.yml
├── docs/
│   └── phase-0-spec.md
├── src/
│   ├── index.ts                  # MCP server entry point
│   ├── server.ts                 # MCP server factory
│   └── tools/
│       └── ping.ts               # Trivial ping tool
├── tests/
│   └── ping.test.ts
├── .gitignore
├── .editorconfig
├── biome.json                    # Linter + formatter config
├── CLAUDE.md
├── LICENSE
├── package.json
├── README.md
├── tsconfig.json
└── vitest.config.ts
```

---

## 3. Package & Tooling Setup

### 3.1 `package.json`

Key fields:

```json
{
  "name": "arca-arg-mcp",
  "version": "0.1.0",
  "description": "MCP server for Argentine tax compliance with ARCA (ex-AFIP) web services",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "arca-arg-mcp": "dist/index.js"
  },
  "files": ["dist", "README.md", "LICENSE"],
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "biome check src tests",
    "lint:fix": "biome check --write src tests",
    "typecheck": "tsc --noEmit"
  },
  "keywords": [
    "mcp",
    "model-context-protocol",
    "argentina",
    "afip",
    "arca",
    "factura-electronica",
    "claude"
  ],
  "author": "Javier Vallejos <https://github.com/jnvallejos>",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/jnvallejos/arca-arg-mcp.git"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

### 3.2 Dependencies

**Production (Phase 0 minimal):**
- `@modelcontextprotocol/sdk` — Latest stable

**Dev:**
- `typescript` — 5.x
- `tsx` — TS execution for dev
- `vitest` — Test runner
- `@vitest/coverage-v8` — Coverage
- `@biomejs/biome` — Linter + formatter (single tool, fast, no eslint+prettier overhead)
- `@types/node` — Node types

**Decision: Biome over ESLint+Prettier.**
- Single binary, single config, much faster
- Good TS support out of the box
- Fewer config files in repo root
- If contributors complain in V2, can swap. Not a portfolio risk.

### 3.3 `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**Notes:**
- ESM via `"module": "ES2022"` + `"type": "module"` in package.json
- Strict mode on. No `any` allowed by default.
- `tests/` excluded from main tsconfig; Vitest handles its own TS compilation via tsx/esbuild

### 3.4 `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 80,
        statements: 85,
      },
    },
  },
});
```

**Notes:**
- `globals: false` — explicit imports of `describe`, `it`, `expect`. No magic globals.
- Coverage thresholds enforced from Phase 0; later phases can't bypass.
- `src/index.ts` excluded from coverage (it's just the boot script).

### 3.5 `biome.json`

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "style": {
        "useImportType": "error",
        "noNonNullAssertion": "error"
      },
      "suspicious": {
        "noConsoleLog": "warn"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100,
    "lineEnding": "lf"
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "trailingCommas": "all",
      "semicolons": "always"
    }
  }
}
```

### 3.6 `.gitignore`

Standard Node + IDE exclusions. Plus:

```
# Build artifacts
dist/
*.tsbuildinfo

# Coverage
coverage/

# Node
node_modules/

# OS
.DS_Store

# IDE
.vscode/
.idea/

# Env
.env
.env.local

# ARCA-specific (never commit certs or keys, ever, even by accident)
*.key
*.pem
*.crt
*.p12
*.pfx
arca/
certs/
```

### 3.7 `.editorconfig`

```
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false
```

---

## 4. MCP Server Scaffolding

### 4.1 `src/index.ts`

Entry point. Wires up the server and starts stdio transport.

```typescript
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
```

**Notes:**
- Shebang line for direct execution after `chmod +x dist/index.js` (handled by build pipeline)
- All log output goes to **stderr**, never stdout, because stdout is reserved for MCP protocol messages on stdio transport. This is critical.
- `process.exit(1)` on fatal error so Claude Desktop knows the server crashed

### 4.2 `src/server.ts`

Factory function that creates and configures the MCP server. Phase 0 exposes only the `ping` tool.

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { pingTool, handlePing } from './tools/ping.js';

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
```

**Notes:**
- Server factory pattern (not singleton) so tests can instantiate fresh servers
- Request handlers separated by tool: each tool owns its schema and handler
- The switch statement will grow as tools are added in subsequent phases

### 4.3 `src/tools/ping.ts`

The Phase 0 tool. Trivial. Validates the MCP plumbing works end-to-end.

```typescript
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const pingTool: Tool = {
  name: 'ping',
  description:
    'Health check tool. Returns "pong" to verify the MCP server is reachable.',
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
```

---

## 5. Tests

### 5.1 `tests/ping.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import { handlePing, pingTool } from '../src/tools/ping.js';

describe('ping tool', () => {
  describe('definition', () => {
    it('exposes the correct tool name', () => {
      expect(pingTool.name).toBe('ping');
    });

    it('has a non-empty description', () => {
      expect(pingTool.description).toBeTruthy();
      expect(pingTool.description?.length).toBeGreaterThan(10);
    });

    it('declares an empty input schema', () => {
      expect(pingTool.inputSchema.type).toBe('object');
      expect(pingTool.inputSchema.required).toEqual([]);
    });
  });

  describe('handler', () => {
    it('returns "pong" as text content', async () => {
      const result = await handlePing({});
      expect(result.content).toEqual([
        { type: 'text', text: 'pong' },
      ]);
    });

    it('ignores unexpected arguments', async () => {
      const result = await handlePing({ unexpected: 'value' });
      expect(result.content[0]).toMatchObject({ text: 'pong' });
    });
  });
});
```

**Notes:**
- Tests are descriptive: `it('returns "pong" as text content')`
- Two `describe` blocks separate definition (the tool metadata) from behavior (the handler)
- `handlePing` is tested in isolation; full server roundtrip testing comes in Phase 1+ as needed

---

## 6. CI

### 6.1 `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build-and-test:
    name: Build and test
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Typecheck
        run: npm run typecheck

      - name: Test with coverage
        run: npm test -- --coverage

      - name: Build
        run: npm run build

      - name: Upload coverage
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: coverage/
          retention-days: 30
```

**Decisions:**
- Single OS (Ubuntu). No matrix. Faster CI.
- Node 20 LTS pinned at major version; minor/patch updates apply automatically.
- Order matters: lint → typecheck → test → build. Catches issues at the cheapest stage first.
- `npm ci` instead of `npm install` for reproducible CI builds (uses package-lock.json strictly).
- Coverage uploaded as artifact, no third-party services.

---

## 7. README (Phase 0 minimal)

`README.md` for Phase 0. Just enough to introduce the project; full polish lands in Phase 5.

```markdown
# arca-arg-mcp

[![CI](https://github.com/jnvallejos/arca-arg-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/jnvallejos/arca-arg-mcp/actions/workflows/ci.yml)

MCP (Model Context Protocol) server for Argentine tax compliance. Exposes ARCA (ex-AFIP) web services as tools usable from Claude Desktop, Claude Code, and any MCP-compatible client.

> **Status: in development.** This repo is being built phase by phase.

## What it will do

- Authenticate with ARCA via WSAA (certificate-based)
- Validate CUITs against the Padrón web service
- Emit electronic invoices (Factura A, B, C) via WSFE
- Emit export invoices (Factura E) via WSFEX

## Status

- [x] Phase 0 — Project setup and MCP scaffolding
- [ ] Phase 1 — WSAA authentication
- [ ] Phase 2 — Padrón (CUIT lookup)
- [ ] Phase 3 — WSFE (Factura A, B, C)
- [ ] Phase 4 — WSFEX (Factura E)
- [ ] Phase 5 — Release v1.0.0

## Development

Requires Node.js 20+.

\`\`\`bash
npm install
npm test
npm run build
\`\`\`

## License

MIT — see [LICENSE](LICENSE).
```

---

## 8. LICENSE

Standard MIT, year 2026, copyright "Javier Vallejos". Full text identical to the format used in `url-shortener` Phase 5 spec section 5.1.

---

## 9. CLAUDE.md

This file lives at repo root and contains operating conventions persistent across all phases.

```markdown
# Operating Conventions

This repo is built phase by phase. These conventions apply throughout.

## Git authorship

- Commits are made directly with `git commit -m "..."`. Do not ask for confirmation per commit.
- Do NOT add "Co-authored-by: Claude" or any AI signature to commit messages.
- Do NOT add emojis to commits.
- Do NOT add footer signatures.
- Author identity stays as the locally configured git user.

## Commit messages

- Conventional Commits format: `type(scope): description`
- Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `style`
- Scopes per project (Phase 0): `repo`, `ci`, `tools`, `docs`
- English, present tense, lowercase, no trailing period
- Single line, max 72 characters
- No extended body unless the decision is non-obvious

## Push policy

- Do NOT push automatically.
- The repo owner pushes manually after verifying build and tests pass locally.

## End-of-phase behavior

- Run `npm test`, `npm run lint`, `npm run build` and verify all green.
- Verify acceptance criteria from the corresponding phase spec.
- Communicate "Phase N complete", list acceptance criteria with checkmarks, then stop.
- Do NOT start the next phase on your own.

## Out-of-scope rejections

- If the phase spec doesn't list a feature, do not add it.
- If the user asks for a feature not in the spec, ask whether it should be added to the current phase or deferred.
```

---

## 10. Commit Convention — Phase 0

Same Conventional Commits as `url-shortener`. Scopes for this phase:

- `repo`: anything touching repo-level files (LICENSE, gitignore, editorconfig, README)
- `ci`: GitHub Actions workflow
- `tools`: `src/tools/*`
- `docs`: any `docs/*` content
- `chore`: tooling and config files (package.json, tsconfig, biome, vitest)

**Granularity:** TDD pair = one commit (test + impl together is acceptable in Phase 0; subsequent phases will be stricter).

**Example commit sequence (illustrative):**

```
chore(repo): add CLAUDE.md with operating conventions
chore(repo): add gitignore and editorconfig
chore(repo): add MIT license
chore: bootstrap typescript project with package.json and tsconfig
chore: add biome lint and format config
chore: add vitest config with coverage thresholds
feat(tools): add ping tool with handler
test(tools): add ping tool tests
chore: add MCP server factory and stdio entrypoint
chore(ci): add github actions workflow for build, lint, test
docs: add phase-0-spec.md
docs(repo): add minimal README with status badge
```

---

## 11. What NOT to Do in Phase 0

- **Do not** add fiscal logic (WSAA, WSFE, etc.). That's Phase 1+.
- **Do not** add SOAP client dependencies. Not yet needed.
- **Do not** add ESLint or Prettier (Biome handles both).
- **Do not** add Husky / lint-staged pre-commit hooks. Out of scope; CI catches issues.
- **Do not** add Docker / docker-compose. Out of scope.
- **Do not** add Dependabot / Renovate config files. Manual updates for portfolio repo.
- **Do not** add issue templates / PR templates. Solo-author repo.
- **Do not** add a `CONTRIBUTING.md`. Not soliciting contributions yet.
- **Do not** add a code of coverage / Codecov / Coveralls integration. Coverage as workflow artifact is enough.
- **Do not** publish to npm. That happens in Phase 5.
- **Do not** add tools for cert generation or any AFIP-specific functionality.
- **Do not** add NPM packages outside the allowed list:
  - Production: `@modelcontextprotocol/sdk`
  - Dev: `typescript`, `tsx`, `vitest`, `@vitest/coverage-v8`, `@biomejs/biome`, `@types/node`

---

## 12. Acceptance Criteria for Phase 0

Before opening the PR:

- [ ] `npm install` completes without errors or warnings
- [ ] `npm run lint` passes with zero warnings
- [ ] `npm run typecheck` passes with zero errors
- [ ] `npm test` passes with all ping tool tests green
- [ ] `npm test -- --coverage` reports >85% line coverage
- [ ] `npm run build` produces `dist/index.js` and `dist/index.d.ts`
- [ ] `node dist/index.js` starts the MCP server (verify "MCP server started on stdio" appears on stderr; Ctrl+C to exit)
- [ ] CI workflow file exists at `.github/workflows/ci.yml`
- [ ] CLAUDE.md exists at repo root
- [ ] LICENSE file at repo root with MIT, 2026, "Javier Vallejos"
- [ ] README has CI badge in correct position
- [ ] `docs/phase-0-spec.md` is committed (this file)
- [ ] All commits follow conventional commits with allowed scopes
- [ ] No AI signatures in any commit
- [ ] Branch `phase-0-setup` exists locally
- [ ] PR opened against `main`, NOT merged

After PR opened:

- [ ] CI workflow runs and passes (green badge in PR)

---

## 13. Branch & PR Workflow — Phase 0

1. Verify clean state on `main`: `git status` should show clean tree, `git log` should be empty (fresh repo).
2. Create branch: `git checkout -b phase-0-setup`
3. Implement following section 10 commit sequence
4. Verify acceptance criteria from section 12 locally
5. Push: `git push -u origin phase-0-setup`
6. Open PR: `gh pr create --base main --head phase-0-setup --title "Phase 0: Project Setup and MCP Scaffolding"` with body containing:
   - Summary paragraph
   - Acceptance criteria checklist from section 12
   - Note: "First phase of the project. No fiscal logic yet, just clean scaffolding."
7. Do NOT merge.
8. Report: "Phase 0 complete. PR opened: <URL>. Acceptance criteria checked. Awaiting review." and stop.

---

## 14. Handoff to Phase 1 (preview, not in scope)

Phase 1 will add:
- WSAA authentication (XML signing with certificate, SOAP call)
- TA (Token de Acceso) cache layer
- Configuration loading from environment variables (`ARCA_ENV`, `ARCA_CUIT`, `ARCA_CERT_PATH`, `ARCA_KEY_PATH`)
- New tool: `wsaa_get_token` (probably internal/diagnostic)
- New dev dep: `strong-soap`
- New runtime dep: probably `node-forge` or use built-in crypto for XML signing (decision in Phase 1)

Phase 0 stays focused on scaffolding. Resist the urge to anticipate Phase 1 needs.

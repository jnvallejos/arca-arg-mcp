const PREFIX = '[arca-arg-mcp]';

export function logStderr(message: string): void {
  console.error(`${PREFIX} ${message}`);
}

export function logStderrWarn(message: string): void {
  console.error(`${PREFIX} ⚠️  ${message}`);
}

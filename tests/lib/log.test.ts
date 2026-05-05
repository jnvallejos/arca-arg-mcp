import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logStderr, logStderrWarn } from '../../src/lib/log.js';

describe('log helpers', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stdoutWriteSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((() => true) as typeof process.stdout.write);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    stdoutWriteSpy.mockRestore();
  });

  it('logStderr writes through console.error with [arca-arg-mcp] prefix', () => {
    logStderr('hello world');
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith('[arca-arg-mcp] hello world');
  });

  it('logStderr does NOT write to stdout', () => {
    logStderr('quiet message');
    expect(stdoutWriteSpy).not.toHaveBeenCalled();
  });

  it('logStderrWarn writes through console.error with prefix and warning emoji', () => {
    logStderrWarn('production alert');
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const arg = consoleErrorSpy.mock.calls[0]?.[0] as string;
    expect(arg).toContain('[arca-arg-mcp]');
    expect(arg).toContain('⚠️');
    expect(arg).toContain('production alert');
  });

  it('logStderrWarn does NOT write to stdout', () => {
    logStderrWarn('warning');
    expect(stdoutWriteSpy).not.toHaveBeenCalled();
  });

  it('preserves call order across multiple invocations', () => {
    logStderr('first');
    logStderrWarn('second');
    logStderr('third');
    expect(consoleErrorSpy).toHaveBeenCalledTimes(3);
    expect(consoleErrorSpy.mock.calls[0]?.[0]).toBe('[arca-arg-mcp] first');
    expect(consoleErrorSpy.mock.calls[1]?.[0]).toContain('second');
    expect(consoleErrorSpy.mock.calls[2]?.[0]).toBe('[arca-arg-mcp] third');
  });
});

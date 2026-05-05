import { homedir } from 'node:os';
import { isAbsolute, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolvePath } from '../../src/lib/path.js';

describe('resolvePath', () => {
  it('resolves ~/foo to absolute path under home dir', () => {
    const result = resolvePath('~/projects/arca');
    expect(result).toBe(resolve(homedir(), 'projects/arca'));
    expect(isAbsolute(result)).toBe(true);
  });

  it('resolves bare ~ to home dir', () => {
    expect(resolvePath('~')).toBe(homedir());
  });

  it('passes through absolute paths unchanged', () => {
    const absolute = '/etc/passwd';
    expect(resolvePath(absolute)).toBe(absolute);
  });

  it('resolves relative paths against CWD', () => {
    expect(resolvePath('foo/bar')).toBe(resolve(process.cwd(), 'foo/bar'));
  });

  it('resolves "./relative" against CWD', () => {
    expect(resolvePath('./certs/key.pem')).toBe(resolve(process.cwd(), 'certs/key.pem'));
  });

  it('handles trailing slashes correctly for tilde paths', () => {
    expect(resolvePath('~/foo/')).toBe(resolve(homedir(), 'foo/'));
  });

  it('does not interpret ~user/foo as tilde expansion (V1 limitation)', () => {
    const result = resolvePath('~user/foo');
    // Treated as a relative path resolved against CWD, not as user-home expansion
    expect(result).toBe(resolve(process.cwd(), '~user/foo'));
  });
});

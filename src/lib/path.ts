import { homedir } from 'node:os';
import { isAbsolute, resolve } from 'node:path';

/**
 * Resolves a path that may start with `~` (home dir) or be relative to CWD.
 * Always returns an absolute path. Deeper tilde forms (`~user/foo`) are not
 * supported and will be treated as plain relative paths.
 */
export function resolvePath(input: string): string {
  if (input === '~') {
    return homedir();
  }
  if (input.startsWith('~/')) {
    return resolve(homedir(), input.slice(2));
  }
  if (isAbsolute(input)) {
    return input;
  }
  return resolve(process.cwd(), input);
}

/**
 * Base class for all errors raised by this server.
 * Subclasses set `name` so logs and tool responses are unambiguous.
 */
export class ArcaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArcaError';
  }
}

/** Thrown when environment configuration is missing, malformed, or unreadable. */
export class ConfigError extends ArcaError {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** Thrown when a downstream tool cannot acquire a valid TA. */
export class AuthenticationError extends ArcaError {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

/** Thrown when WSAA returns a SOAP fault or a malformed response. */
export class WsaaError extends ArcaError {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'WsaaError';
    this.code = code;
  }
}

export type PadronErrorCode = 'NOT_FOUND' | 'AUTH_FAILED' | 'SERVICE_UNAVAILABLE' | 'UNKNOWN';

/**
 * Thrown when the Padrón A13 service rejects a request, returns a SOAP fault,
 * or is otherwise unreachable. The {@link code} discriminator lets callers
 * branch on the cause without parsing message text.
 */
export class PadronError extends ArcaError {
  public readonly code: PadronErrorCode;

  constructor(code: PadronErrorCode, message: string) {
    super(message);
    this.name = 'PadronError';
    this.code = code;
  }
}

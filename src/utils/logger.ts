export interface LogSink {
  info(message: string, context?: Readonly<Record<string, unknown>>): void;
  warn(message: string, context?: Readonly<Record<string, unknown>>): void;
  error(message: string, context?: Readonly<Record<string, unknown>>): void;
}

const consoleSink: LogSink = {
  info: (message, context) => console.info(message, context ?? ''),
  warn: (message, context) => console.warn(message, context ?? ''),
  error: (message, context) => console.error(message, context ?? ''),
};

/** Central, injectable logger. Callers should pass identifiers, never financial payloads. */
export class Logger {
  constructor(private readonly sink: LogSink = consoleSink, private readonly isDevelopment = false) {}

  info(message: string, context?: Readonly<Record<string, unknown>>): void {
    if (this.isDevelopment) this.sink.info(message, context);
  }

  warn(message: string, context?: Readonly<Record<string, unknown>>): void {
    this.sink.warn(message, context);
  }

  error(message: string, error?: unknown, context?: Readonly<Record<string, unknown>>): void {
    const errorContext = error instanceof Error
      ? { errorName: error.name, errorMessage: error.message }
      : error === undefined ? undefined : { errorType: typeof error };
    this.sink.error(message, { ...context, ...errorContext });
  }
}

export const logger = new Logger(consoleSink, import.meta.env.DEV && import.meta.env.MODE !== 'test');

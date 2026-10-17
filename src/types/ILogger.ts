import {LogLevel} from "./LogLevel";

export interface ILogger {

    setLevel(level: LogLevel): ILogger;

    trace(message: string, context?: Record<string, unknown>): void;

    debug(message: string, context?: Record<string, unknown>): void;

    info(message: string, context?: Record<string, unknown>): void;

    warn(message: string, context?: Record<string, unknown>): void;

    error(message: string, contextOrError?: Record<string, unknown> | Error, error?: Error): void;

    fatal(message: string, contextOrError?: Record<string, unknown> | Error, error?: Error): void;

    flush(): Promise<void>;
    close(): Promise<void>;

}

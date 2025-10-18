import {LogLevel} from "./LogLevel";

export interface ILogger {

    setLevel(level: LogLevel): ILogger;

    trace(message: string, context?: Record<string, any>): void;

    debug(message: string, context?: Record<string, any>): void;

    info(message: string, context?: Record<string, any>): void;

    warn(message: string, context?: Record<string, any>): void;

    error(message: string, contextOrError?: Record<string, any> | Error, error?: Error): void;

    fatal(message: string, contextOrError?: Record<string, any> | Error, error?: Error): void;

}

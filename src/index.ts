import {LogEntry, LogLevel, Transport, ILogger} from "./types";
import {ConsoleTransport, ElasticsearchTransport, FileTransport, SplunkTransport} from "./transports";
import {JSONFormatter, TextFormatter} from "./formatters";

export class Logger implements ILogger {
    private readonly transports: Transport[] = [];
    private tags: string[] = [];

    constructor(
        private minLevel: LogLevel = LogLevel.INFO,
        transports: Transport[] = [new ConsoleTransport()]
    ) {
        this.transports = transports;
    }

    addTransport(transport: Transport): this {
        this.transports.push(transport);
        return this;
    }

    removeTransport(transport: Transport): this {
        const index = this.transports.indexOf(transport);
        if (index > -1) {
            this.transports.splice(index, 1);
        }
        return this;
    }

    withTags(...tags: string[]): Logger {
        const child = new Logger(this.minLevel, this.transports);
        child.tags = [...this.tags, ...tags];
        return child;
    }

    setLevel(level: LogLevel): this {
        this.minLevel = level;
        return this;
    }

    private log(level: LogLevel, message: string, context?: Record<string, any>, error?: Error): void {
        if (level < this.minLevel) return;

        const entry: LogEntry = {
            level,
            message,
            timestamp: new Date(),
            context,
            error,
            tags: this.tags.length > 0 ? [...this.tags] : undefined
        };

        // Fire and forget - don't block on transport writes
        this.transports.forEach(transport => {
            try {
                const result = transport.write(entry);
                // If transport returns a promise, catch errors but don't await
                if (result instanceof Promise) {
                    result.catch(error => {
                        console.error('Async transport failed:', error);
                    });
                }
            } catch (error) {
                console.error('Sync transport failed:', error);
            }
        });
    }

    trace(message: string, context?: Record<string, any>): void {
        this.log(LogLevel.TRACE, message, context);
    }

    debug(message: string, context?: Record<string, any>): void {
        this.log(LogLevel.DEBUG, message, context);
    }

    info(message: string, context?: Record<string, any>): void {
        this.log(LogLevel.INFO, message, context);
    }

    warn(message: string, context?: Record<string, any>): void {
        this.log(LogLevel.WARN, message, context);
    }

    error(message: string, contextOrError?: Record<string, any> | Error, error?: Error): void {
        if (contextOrError instanceof Error) {
            this.log(LogLevel.ERROR, message, undefined, contextOrError);
        } else {
            this.log(LogLevel.ERROR, message, contextOrError, error);
        }
    }

    fatal(message: string, contextOrError?: Record<string, any> | Error, error?: Error): void {
        if (contextOrError instanceof Error) {
            this.log(LogLevel.FATAL, message, undefined, contextOrError);
        } else {
            this.log(LogLevel.FATAL, message, contextOrError, error);
        }
    }

    async close(): Promise<void> {
        await Promise.all(
            this.transports
                .filter(transport => transport.close)
                .map(transport => transport.close!())
        );
    }
}

// ============================================================================
// CONVENIENCE FACTORY
// ============================================================================
export function Console(level: LogLevel = LogLevel.INFO): Logger {
    return new Logger(level, [new ConsoleTransport(new TextFormatter(), level)]);
}

export function File(filePath: string, level: LogLevel = LogLevel.INFO): Logger {
    return new Logger(level, [
        new ConsoleTransport(new TextFormatter(), level),
        new FileTransport(filePath, new JSONFormatter(), level)
    ]);
}

export function Splunk(config: {
    endpoint: string;
    token: string;
    index?: string;
    level?: LogLevel;
}): Logger {
    return new Logger(config.level || LogLevel.INFO, [
        new ConsoleTransport(new TextFormatter(), config.level || LogLevel.INFO),
        new SplunkTransport(config)
    ]);
}

export function Elasticsearch(config: {
    endpoint: string;
    apiKey?: string;
    index?: string;
    level?: LogLevel;
}): Logger {
    return new Logger(config.level || LogLevel.INFO, [
        new ConsoleTransport(new TextFormatter(), config.level || LogLevel.INFO),
        new ElasticsearchTransport(config)
    ]);
}

export * from './formatters'
export * from './transports'
export * from './types'
export * from './constants'

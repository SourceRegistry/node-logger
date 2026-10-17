import {LogEntry, LogLevel, Transport, ILogger} from "./types";
import {ConsoleTransport, ElasticsearchTransport, FileTransport} from "./transports";
import {JSONFormatter, TextFormatter} from "./formatters";

interface LoggerState {
    transports: Transport[];
    pending: Set<Promise<void>>;
    errors: unknown[];
    closed: boolean;
    closePromise?: Promise<void>;
}

export class Logger implements ILogger {
    private state: LoggerState;
    private tags: string[] = [];

    constructor(
        private minLevel: LogLevel = LogLevel.INFO,
        transports: Transport[] = [new ConsoleTransport()]
    ) {
        this.state = {transports: [...transports], pending: new Set(), errors: [], closed: false};
    }

    addTransport(transport: Transport): this {
        if (this.state.closed) throw new Error('Logger is closed');
        this.state.transports.push(transport);
        return this;
    }

    removeTransport(transport: Transport): this {
        if (this.state.closed) throw new Error('Logger is closed');
        const index = this.state.transports.indexOf(transport);
        if (index > -1) {
            this.state.transports.splice(index, 1);
        }
        return this;
    }

    withTags(...tags: string[]): Logger {
        const child = new Logger(this.minLevel, []);
        child.state = this.state;
        child.tags = [...this.tags, ...tags];
        return child;
    }

    setLevel(level: LogLevel): this {
        this.minLevel = level;
        return this;
    }

    private log(level: LogLevel, message: string, context?: Record<string, unknown>, error?: Error): void {
        if (this.state.closed) throw new Error('Logger is closed');
        if (level < this.minLevel) return;

        const entry: LogEntry = {
            level,
            message,
            timestamp: new Date(),
            context,
            error,
            tags: this.tags.length > 0 ? [...this.tags] : undefined
        };

        this.state.transports.forEach(transport => {
            try {
                const result = transport.write(entry);
                if (result && typeof result.then === 'function') {
                    const pending = Promise.resolve(result).then(
                        () => undefined,
                        error => this.recordError('Async transport failed:', error)
                    );
                    this.state.pending.add(pending);
                    void pending.finally(() => this.state.pending.delete(pending));
                }
            } catch (error) {
                this.recordError('Sync transport failed:', error);
            }
        });
    }

    private recordError(message: string, error: unknown): void {
        this.state.errors.push(error);
        console.error(message, error);
    }

    private throwErrors(): void {
        if (this.state.errors.length) {
            throw new AggregateError([...new Set(this.state.errors)], 'One or more log transports failed');
        }
    }

    trace(message: string, context?: Record<string, unknown>): void {
        this.log(LogLevel.TRACE, message, context);
    }

    debug(message: string, context?: Record<string, unknown>): void {
        this.log(LogLevel.DEBUG, message, context);
    }

    info(message: string, context?: Record<string, unknown>): void {
        this.log(LogLevel.INFO, message, context);
    }

    warn(message: string, context?: Record<string, unknown>): void {
        this.log(LogLevel.WARN, message, context);
    }

    error(message: string, contextOrError?: Record<string, unknown> | Error, error?: Error): void {
        if (contextOrError instanceof Error) {
            this.log(LogLevel.ERROR, message, undefined, contextOrError);
        } else {
            this.log(LogLevel.ERROR, message, contextOrError, error);
        }
    }

    fatal(message: string, contextOrError?: Record<string, unknown> | Error, error?: Error): void {
        if (contextOrError instanceof Error) {
            this.log(LogLevel.FATAL, message, undefined, contextOrError);
        } else {
            this.log(LogLevel.FATAL, message, contextOrError, error);
        }
    }

    async flush(): Promise<void> {
        await Promise.all(this.state.pending);
        const results = await Promise.allSettled(this.state.transports.map(transport =>
            Promise.resolve().then(() => transport.flush?.())));
        for (const result of results) {
            if (result.status === 'rejected') this.state.errors.push(result.reason);
        }
        this.throwErrors();
    }

    close(): Promise<void> {
        if (this.state.closePromise) return this.state.closePromise;
        this.state.closed = true;
        this.state.closePromise = (async () => {
            await Promise.all(this.state.pending);
            const flushResults = await Promise.allSettled(this.state.transports.map(transport =>
                Promise.resolve().then(() => transport.flush?.())));
            for (const result of flushResults) {
                if (result.status === 'rejected') this.state.errors.push(result.reason);
            }
            const results = await Promise.allSettled(this.state.transports.map(transport =>
                Promise.resolve().then(() => transport.close?.())));
            for (const result of results) {
                if (result.status === 'rejected') this.state.errors.push(result.reason);
            }
            this.throwErrors();
        })();
        return this.state.closePromise;
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

// export function Splunk(config: {
//     endpoint: string;
//     token: string;
//     index?: string;
//     level?: LogLevel;
// }): Logger {
//     return new Logger(config.level || LogLevel.INFO, [
//         new ConsoleTransport(new TextFormatter(), config.level || LogLevel.INFO),
//         new SplunkTransport(config)
//     ]);
// }

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

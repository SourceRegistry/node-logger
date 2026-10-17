import { LogEntry, Transport, Formatter, LogLevel } from '../types';
import { JSONFormatter } from '../formatters';

export interface HTTPTransportConfig {
    endpoint: string;
    method?: string;
    headers?: Record<string, string>;
    formatter?: Formatter;
    batchSize?: number;
    flushInterval?: number;
    minLevel?: LogLevel;
    maxRetries?: number;
    retryDelay?: number;
    requestTimeout?: number;
    maxQueueSize?: number;
}

export class HTTPDeliveryError extends Error {
    constructor(message: string, readonly retryable: boolean) {
        super(message);
        this.name = 'HTTPDeliveryError';
    }
}

/** Batches entries and delivers them over HTTP. Call close() during shutdown. */
export class HTTPTransport implements Transport {
    private queue: LogEntry[] = [];
    private readonly timer?: NodeJS.Timeout;
    private inFlight?: Promise<void>;
    private closePromise?: Promise<void>;
    private closing = false;
    private failure?: unknown;
    protected readonly config: Required<HTTPTransportConfig>;

    constructor(config: HTTPTransportConfig, protected readonly fetch: typeof global.fetch = global.fetch) {
        if (!config.endpoint) throw new Error('HTTP endpoint is required');
        this.config = {
            endpoint: config.endpoint,
            method: 'POST', headers: {}, formatter: new JSONFormatter(), batchSize: 10,
            flushInterval: 5000, minLevel: LogLevel.INFO, maxRetries: 3,
            retryDelay: 1000, requestTimeout: 10000, maxQueueSize: 10000,
            ...Object.fromEntries(Object.entries(config).filter(([, value]) => value !== undefined)),
        };
        if (!Number.isInteger(this.config.batchSize) || this.config.batchSize < 1) throw new RangeError('batchSize must be positive');
        if (!Number.isInteger(this.config.maxQueueSize) || this.config.maxQueueSize < 1) throw new RangeError('maxQueueSize must be positive');
        if (!Number.isInteger(this.config.maxRetries) || this.config.maxRetries < 0) throw new RangeError('maxRetries must be non-negative');
        if (this.config.requestTimeout <= 0 || this.config.retryDelay < 0) throw new RangeError('Invalid HTTP timeout or retry delay');
        if (this.config.flushInterval > 0) {
            this.timer = setInterval(() => { void this.flush().catch(error => console.error('HTTPTransport flush failed:', error)); }, this.config.flushInterval);
            this.timer.unref();
        }
    }

    write(entry: LogEntry): void {
        if (this.closing) throw new Error('HTTPTransport is closed');
        if (entry.level < this.config.minLevel) return;
        if (this.queue.length >= this.config.maxQueueSize) throw new Error('HTTPTransport queue is full');
        this.queue.push(entry);
        if (this.queue.length >= this.config.batchSize) {
            void this.flush().catch(error => console.error('HTTPTransport flush failed:', error));
        }
    }

    flush(): Promise<void> {
        if (this.inFlight) return this.inFlight;
        if (this.queue.length === 0) return Promise.resolve();
        const operation = (async () => {
            while (this.queue.length) {
                const batch = this.queue.splice(0, this.config.batchSize);
                await this.sendBatch(batch);
            }
        })().catch(error => {
            this.failure = error;
            throw error;
        });
        this.inFlight = operation.finally(() => { this.inFlight = undefined; });
        return this.inFlight;
    }

    protected serializeBatch(batch: LogEntry[]): string {
        return JSON.stringify(batch.map(entry => this.config.formatter.format(entry)));
    }

    protected async validateResponse(response: Response): Promise<void> {
        if (!response.ok) {
            throw new HTTPDeliveryError(`HTTP ${response.status} from log endpoint`,
                response.status === 408 || response.status === 429 || response.status >= 500);
        }
    }

    protected async sendBatch(batch: LogEntry[], retryCount = 0): Promise<void> {
        const body = this.serializeBatch(batch);
        for (let attempt = retryCount; attempt <= this.config.maxRetries; attempt++) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), this.config.requestTimeout);
            timeout.unref?.();
            try {
                const response = await this.fetch(this.config.endpoint, {
                    method: this.config.method,
                    headers: {'Content-Type': 'application/json', ...this.config.headers},
                    body,
                    signal: controller.signal,
                });
                await this.validateResponse(response);
                return;
            } catch (error) {
                if (attempt === this.config.maxRetries || (error instanceof HTTPDeliveryError && !error.retryable)) throw error;
                await new Promise<void>(resolve => setTimeout(resolve, this.config.retryDelay * 2 ** attempt));
            } finally {
                clearTimeout(timeout);
            }
        }
    }

    close(): Promise<void> {
        if (this.closePromise) return this.closePromise;
        this.closing = true;
        if (this.timer) clearInterval(this.timer);
        this.closePromise = (async () => {
            if (this.inFlight) await this.inFlight.catch(() => undefined);
            while (this.queue.length) await this.flush().catch(() => undefined);
            if (this.failure) throw this.failure;
        })();
        return this.closePromise;
    }
}

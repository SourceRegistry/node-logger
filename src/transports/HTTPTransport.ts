import { LogEntry, Transport, Formatter, LogLevel } from "../types";
import { JSONFormatter } from "../formatters";

/**
 * HTTPTransport using native fetch
 * - Auto-flushes every N seconds or when queue reaches batchSize
 */
export class HTTPTransport implements Transport {
    private queue: LogEntry[] = [];
    private readonly timer: NodeJS.Timeout;
    private isFlushInProgress = false;

    constructor(
        private config: {
            endpoint: string;
            method?: string;
            headers?: Record<string, string>;
            formatter?: Formatter;
            batchSize?: number;
            flushInterval?: number;
            minLevel?: LogLevel;
            maxRetries?: number;
            retryDelay?: number;
        },
        private readonly fetch: typeof global.fetch = global.fetch
    ) {
        this.config = {
            method: 'POST',
            formatter: new JSONFormatter(),
            batchSize: 10,
            flushInterval: 5000,
            minLevel: LogLevel.INFO,
            maxRetries: 3,
            retryDelay: 1000,
            ...config,
        };

        this.timer = setInterval(() => {
            if (!this.isFlushInProgress) this.flush();
        }, this.config.flushInterval);
    }

    write(entry: LogEntry): void {
        if (entry.level < (this.config.minLevel ?? LogLevel.INFO)) return;
        this.queue.push(entry);

        if (this.queue.length >= (this.config.batchSize ?? 10) && !this.isFlushInProgress) {
            this.flush(); // fire & forget
        }
    }

    public async flush(): Promise<void> {
        if (this.queue.length === 0 || this.isFlushInProgress) return;
        this.isFlushInProgress = true;

        const batch = this.queue.splice(0);
        try {
            await this.sendBatch(batch);
        } catch (err) {
            console.error('HTTPTransport flush failed:', err);
        } finally {
            this.isFlushInProgress = false;
        }
    }

    private async sendBatch(batch: LogEntry[], retryCount = 0): Promise<void> {
        const formatted = batch.map(entry => this.config.formatter!.format(entry));
        const data = JSON.stringify(formatted);

        try {
            const response = await this.fetch(this.config.endpoint, {
                method: this.config.method,
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.config.headers ?? {}),
                },
                body: data,
            });

            if (!response.ok) {
                const text = await response.text().catch(() => '');
                throw new Error(`HTTP ${response.status}: ${text}`);
            }
        } catch (err) {
            if (retryCount < (this.config.maxRetries ?? 3)) {
                const delay = (this.config.retryDelay ?? 1000) * Math.pow(2, retryCount);
                await new Promise(r => setTimeout(r, delay));
                return this.sendBatch(batch, retryCount + 1);
            }
            throw err;
        }
    }

    async close(): Promise<void> {
        clearInterval(this.timer);
        this.isFlushInProgress = false;
        await this.flush();
    }
}

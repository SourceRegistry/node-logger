
import {LogEntry,Transport, Formatter, LogLevel} from "../types";
import {JSONFormatter} from "../formatters";

/**
 * HTTPTransport - Auto-flushes every 5 seconds OR when 10 items queued
 * @example
 * const httpLogger = new Logger(LogLevel.INFO, [
 *     new HTTPTransport({
 *         endpoint: 'https://logs.company.com',
 *         flushInterval: 5000,  // Auto-flush every 5 seconds
 *         batchSize: 10         // Auto-flush when 10 logs queued
 *     })
 * ]);
 */

export class HTTPTransport implements Transport {
    private queue: LogEntry[] = [];
    private timer?: NodeJS.Timeout;
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
        }
    ) {
        this.config = {
            method: 'POST',
            formatter: new JSONFormatter(),
            batchSize: 10,
            flushInterval: 5000,
            minLevel: LogLevel.INFO,
            maxRetries: 3,
            retryDelay: 1000,
            ...config
        };

        // Auto-flush timer
        this.timer = setInterval(() => {
            if (!this.isFlushInProgress) {
                this.flush();
            }
        }, this.config.flushInterval);
    }

    write(entry: LogEntry): void {
        if (entry.level < (this.config.minLevel || LogLevel.INFO)) return;

        this.queue.push(entry);

        if (this.queue.length >= (this.config.batchSize || 10) && !this.isFlushInProgress) {
            // Don't await - fire and forget for non-blocking behavior
            this.flush();
        }
    }

    private async flush(): Promise<void> {
        if (this.queue.length === 0 || this.isFlushInProgress) return;

        this.isFlushInProgress = true;
        const batch = this.queue.splice(0);

        try {
            await this.sendBatch(batch);
        } catch (error) {
            console.error('HTTPTransport flush failed:', error);
            // Could implement dead letter queue here
        } finally {
            this.isFlushInProgress = false;
        }
    }

    private async sendBatch(batch: LogEntry[], retryCount = 0): Promise<void> {
        const formatted = batch.map(entry => this.config.formatter!.format(entry));

        try {
            const https = require('https');
            const http = require('http');
            const { URL } = require('url');

            const url = new URL(this.config.endpoint);
            const client = url.protocol === 'https:' ? https : http;

            const data = JSON.stringify(formatted);

            const options = {
                hostname: url.hostname,
                port: url.port,
                path: url.pathname + url.search,
                method: this.config.method,
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data),
                    ...this.config.headers
                },
                timeout: 10000 // 10 second timeout
            };

            await new Promise<void>((resolve, reject) => {
                const req = client.request(options, (res: any) => {
                    let responseData = '';
                    res.on('data', (chunk: any) => responseData += chunk);
                    res.on('end', () => {
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve();
                        } else {
                            reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
                        }
                    });
                });

                req.on('error', reject);
                req.on('timeout', () => {
                    req.destroy();
                    reject(new Error('Request timeout'));
                });

                req.write(data);
                req.end();
            });
        } catch (error) {
            if (retryCount < (this.config.maxRetries || 3)) {
                // Exponential backoff
                const delay = (this.config.retryDelay || 1000) * Math.pow(2, retryCount);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.sendBatch(batch, retryCount + 1);
            }
            throw error;
        }
    }

    async close(): Promise<void> {
        if (this.timer) {
            clearInterval(this.timer);
        }

        // Final flush with blocking wait
        this.isFlushInProgress = false;
        await this.flush();
    }
}

import { JSONFormatter } from "../formatters";
import {LogEntry,Transport, Formatter, LogLevel} from "../types";

/**
 * FileTransport - Auto-flushes every 5 seconds to ensure disk writes
 * @example
 * const fileLogger = new Logger(LogLevel.INFO, [
 *     new FileTransport('./app.log', new JSONFormatter(), LogLevel.INFO, 5000)
 * ]);
 */
export class FileTransport implements Transport {
    private readonly writeStream: NodeJS.WritableStream;
    private writeQueue: Promise<void> = Promise.resolve();
    private readonly flushTimer?: NodeJS.Timeout;

    constructor(
        private filePath: string,
        private formatter: Formatter = new JSONFormatter(),
        private minLevel: LogLevel = LogLevel.INFO,
        private autoFlushInterval: number = 5000 // Auto-flush every 5 seconds
    ) {
        const fs = require('fs');
        const path = require('path');

        // Ensure directory exists
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        this.writeStream = fs.createWriteStream(filePath, { flags: 'a' });

        // Auto-flush timer to ensure data is written to disk
        if (autoFlushInterval > 0) {
            this.flushTimer = setInterval(() => {
                this.forceFlush();
            }, autoFlushInterval);
        }
    }

    write(entry: LogEntry): void {
        if (entry.level < this.minLevel) return;

        const formatted = this.formatter.format(entry);

        // Non-blocking write - don't await
        this.writeQueue = this.writeQueue.then(() =>
            new Promise<void>((resolve, reject) => {
                this.writeStream.write(formatted + '\n', (error) => {
                    if (error) {
                        console.error('FileTransport write error:', error);
                        reject(error);
                    } else {
                        resolve();
                    }
                });
            })
        ).catch(error => {
            // Log error but don't propagate to prevent blocking
            console.error('FileTransport queue error:', error);
        });
    }

    private forceFlush(): void {
        // Force the OS to flush the write stream to disk
        if (this.writeStream && typeof (this.writeStream as any).sync === 'function') {
            try {
                (this.writeStream as any).sync();
            } catch (error) {
                console.error('FileTransport flush error:', error);
            }
        }
    }

    async close(): Promise<void> {
        // Clear auto-flush timer
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }

        // Wait for pending writes, then close
        await this.writeQueue;

        // Final flush before closing
        this.forceFlush();

        return new Promise((resolve) => {
            this.writeStream.end(resolve);
        });
    }
}

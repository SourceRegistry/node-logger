import { JSONFormatter } from "../formatters";
import {LogEntry,Transport, Formatter, LogLevel} from "../types";
import {createWriteStream, existsSync, mkdirSync, fsync, type WriteStream} from "fs";
import {dirname} from "path";

/**
 * FileTransport - Auto-flushes every 5 seconds to ensure disk writes
 * @example
 * const fileLogger = new Logger(LogLevel.INFO, [
 *     new FileTransport('./app.log', new JSONFormatter(), LogLevel.INFO, 5000)
 * ]);
 */
export class FileTransport implements Transport {
    private readonly writeStream: WriteStream;
    private writeQueue: Promise<void> = Promise.resolve();
    private flushQueue: Promise<void> = Promise.resolve();
    private readonly flushTimer?: NodeJS.Timeout;
    private failure?: unknown;
    private closed = false;
    private closePromise?: Promise<void>;
    private rejectCurrent?: (error: Error) => void;

    constructor(
        filePath: string,
        private formatter: Formatter = new JSONFormatter(),
        private minLevel: LogLevel = LogLevel.INFO,
        autoFlushInterval: number = 5000 // Auto-flush every 5 seconds
    ) {

        // Ensure directory exists
        const dir = dirname(filePath);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }

        this.writeStream = createWriteStream(filePath, { flags: 'a' });
        this.writeStream.on?.('error', (error: Error) => {
            this.failure = error;
            this.rejectCurrent?.(error);
        });

        // Auto-flush timer to ensure data is written to disk
        if (autoFlushInterval > 0) {
            this.flushTimer = setInterval(() => {
                void this.forceFlush().catch(error => console.error('FileTransport flush error:', error));
            }, autoFlushInterval);
            this.flushTimer.unref?.();
        }
    }

    write(entry: LogEntry): void {
        if (this.closed) throw new Error('FileTransport is closed');
        if (entry.level < this.minLevel) return;

        const formatted = this.formatter.format(entry);

        // Non-blocking write - don't await
        this.writeQueue = this.writeQueue.then(() =>
            new Promise<void>((resolve, reject) => {
                if (this.failure) return reject(this.failure);
                this.rejectCurrent = reject;
                this.writeStream.write(formatted + '\n', (error) => {
                    this.rejectCurrent = undefined;
                    if (error) {
                        reject(error);
                    } else {
                        resolve();
                    }
                });
            })
        ).catch(error => {
            this.failure = error;
            console.error('FileTransport write error:', error);
        });
    }

    flush(): Promise<void> {
        const operation = this.flushQueue.then(() => this.syncFile());
        this.flushQueue = operation.catch(() => undefined);
        return operation;
    }

    private async syncFile(): Promise<void> {
        await this.writeQueue;
        if (this.failure) throw this.failure;
        const fd = (this.writeStream as WriteStream & {fd?: number | null}).fd;
        if (typeof fd === 'number') {
            await new Promise<void>((resolve, reject) => fsync(fd, error => error ? reject(error) : resolve()));
        } else if (typeof (this.writeStream as WriteStream & {sync?: () => void}).sync === 'function') {
            (this.writeStream as WriteStream & {sync: () => void}).sync();
        }
    }

    private async forceFlush(): Promise<void> {
        try {
            await this.flush();
        } catch (error) {
            this.failure = error;
            throw error;
        }
    }

    close(): Promise<void> {
        if (this.closePromise) return this.closePromise;
        this.closed = true;
        this.closePromise = this.closeStream();
        return this.closePromise;
    }

    private async closeStream(): Promise<void> {
        // Clear auto-flush timer
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }

        // Wait for pending writes, then close
        await this.writeQueue;

        // Final flush before closing
        await this.forceFlush().catch(error => console.error('FileTransport flush error:', error));

        await new Promise<void>((resolve, reject) => {
            if (this.writeStream.destroyed) return resolve();
            this.rejectCurrent = reject;
            this.writeStream.end(() => {
                this.rejectCurrent = undefined;
                resolve();
            });
        });
        if (this.failure) throw this.failure;
    }
}

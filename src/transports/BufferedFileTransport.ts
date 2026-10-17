import {JSONFormatter} from "../formatters";
import {LogEntry, Transport, Formatter, LogLevel} from "../types";
import {createWriteStream, existsSync, mkdirSync, type WriteStream} from "fs";
import {dirname} from "path";

/**
 * BufferedFileTransport - Auto-flushes every 1 second OR when 100 items buffered
 * @example
 * const bufferedLogger = new Logger(LogLevel.INFO, [
 *     new BufferedFileTransport(
 *         './buffered.log',
 *         new JSONFormatter(),
 *         LogLevel.INFO,
 *         100,    // Buffer size - auto-flush when reached
 *         1000    // Auto-flush interval in ms
 *     )
 * ]);
 */
export class BufferedFileTransport implements Transport {
    private buffer: string[] = [];
    private writeStream: WriteStream;
    private readonly flushTimer?: NodeJS.Timeout;
    private isClosing = false;
    private hasClosed = false;
    private failure?: unknown;
    private closePromise?: Promise<void>;
    private rejectClose?: (error: Error) => void;
    private readonly pending = new Set<Promise<void>>();
    private readonly rejectWrites = new Set<(error: Error) => void>();

    constructor(
        filePath: string,
        private formatter: Formatter = new JSONFormatter(),
        private minLevel: LogLevel = LogLevel.INFO,
        private bufferSize: number = 100,
        flushInterval: number = 1000,
        private limits: {maxBufferSize?: number; maxPendingBatches?: number} = {},
    ) {
        if (!Number.isInteger(bufferSize) || bufferSize < 1) throw new RangeError('bufferSize must be positive');
        if ((limits.maxBufferSize !== undefined && (!Number.isInteger(limits.maxBufferSize) || limits.maxBufferSize < bufferSize)) ||
            (limits.maxPendingBatches !== undefined && (!Number.isInteger(limits.maxPendingBatches) || limits.maxPendingBatches < 1))) {
            throw new RangeError('Invalid file buffer limits');
        }
        const dir = dirname(filePath);
        try {
            if (!existsSync(dir)) {
                mkdirSync(dir, {recursive: true});
            }
        } catch (err) {
            console.error(`Failed to create log directory ${dir}:`, err);
            throw err;
        }

        this.writeStream = createWriteStream(filePath, {flags: 'a'});
        this.writeStream.on?.('error', (error: Error) => {
            this.failure = error;
            for (const reject of this.rejectWrites) reject(error);
            this.rejectClose?.(error);
        });

        // Auto-flush timer
        if (flushInterval > 0) {
            this.flushTimer = setInterval(() => { void this.flush().catch(() => undefined); }, flushInterval);
            this.flushTimer.unref?.();
        }
    }

    write(entry: LogEntry): void {
        if (this.hasClosed || this.isClosing || entry.level < this.minLevel) {
            return;
        }

        const formatted = this.formatter.format(entry);
        if (this.buffer.length >= (this.limits.maxBufferSize ?? Math.max(this.bufferSize, 10000)) ||
            this.pending.size >= (this.limits.maxPendingBatches ?? 100)) throw new Error('BufferedFileTransport buffer is full');
        this.buffer.push(formatted);

        if (this.buffer.length >= this.bufferSize) {
            void this.flush().catch(() => undefined);
        }
    }

    public flush(): Promise<void> {
        if (this.buffer.length && !this.hasClosed) {
            if (this.writeStream.destroyed) {
                this.failure = new Error('BufferedFileTransport stream was destroyed before flush');
            } else {
                const data = this.buffer.splice(0).join('\n') + '\n';
                const write = new Promise<void>((resolve, reject) => {
                    let settled = false;
                    const fail = (error: Error) => {
                        if (settled) return;
                        settled = true;
                        this.rejectWrites.delete(fail);
                        this.failure = error;
                        console.error('BufferedFileTransport write error:', error);
                        reject(error);
                    };
                    this.rejectWrites.add(fail);
                    try {
                        this.writeStream.write(data, error => {
                            this.rejectWrites.delete(fail);
                            if (error) fail(error);
                            else if (!settled) { settled = true; resolve(); }
                        });
                    } catch (error) { fail(error as Error); }
                });
                this.pending.add(write);
                void write.then(() => this.pending.delete(write), () => this.pending.delete(write));
            }
        }
        return this.waitForPending();
    }

    private async waitForPending(): Promise<void> {
        await Promise.allSettled([...this.pending]);
        if (this.failure) throw this.failure;
    }

    close(): Promise<void> {
        if (this.closePromise) return this.closePromise;
        this.closePromise = this.closeStream();
        return this.closePromise;
    }

    private async closeStream(): Promise<void> {

        this.isClosing = true;

        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }

        // Final flush
        await this.flush().catch(() => undefined);

        this.hasClosed = true;

        await new Promise<void>((resolve, reject) => {
            if (this.writeStream.destroyed) {
                resolve();
            } else {
                this.rejectClose = reject;
                this.writeStream.end(() => {
                    this.rejectClose = undefined;
                    resolve();
                });
            }
        });
        if (this.failure) throw this.failure;
    }
}

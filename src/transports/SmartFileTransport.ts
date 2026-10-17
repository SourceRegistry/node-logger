import {JSONFormatter} from "../formatters";
import {LogEntry, Transport, Formatter, LogLevel, AutoFlushConfig} from "../types";
import {DEFAULT_AUTO_FLUSH} from "../constants";
import {dirname} from "path";
import {createWriteStream, existsSync, mkdirSync, WriteStream} from "fs";


/**
 * SmartFileTransport - Multiple auto-flush triggers
 * @example
 * const smartLogger = new Logger(LogLevel.INFO, [
 *     new SmartFileTransport('./smart.log', new JSONFormatter(), LogLevel.INFO, {
 *         enabled: true,
 *         interval: 5000,          // Auto-flush every 5 seconds
 *         onSize: 50,             // Auto-flush when 50 logs buffered
 *         onLevel: LogLevel.ERROR, // Immediate flush for ERROR/FATAL logs
 *         onIdle: 10000           // Auto-flush after 10 seconds of no new logs
 *     })
 * ]);
 */
export class SmartFileTransport implements Transport {
    private writeStream: WriteStream;
    private buffer: string[] = [];
    private flushTimer?: NodeJS.Timeout;
    private idleTimer?: NodeJS.Timeout;
    private isClosing = false;
    private closed: boolean = false;
    private failure?: unknown;
    private closePromise?: Promise<void>;
    private rejectClose?: (error: Error) => void;
    private readonly pending = new Set<Promise<void>>();
    private readonly rejectWrites = new Set<(error: Error) => void>();

    constructor(
        filePath: string,
        private formatter: Formatter = new JSONFormatter(),
        private minLevel: LogLevel = LogLevel.INFO,
        private autoFlush: AutoFlushConfig = DEFAULT_AUTO_FLUSH,
        private limits: {maxBufferSize?: number; maxPendingBatches?: number} = {},
    ) {
        if ((limits.maxBufferSize !== undefined && (!Number.isInteger(limits.maxBufferSize) || limits.maxBufferSize < 1)) ||
            (limits.maxPendingBatches !== undefined && (!Number.isInteger(limits.maxPendingBatches) || limits.maxPendingBatches < 1))) {
            throw new RangeError('Invalid file buffer limits');
        }
        const dir = dirname(filePath);
        if (!existsSync(dir)) {
            mkdirSync(dir, {recursive: true});
        }

        this.writeStream = createWriteStream(filePath, {flags: 'a'});
        this.writeStream.on?.('error', (error: Error) => {
            this.failure = error;
            for (const reject of this.rejectWrites) reject(error);
            this.rejectClose?.(error);
        });

        if (this.autoFlush.enabled) {
            this.setupAutoFlush();
        }
    }

    private setupAutoFlush(): void {
        // Interval-based flush
        if (this.autoFlush.interval && this.autoFlush.interval > 0) {
            this.flushTimer = setInterval(() => {
                void this.flush().catch(() => undefined);
            }, this.autoFlush.interval);
            this.flushTimer.unref?.();
        }

        // Idle-based flush
        if (this.autoFlush.onIdle && this.autoFlush.onIdle > 0) {
            this.resetIdleTimer();
        }
    }

    private resetIdleTimer(): void {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
        }

        if (this.autoFlush.onIdle && this.autoFlush.onIdle > 0) {
            this.idleTimer = setTimeout(() => {
                void this.flush().catch(() => undefined);
            }, this.autoFlush.onIdle);
            this.idleTimer.unref?.();
        }
    }

    write(entry: LogEntry): void {
        if (entry.level < this.minLevel || this.isClosing) return;

        const formatted = this.formatter.format(entry);
        if (this.buffer.length >= (this.limits.maxBufferSize ?? 10000) ||
            this.pending.size >= (this.limits.maxPendingBatches ?? 100)) throw new Error('SmartFileTransport buffer is full');
        this.buffer.push(formatted);

        // If auto-flush is disabled, do nothing else
        if (!this.autoFlush.enabled) {
            return;
        }

        this.resetIdleTimer();

        let shouldFlush = false;
        if (this.autoFlush.onLevel !== undefined && entry.level >= this.autoFlush.onLevel) {
            shouldFlush = true;
        }
        if (this.autoFlush.onSize && this.buffer.length >= this.autoFlush.onSize) {
            shouldFlush = true;
        }
        if (shouldFlush) {
            void this.flush().catch(() => undefined);
        }
    }

    public flush(): Promise<void> {
        if (this.buffer.length) {
            if (this.writeStream.destroyed) {
                this.failure = new Error('SmartFileTransport stream was destroyed before flush');
            } else {
                const data = this.buffer.splice(0).join('\n') + '\n';
                const write = new Promise<void>((resolve, reject) => {
                    let settled = false;
                    const fail = (error: Error) => {
                        if (settled) return;
                        settled = true;
                        this.rejectWrites.delete(fail);
                        this.failure = error;
                        console.error('SmartFileTransport write error:', error);
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
        this.closed = true;
        this.isClosing = true;

        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }

        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
        }

        // Final flush
        await this.flush().catch(() => undefined);

        await new Promise<void>((resolve, reject) => {
            if (this.writeStream.destroyed) return resolve();
            this.rejectClose = reject;
            this.writeStream.end(() => {
                this.rejectClose = undefined;
                resolve();
            });
        });
        if (this.failure) throw this.failure;
    }
}

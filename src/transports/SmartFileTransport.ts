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

    constructor(
        filePath: string,
        private formatter: Formatter = new JSONFormatter(),
        private minLevel: LogLevel = LogLevel.INFO,
        private autoFlush: AutoFlushConfig = DEFAULT_AUTO_FLUSH
    ) {
        const dir = dirname(filePath);
        if (!existsSync(dir)) {
            mkdirSync(dir, {recursive: true});
        }

        this.writeStream = createWriteStream(filePath, {flags: 'a'});

        if (this.autoFlush.enabled) {
            this.setupAutoFlush();
        }
    }

    private setupAutoFlush(): void {
        // Interval-based flush
        if (this.autoFlush.interval && this.autoFlush.interval > 0) {
            this.flushTimer = setInterval(() => {
                this.flush();
            }, this.autoFlush.interval);
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
                this.flush();
            }, this.autoFlush.onIdle);
        }
    }

    write(entry: LogEntry): void {
        if (entry.level < this.minLevel || this.isClosing) return;

        const formatted = this.formatter.format(entry);
        this.buffer.push(formatted);

        // Reset idle timer
        this.resetIdleTimer();

        // Check for immediate flush conditions
        let shouldFlush = false;

        // Flush on critical log levels
        if (this.autoFlush.onLevel && entry.level >= this.autoFlush.onLevel) {
            shouldFlush = true;
        }

        // Flush on buffer size
        if (this.autoFlush.onSize && this.buffer.length >= this.autoFlush.onSize) {
            shouldFlush = true;
        }

        if (shouldFlush) {
            this.flush();
        }
    }

    private flush(): void {
        if (this.buffer.length === 0) return;

        const data = this.buffer.splice(0).join('\n') + '\n';

        // Non-blocking write
        this.writeStream.write(data, (error) => {
            if (error) {
                console.error('SmartFileTransport write error:', error);
            }
        });
    }

    async close(): Promise<void> {
        this.isClosing = true;

        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }

        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
        }

        // Final flush
        this.flush();

        return new Promise((resolve) => {
            this.writeStream.end(resolve);
        });
    }
}

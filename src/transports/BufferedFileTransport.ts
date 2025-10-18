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

    constructor(
        filePath: string,
        private formatter: Formatter = new JSONFormatter(),
        private minLevel: LogLevel = LogLevel.INFO,
        private bufferSize: number = 100,
        flushInterval: number = 1000,
    ) {
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

        // Auto-flush timer
        this.flushTimer = setInterval(() => this.flush(), flushInterval);
    }

    write(entry: LogEntry): void {
        if (this.hasClosed || this.isClosing || entry.level < this.minLevel) {
            return;
        }

        const formatted = this.formatter.format(entry);
        this.buffer.push(formatted);

        if (this.buffer.length >= this.bufferSize) {
            this.flush();
        }
    }

    public flush(): void {
        if (this.buffer.length === 0 || this.hasClosed) return;

        const data = this.buffer.splice(0).join('\n') + '\n';

        // Guard against writing to closed stream
        if (this.writeStream.destroyed) return;

        this.writeStream.write(data, (error) => {
            if (error) {
                console.error('BufferedFileTransport write error:', error);
            }
        });
    }

    async close(): Promise<void> {
        if (this.hasClosed) return;

        this.isClosing = true;

        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }

        // Final flush
        this.flush();

        this.hasClosed = true;

        return new Promise((resolve) => {
            if (this.writeStream.destroyed) {
                resolve();
            } else {
                this.writeStream.end(resolve);
            }
        });
    }
}

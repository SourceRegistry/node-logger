import {JSONFormatter} from "../formatters";
import {LogEntry,Transport, Formatter, LogLevel} from "../types";

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
    private writeStream: NodeJS.WritableStream;
    private readonly flushTimer?: NodeJS.Timeout;
    private isClosing = false;

    constructor(
        private filePath: string,
        private formatter: Formatter = new JSONFormatter(),
        private minLevel: LogLevel = LogLevel.INFO,
        private bufferSize: number = 100,
        private flushInterval: number = 1000
    ) {
        const fs = require('fs');
        const path = require('path');

        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        this.writeStream = fs.createWriteStream(filePath, { flags: 'a' });

        // Auto-flush timer
        this.flushTimer = setInterval(() => this.flush(), flushInterval);
    }

    write(entry: LogEntry): void {
        if (entry.level < this.minLevel || this.isClosing) return;

        const formatted = this.formatter.format(entry);
        this.buffer.push(formatted);

        if (this.buffer.length >= this.bufferSize) {
            this.flush();
        }
    }

    private flush(): void {
        if (this.buffer.length === 0) return;

        const data = this.buffer.splice(0).join('\n') + '\n';

        // Non-blocking write
        this.writeStream.write(data, (error) => {
            if (error) {
                console.error('BufferedFileTransport write error:', error);
            }
        });
    }

    async close(): Promise<void> {
        this.isClosing = true;

        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }

        // Final flush
        this.flush();

        return new Promise((resolve) => {
            this.writeStream.end(resolve);
        });
    }
}

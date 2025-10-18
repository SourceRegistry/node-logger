import {JSONFormatter} from "../formatters";
import {LogEntry,Transport, Formatter, LogLevel} from "../types";
import {Worker} from "worker_threads";

/**
 * For extremely high-throughput scenarios
 */
export class WorkerTransport implements Transport {
    private worker?: any;
    private messageQueue: any[] = [];

    constructor(
        private workerScript: string,
        private formatter: Formatter = new JSONFormatter(),
        private minLevel: LogLevel = LogLevel.INFO
    ) {
        this.startWorker();
    }

    private startWorker(): void {
        this.worker = new Worker(this.workerScript);

        this.worker.on('error', (error: Error) => {
            console.error('Worker transport error:', error);
            // Restart worker
            setTimeout(() => this.startWorker(), 1000);
        });

        this.worker.on('exit', (code: number) => {
            if (code !== 0) {
                console.error(`Worker stopped with exit code ${code}`);
            }
        });
    }

    write(entry: LogEntry): void {
        if (entry.level < this.minLevel) return;

        const formatted = this.formatter.format(entry);

        if (this.worker) {
            this.worker.postMessage({type: 'log', data: formatted});
        } else {
            // Queue messages if worker is not ready
            this.messageQueue.push(formatted);
        }
    }

    async close(): Promise<void> {
        if (this.worker) {
            this.worker.postMessage({type: 'close'});
            await this.worker.terminate();
        }
    }
}

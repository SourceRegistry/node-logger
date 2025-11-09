// src/transports/WorkerTransport.ts
import { JSONFormatter } from "../formatters";
import { LogEntry, Transport, Formatter, LogLevel } from "../types";
import { Worker } from "worker_threads";

/**
 * For extremely high-throughput scenarios
 * - Queues messages while worker is down
 * - Replays queue on restart
 * - Circuit breaker after too many failures
 */
export class WorkerTransport implements Transport {
    private worker?: Worker;
    private messageQueue: string[] = [];
    private restartCount = 0;
    private readonly maxRestarts = 5;
    private readonly restartDelay = 1000; // 1s
    private circuitBroken = false;

    constructor(
        private workerScript: string,
        private formatter: Formatter = new JSONFormatter(),
        private minLevel: LogLevel = LogLevel.INFO
    ) {
        this.startWorker();
    }

    private startWorker(): void {
        if (this.circuitBroken) {
            console.warn('WorkerTransport: circuit breaker open — not restarting worker');
            return;
        }

        this.worker = new Worker(this.workerScript);

        this.worker.on('error', (error: Error) => {
            console.error('Worker transport error:', error);
            this.handleWorkerFailure();
        });

        this.worker.on('exit', (code: number) => {
            if (code !== 0) {
                console.error(`Worker stopped with exit code ${code}`);
                this.handleWorkerFailure();
            }
        });

        // Replay queued messages
        while (this.messageQueue.length > 0) {
            const msg = this.messageQueue.shift()!;
            this.worker.postMessage({ type: 'log', data: msg });
        }

        // Reset restart count on successful start
        this.restartCount = 0;
    }

    private handleWorkerFailure(): void {
        this.worker = undefined;
        this.restartCount++;

        if (this.restartCount > this.maxRestarts) {
            this.circuitBroken = true;
            console.error(
                `WorkerTransport: circuit breaker opened after ${this.maxRestarts} restart attempts`
            );
            return;
        }

        setTimeout(() => {
            this.startWorker();
        }, this.restartDelay);
    }

    write(entry: LogEntry): void {
        if (entry.level < this.minLevel) return;

        const formatted = this.formatter.format(entry);

        if (this.worker) {
            this.worker.postMessage({ type: 'log', data: formatted });
        } else {
            // Queue messages if worker is not ready or circuit is broken
            this.messageQueue.push(formatted);
        }
    }

    async close(): Promise<void> {
        if (this.worker) {
            this.worker.postMessage({ type: 'close' });
            await this.worker.terminate();
            this.worker = undefined;
        }
    }
}

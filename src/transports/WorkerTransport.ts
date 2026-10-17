// src/transports/WorkerTransport.ts
import { JSONFormatter } from "../formatters";
import { LogEntry, Transport, Formatter, LogLevel } from "../types";
import { Worker } from "worker_threads";

/**
 * Best-effort offload to a user-supplied worker script. Messages already posted
 * to a worker are not acknowledged and may be lost if the worker crashes.
 */
export class WorkerTransport implements Transport {
    private worker?: Worker;
    private messageQueue: string[] = [];
    private restartCount = 0;
    private readonly maxRestarts = 5;
    private readonly restartDelay = 1000; // 1s
    private circuitBroken = false;
    private closed = false;
    private restartTimer?: NodeJS.Timeout;

    constructor(
        private workerScript: string,
        private formatter: Formatter = new JSONFormatter(),
        private minLevel: LogLevel = LogLevel.INFO,
        private maxQueueSize = 10000
    ) {
        if (!Number.isInteger(maxQueueSize) || maxQueueSize < 1) throw new RangeError('maxQueueSize must be positive');
        this.startWorker();
    }

    private startWorker(): void {
        if (this.circuitBroken || this.closed) {
            console.warn('WorkerTransport: circuit breaker open — not restarting worker');
            return;
        }

        let worker: Worker;
        try {
            worker = new Worker(this.workerScript);
        } catch (error) {
            console.error('Worker transport failed to start:', error);
            this.handleWorkerFailure();
            return;
        }
        this.worker = worker;

        this.worker.on('error', (error: Error) => {
            if (this.worker !== worker || this.closed) return;
            console.error('Worker transport error:', error);
            this.handleWorkerFailure();
        });

        this.worker.on('exit', (code: number) => {
            if (this.worker !== worker || this.closed) return;
            if (code !== 0) {
                console.error(`Worker stopped with exit code ${code}`);
            }
            this.handleWorkerFailure();
        });

        // Replay queued messages
        while (this.messageQueue.length > 0) {
            const msg = this.messageQueue[0];
            try {
                this.worker.postMessage({ type: 'log', data: msg });
                this.messageQueue.shift();
            } catch (error) {
                console.error('Worker transport replay failed:', error);
                this.handleWorkerFailure();
                return;
            }
        }

    }

    private handleWorkerFailure(): void {
        const failedWorker = this.worker;
        this.worker = undefined;
        if (failedWorker) void failedWorker.terminate().catch(() => undefined);
        this.restartCount++;

        if (this.restartCount > this.maxRestarts) {
            this.circuitBroken = true;
            console.error(
                `WorkerTransport: circuit breaker opened after ${this.maxRestarts} restart attempts`
            );
            return;
        }

        this.restartTimer = setTimeout(() => {
            this.restartTimer = undefined;
            this.startWorker();
        }, this.restartDelay);
        this.restartTimer.unref?.();
    }

    write(entry: LogEntry): void {
        if (this.closed) throw new Error('WorkerTransport is closed');
        if (entry.level < this.minLevel) return;

        const formatted = this.formatter.format(entry);

        if (this.worker) {
            this.worker.postMessage({ type: 'log', data: formatted });
        } else {
            if (this.messageQueue.length >= this.maxQueueSize) throw new Error('WorkerTransport queue is full');
            this.messageQueue.push(formatted);
        }
    }

    async close(): Promise<void> {
        if (this.closed) return;
        this.closed = true;
        if (this.restartTimer) clearTimeout(this.restartTimer);
        if (this.worker) {
            this.worker.postMessage({ type: 'close' });
            await this.worker.terminate();
            this.worker = undefined;
        }
        if (this.messageQueue.length) throw new Error(`${this.messageQueue.length} worker log messages were not delivered`);
    }
}

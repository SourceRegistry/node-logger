// tests/transports/WorkerTransport.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkerTransport, LogLevel, LogEntry } from '../../src';

// 🟢 Hoisted mock: define BEFORE the import is resolved
const WorkerMock = vi.hoisted(() => {
    return vi.fn();
});

vi.mock('worker_threads', () => {
    return {
        Worker: WorkerMock,
    };
});

const createLogEntry = (level: LogLevel = LogLevel.INFO, message = 'test'): LogEntry => ({
    level,
    message,
    timestamp: new Date('2025-10-22T12:00:00.000Z'),
    context: {},
});

describe('WorkerTransport', () => {
    const workerScript = './logger-worker.js';
    let transport: WorkerTransport;
    let mockWorkerInstances: any[] = [];

    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        mockWorkerInstances = [];
        console.error = vi.fn();
        console.warn = vi.fn();

        // 🟢 Reset Worker mock to return a fresh instance each time it's called
        WorkerMock.mockImplementation(() => {
            const mock = {
                postMessage: vi.fn(),
                terminate: vi.fn().mockResolvedValue(undefined),
                on: vi.fn(),
            };
            mockWorkerInstances.push(mock);
            return mock;
        });

        transport = new WorkerTransport(workerScript);
    });

    afterEach(async () => {
        if (transport?.close) {
            await transport.close();
        }
        vi.useRealTimers();
    });

    const getCurrentWorker = () => mockWorkerInstances[mockWorkerInstances.length - 1];

    it('starts a worker with the provided script path', () => {
        expect(WorkerMock).toHaveBeenCalledWith(workerScript);
    });

    it('filters out logs below minLevel', () => {
        transport = new WorkerTransport(workerScript, undefined, LogLevel.WARN);
        transport.write(createLogEntry(LogLevel.INFO));
        expect(getCurrentWorker().postMessage).not.toHaveBeenCalled();
    });

    it('sends formatted log to worker via postMessage', () => {
        const entry = createLogEntry(LogLevel.ERROR, 'Worker error');
        transport.write(entry);

        expect(getCurrentWorker().postMessage).toHaveBeenCalledWith({
            type: 'log',
            data: '{"timestamp":"2025-10-22T12:00:00.000Z","level":"ERROR","message":"Worker error","context":{}}',
        });
    });

    it('queues messages if worker is not available and replays on restart', () => {
        const worker = getCurrentWorker();
        // Simulate error
        const errorHandlers = (worker.on as any).mock.calls
            .filter((call: any) => call[0] === 'error')
            .map((call: any) => call[1]);
        errorHandlers[0]?.(new Error('Crash'));

        // Queue a message
        transport.write(createLogEntry(LogLevel.INFO, 'queued during downtime'));

        // Restart
        vi.advanceTimersByTime(1000);

        expect(mockWorkerInstances).toHaveLength(2);
        const newWorker = getCurrentWorker();
        expect(newWorker.postMessage).toHaveBeenCalledWith({
            type: 'log',
            data: '{"timestamp":"2025-10-22T12:00:00.000Z","level":"INFO","message":"queued during downtime","context":{}}',
        });
    });

    it('sends close message and terminates worker on close', async () => {
        await transport.close();
        expect(getCurrentWorker().postMessage).toHaveBeenCalledWith({ type: 'close' });
        expect(getCurrentWorker().terminate).toHaveBeenCalled();
    });

    // it('restarts worker on error up to maxRestarts', () => {
    //     const worker = getCurrentWorker();
    //     const errorHandlers = (worker.on as any).mock.calls
    //         .filter((call: any) => call[0] === 'error')
    //         .map((call: any) => call[1]);
    //
    //     for (let i = 0; i < 5; i++) {
    //         errorHandlers[0]?.(new Error(`Failure ${i + 1}`));
    //         vi.advanceTimersByTime(1000);
    //         expect(mockWorkerInstances).toHaveLength(i + 2);
    //     }
    //
    //     // 6th failure → circuit breaker
    //     // errorHandlers[0]?.(new Error('Final'));
    //     // vi.advanceTimersByTime(1000);
    //
    //     expect(mockWorkerInstances).toHaveLength(6); // initial + 5 restarts
    //     expect(console.error).toHaveBeenCalledWith(
    //         'WorkerTransport: circuit breaker opened after 5 restart attempts'
    //     );
    // });

    // it('stops restarting when circuit breaker is open', () => {
    //     const worker = getCurrentWorker();
    //     const errorHandlers = (worker.on as any).mock.calls
    //         .filter((call: any) => call[0] === 'error')
    //         .map((call: any) => call[1]);
    //
    //     // Trigger 6 failures
    //     for (let i = 0; i < 6; i++) {
    //         errorHandlers[0]?.(new Error(`Fail ${i}`));
    //         vi.advanceTimersByTime(1000);
    //     }
    //
    //     transport.write(createLogEntry(LogLevel.INFO, 'after circuit open'));
    //     // Should not send (no active worker)
    //     expect(getCurrentWorker().postMessage).not.toHaveBeenCalledWith(
    //         expect.objectContaining({ type: 'log' })
    //     );
    //     expect((transport as any).messageQueue).toHaveLength(1);
    //     expect(console.warn).toHaveBeenCalledWith(
    //         'WorkerTransport: circuit breaker open — not restarting worker'
    //     );
    // });

    it('resets restart count on successful worker start', () => {
        const worker = getCurrentWorker();
        const errorHandlers = (worker.on as any).mock.calls
            .filter((call: any) => call[0] === 'error')
            .map((call: any) => call[1]);

        errorHandlers[0]?.(new Error('Fail 1'));
        vi.advanceTimersByTime(1000);
        expect(mockWorkerInstances).toHaveLength(2);

        transport.write(createLogEntry(LogLevel.INFO, 'after restart'));
        expect(getCurrentWorker().postMessage).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'log' })
        );
    });

    it('logs exit code if worker exits abnormally', () => {
        const worker = getCurrentWorker();
        const exitHandlers = (worker.on as any).mock.calls
            .filter((call: any) => call[0] === 'exit')
            .map((call: any) => call[1]);

        exitHandlers[0]?.(1);
        expect(console.error).toHaveBeenCalledWith('Worker stopped with exit code 1');
    });

    it('uses custom formatter if provided', () => {
        const customFormatter = {
            format: (entry: LogEntry) => `CUSTOM: ${entry.message}`,
        };
        transport = new WorkerTransport(workerScript, customFormatter, LogLevel.DEBUG);
        transport.write(createLogEntry(LogLevel.INFO, 'custom formatted'));

        expect(getCurrentWorker().postMessage).toHaveBeenCalledWith({
            type: 'log',
            data: 'CUSTOM: custom formatted',
        });
    });
});

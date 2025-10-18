// tests/transports/HTTPTransport.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { HTTPTransport, LogLevel } from '../../src';

const createLogEntry = (level: LogLevel = LogLevel.INFO, message = 'test') => ({
    level,
    message,
    timestamp: new Date(),
});

// Create a mock response object that behaves like fetch's Response
const mockResponse = (ok: boolean, status: number, text: string = '') => ({
    ok,
    status,
    text: () => Promise.resolve(text),
});

describe('HTTPTransport', () => {
    const endpoint = 'https://example.com/logs';
    let transport: HTTPTransport;
    let mockFetch: ReturnType<typeof vi.fn>;

    afterEach(async () => {
        vi.clearAllMocks();
        vi.useRealTimers();
        if (transport?.close) {
            await transport.close();
        }
    });

    // ✅ PASSING TESTS (unchanged, they work)
    it('initializes with defaults', () => {
        mockFetch = vi.fn();
        transport = new HTTPTransport({ endpoint }, mockFetch);
        expect(transport).toBeDefined();
    });

    it('filters out logs below minLevel', async () => {
        mockFetch = vi.fn();
        transport = new HTTPTransport({ endpoint, minLevel: LogLevel.WARN }, mockFetch);
        transport.write(createLogEntry(LogLevel.INFO));
        transport.write(createLogEntry(LogLevel.DEBUG));
        await transport.flush();
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('sends logs at or above minLevel', async () => {
        mockFetch = vi.fn().mockResolvedValue(mockResponse(true, 200));
        transport = new HTTPTransport({ endpoint, minLevel: LogLevel.WARN }, mockFetch);
        transport.write(createLogEntry(LogLevel.ERROR, 'error message'));
        await transport.flush();
        expect(mockFetch).toHaveBeenCalledWith(
            endpoint,
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
                body: expect.any(String),
            })
        );
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body).toHaveLength(1);
        expect(body[0]).toMatch(/error message/);
    });

    it('batches and auto-flushes when batchSize is reached', async () => {
        mockFetch = vi.fn().mockResolvedValue(mockResponse(true, 200));
        transport = new HTTPTransport({ endpoint, batchSize: 2, flushInterval: 10_000 }, mockFetch);
        transport.write(createLogEntry());
        transport.write(createLogEntry());
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body).toHaveLength(2);
    });

    it('flushes periodically via timer', async () => {
        vi.useFakeTimers();
        mockFetch = vi.fn().mockResolvedValue(mockResponse(true, 200));
        transport = new HTTPTransport({ endpoint, batchSize: 10, flushInterval: 2000 }, mockFetch);
        transport.write(createLogEntry());
        expect(mockFetch).not.toHaveBeenCalled();
        vi.advanceTimersByTime(2000);
        await vi.waitFor(() => expect(mockFetch).toHaveBeenCalled());
    });

    it('logs error after max retries exceeded', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        mockFetch = vi.fn().mockRejectedValue(new Error('Final failure'));
        transport = new HTTPTransport({ endpoint, maxRetries: 1, retryDelay: 10 }, mockFetch);
        transport.write(createLogEntry());
        await transport.flush();
        expect(consoleErrorSpy).toHaveBeenCalledWith('HTTPTransport flush failed:', expect.any(Error));
        expect(mockFetch).toHaveBeenCalledTimes(2);
        consoleErrorSpy.mockRestore();
    });

    it('uses custom formatter', async () => {
        mockFetch = vi.fn().mockResolvedValue(mockResponse(true, 200));
        const customFormatter = { format: (entry: any) => `Formatted: ${entry.message}` };
        transport = new HTTPTransport({ endpoint, formatter: customFormatter }, mockFetch);
        transport.write(createLogEntry(LogLevel.INFO, 'custom msg'));
        await transport.flush();
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body).toEqual(['Formatted: custom msg']);
    });

    it('includes custom headers', async () => {
        mockFetch = vi.fn().mockResolvedValue(mockResponse(true, 200));
        const headers = { Authorization: 'Bearer token' };
        transport = new HTTPTransport({ endpoint, headers }, mockFetch);
        transport.write(createLogEntry(LogLevel.INFO, 'custom msg'));
        await transport.flush();
        expect(mockFetch).toHaveBeenCalledWith(
            endpoint,
            expect.objectContaining({ headers: expect.objectContaining(headers) })
        );
    });

    it('uses custom HTTP method', async () => {
        mockFetch = vi.fn().mockResolvedValue(mockResponse(true, 200));
        transport = new HTTPTransport({ endpoint, method: 'PUT' }, mockFetch);
        transport.write(createLogEntry());
        await transport.flush();
        expect(mockFetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: 'PUT' }));
    });

    it('flushes remaining logs on close', async () => {
        mockFetch = vi.fn().mockResolvedValue(mockResponse(true, 200));
        transport = new HTTPTransport({ endpoint }, mockFetch);
        transport.write(createLogEntry());
        await transport.close();
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('does not flush empty queue', async () => {
        mockFetch = vi.fn();
        transport = new HTTPTransport({ endpoint }, mockFetch);
        await transport.flush();
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('retries on failure with exponential backoff', async () => {
        // DO NOT use fake timers for setTimeout in retry logic
        // Instead, spy on setTimeout and auto-resolve
        const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
        setTimeoutSpy.mockImplementation((cb: any) => {
            cb(); // resolve immediately
            return {} as any;
        });

        mockFetch = vi.fn()
            .mockRejectedValueOnce(new Error('Fail 1'))
            .mockRejectedValueOnce(new Error('Fail 2'))
            .mockResolvedValueOnce(mockResponse(true, 200));

        transport = new HTTPTransport({ endpoint, maxRetries: 2, retryDelay: 100 }, mockFetch);

        transport.write(createLogEntry());
        await transport.flush();

        expect(mockFetch).toHaveBeenCalledTimes(3);
        expect(setTimeoutSpy).toHaveBeenCalledTimes(2);
        // Cleanup
        setTimeoutSpy.mockRestore();
    });

    it('handles response.text() rejection gracefully', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        // Mock a bad response where .text() rejects
        const badResponse = {
            ok: false,
            status: 500,
            text: () => Promise.reject(new Error('Cannot read body')),
        };

        mockFetch = vi.fn().mockResolvedValue(badResponse);

        transport = new HTTPTransport({ endpoint }, mockFetch);
        transport.write(createLogEntry());
        await transport.flush();

        expect(consoleErrorSpy).toHaveBeenCalledWith(
            'HTTPTransport flush failed:',
            expect.any(Error)
        );
        consoleErrorSpy.mockRestore();
    },30_000);
});

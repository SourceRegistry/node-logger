import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {ElasticsearchTransport, HTTPTransport, LogLevel} from "../../src";

// Spy on HTTPTransport's sendBatch (not constructor)
//@ts-ignore
vi.spyOn(HTTPTransport.prototype, 'sendBatch').mockImplementation(async () => {
    // No-op success
});

describe('ElasticsearchTransport', () => {
    const endpoint = 'http://es:9200/logs/_bulk';

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
    });

    afterEach(async () => {
        // Ensure any transport is closed to avoid timer leaks
        // (not strictly needed if we don't instantiate with timers in these tests)
    });

    it('sets correct Content-Type and Authorization headers', () => {
        const apiKey = 'abc123';
        const transport = new ElasticsearchTransport({
            endpoint,
            apiKey
        });

        expect((transport as any).config.headers).toEqual({
            'Content-Type': 'application/x-ndjson',
            'Authorization': 'Bearer abc123'
        });
    });

    it('uses default index "logs" when not specified', () => {
        const transport = new ElasticsearchTransport({ endpoint });
        const entry = {
            level: LogLevel.INFO,
            message: 'hello',
            timestamp: new Date('2025-10-18T10:00:00.000Z'),
            context: {}
        };

        transport.write(entry);
        transport.write(entry); // trigger flush if batchSize=2

        // Force flush (since default batchSize=10, we override via config for test)
        // But easier: just inspect formatter directly
        const formatter = (transport as any).config.formatter;
        const output = formatter.format(entry);
        const [indexLineStr, docLineStr] = output.split('\n');

        const indexLine = JSON.parse(indexLineStr);
        const docLine = JSON.parse(docLineStr);

        expect(indexLine).toEqual({
            index: {
                _index: 'logs',
                _type: '_doc'
            }
        });

        expect(docLine).toMatchObject({
            '@timestamp': '2025-10-18T10:00:00.000Z',
            level: 'INFO',
            message: 'hello'
        });
    });

    it('uses custom index when provided', () => {
        const transport = new ElasticsearchTransport({
            endpoint,
            index: 'my-app-2025.10'
        });

        const entry = {
            level: LogLevel.ERROR,
            message: 'db down',
            timestamp: new Date('2025-10-18T10:00:00.000Z'),
            context: { userId: 'u123' }
        };

        const formatter = (transport as any).config.formatter;
        const output = formatter.format(entry);
        const indexLine = JSON.parse(output.split('\n')[0]);

        expect(indexLine.index._index).toBe('my-app-2025.10');
    });

    it('includes context fields in document body', () => {
        const transport = new ElasticsearchTransport({ endpoint });
        const entry = {
            level: LogLevel.WARN,
            message: 'slow query',
            timestamp: new Date('2025-10-18T10:00:00.000Z'),
            context: { durationMs: 1500, query: 'SELECT *' }
        };

        const formatter = (transport as any).config.formatter;
        const doc = JSON.parse(formatter.format(entry).split('\n')[1]);

        expect(doc).toMatchObject({
            '@timestamp': '2025-10-18T10:00:00.000Z',
            level: 'WARN',
            message: 'slow query',
            durationMs: 1500,
            query: 'SELECT *'
        });
    });

    it('propagates batchSize, flushInterval, and minLevel to HTTPTransport', () => {
        const transport = new ElasticsearchTransport({
            endpoint,
            batchSize: 5,
            flushInterval: 3000,
            minLevel: LogLevel.DEBUG
        });

        const config = (transport as any).config;
        expect(config.batchSize).toBe(5);
        expect(config.flushInterval).toBe(3000);
        expect(config.minLevel).toBe(LogLevel.DEBUG);
    });

    it('sends correctly formatted NDJSON batch to Elasticsearch', async () => {
        //@ts-ignore
        const sendBatchSpy = vi.spyOn(HTTPTransport.prototype, 'sendBatch');
        const transport = new ElasticsearchTransport({
            endpoint,
            batchSize: 2 // flush after 2 logs
        });

        const entry1 = {
            level: LogLevel.INFO,
            message: 'user login',
            timestamp: new Date('2025-10-18T10:00:00.000Z'),
            context: { userId: '1' }
        };
        const entry2 = {
            level: LogLevel.ERROR,
            message: 'payment failed',
            timestamp: new Date('2025-10-18T10:01:00.000Z'),
            context: { orderId: '999' }
        };

        transport.write(entry1);
        transport.write(entry2); // triggers flush

        // Wait for async flush
        await new Promise(setImmediate);

        expect(sendBatchSpy).toHaveBeenCalledTimes(1);
        //@ts-ignore
        const batch: any = sendBatchSpy.mock.calls[0][0];
        expect(batch).toHaveLength(2);
        expect(batch).toEqual([entry1, entry2]);

        // Verify the formatted payload would be valid NDJSON
        const formatter = (transport as any).config.formatter;
        const formattedBatch = batch?.map(e => formatter.format(e));
        const ndjson = formattedBatch.join('\n') + '\n';

        // Should be two pairs of lines (index + doc) → 4 lines total
        const lines = ndjson.trim().split('\n');
        expect(lines).toHaveLength(4);

        // Validate structure
        expect(JSON.parse(lines[0])).toEqual({ index: { _index: 'logs', _type: '_doc' } });
        expect(JSON.parse(lines[1])).toMatchObject({ message: 'user login' });
        expect(JSON.parse(lines[2])).toEqual({ index: { _index: 'logs', _type: '_doc' } });
        expect(JSON.parse(lines[3])).toMatchObject({ message: 'payment failed' });
    });

    it('does not log entries below minLevel', () => {
        const transport = new ElasticsearchTransport({
            endpoint,
            minLevel: LogLevel.WARN
        });

        const debugEntry = {
            level: LogLevel.DEBUG,
            message: 'debug',
            timestamp: new Date(),
            context: {}
        };
        const warnEntry = {
            level: LogLevel.WARN,
            message: 'warn',
            timestamp: new Date(),
            context: {}
        };

        const formatter = (transport as any).config.formatter;
        // Debug should be ignored
        expect(() => formatter.format(debugEntry)).not.toThrow(); // formatter can still run, but write() skips

        // But write() should not enqueue debug
        const queue = (transport as any).queue;
        transport.write(debugEntry);
        expect(queue).toHaveLength(0);

        transport.write(warnEntry);
        expect(queue).toHaveLength(1);
    });

    it('formats without extra newlines (exactly one \\n between index and doc)', () => {
        const transport = new ElasticsearchTransport({ endpoint });
        const entry = {
            level: LogLevel.INFO,
            message: 'test',
            timestamp: new Date('2025-01-01T00:00:00.000Z'),
            context: {}
        };

        const formatter = (transport as any).config.formatter;
        const output = formatter.format(entry);

        // Should be: '{"index":...}\n{"@timestamp":...}' (no trailing \n)
        expect(output.endsWith('\n')).toBe(false);
        const parts = output.split('\n');
        expect(parts).toHaveLength(2);
        expect(() => JSON.parse(parts[0])).not.toThrow();
        expect(() => JSON.parse(parts[1])).not.toThrow();
    });

    it('closes transport and flushes pending logs', async () => {
        //@ts-ignore
        const sendBatchSpy = vi.spyOn(HTTPTransport.prototype, 'sendBatch');
        const transport = new ElasticsearchTransport({ endpoint });

        const entry = {
            level: LogLevel.INFO,
            message: 'pending',
            timestamp: new Date(),
            context: {}
        };

        transport.write(entry);
        await transport.close();

        expect(sendBatchSpy).toHaveBeenCalledTimes(1);
        // @ts-ignore
        expect(sendBatchSpy.mock.calls[0][0]).toEqual([entry]);
    });
});

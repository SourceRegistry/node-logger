import {afterEach, describe, expect, it, vi} from 'vitest';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {BufferedFileTransport, CEFFormatter, ElasticsearchTransport, FileTransport, HTTPTransport, JSONFormatter, Logger, LogLevel, SmartFileTransport, SyslogFormatter, type Transport} from '../src';

const entry = (message: string) => ({level: LogLevel.INFO, message, timestamp: new Date('2026-01-01T00:00:00Z')});

describe('production delivery paths', () => {
    afterEach(() => vi.restoreAllMocks());

    it('closes child and parent together after pending writes settle', async () => {
        let finish!: () => void;
        const pending = new Promise<void>(resolve => { finish = resolve; });
        const close = vi.fn();
        const transport: Transport = {write: () => pending, close};
        const parent = new Logger(LogLevel.INFO, [transport]);
        const child = parent.withTags('request');
        child.info('queued');
        const shutdown = parent.close();
        expect(close).not.toHaveBeenCalled();
        finish();
        await shutdown;
        expect(close).toHaveBeenCalledTimes(1);
        await child.close();
        expect(close).toHaveBeenCalledTimes(1);
        expect(() => child.info('late')).toThrow('Logger is closed');
    });

    it('reports transport write failure through flush', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const logger = new Logger(LogLevel.INFO, [{write: () => Promise.reject(new Error('disk full'))}]);
        logger.info('lost');
        await expect(logger.flush()).rejects.toThrow('One or more log transports failed');
    });

    it('closes every transport even when a flush throws synchronously', async () => {
        const healthyFlush = vi.fn();
        const failingClose = vi.fn();
        const healthyClose = vi.fn();
        const logger = new Logger(LogLevel.INFO, [
            {write: () => undefined, flush: () => { throw new Error('flush failed'); }, close: failingClose},
            {write: () => undefined, flush: healthyFlush, close: healthyClose},
        ]);
        await expect(logger.close()).rejects.toThrow('One or more log transports failed');
        expect(healthyFlush).toHaveBeenCalledTimes(1);
        expect(failingClose).toHaveBeenCalledTimes(1);
        expect(healthyClose).toHaveBeenCalledTimes(1);
    });

    it('writes a real JSON line before close resolves', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'node-logger-'));
        try {
            const path = join(dir, 'app.log');
            const logger = new Logger(LogLevel.INFO, [new FileTransport(path, undefined, LogLevel.INFO, 0)]);
            logger.info('saved', {requestId: 'abc'});
            await logger.close();
            const lines = (await readFile(path, 'utf8')).trim().split('\n');
            expect(lines).toHaveLength(1);
            expect(JSON.parse(lines[0])).toMatchObject({message: 'saved', context: {requestId: 'abc'}});
        } finally {
            await rm(dir, {recursive: true, force: true});
        }
    });

    it('flushes buffered file transports through the logger API', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'node-logger-buffered-'));
        try {
            const bufferedPath = join(dir, 'buffered.log');
            const smartPath = join(dir, 'smart.log');
            const logger = new Logger(LogLevel.INFO, [
                new BufferedFileTransport(bufferedPath, undefined, LogLevel.INFO, 100, 0),
                new SmartFileTransport(smartPath, undefined, LogLevel.INFO, {enabled: false}),
            ]);
            logger.info('flushed');
            await logger.flush();
            expect(await readFile(bufferedPath, 'utf8')).toContain('flushed');
            expect(await readFile(smartPath, 'utf8')).toContain('flushed');
            await logger.close();
        } finally {
            await rm(dir, {recursive: true, force: true});
        }
    });

    it('bounds an explicitly unflushed smart file buffer', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'node-logger-limit-'));
        try {
            const transport = new SmartFileTransport(join(dir, 'limited.log'), undefined, LogLevel.INFO,
                {enabled: false}, {maxBufferSize: 1});
            transport.write(entry('first'));
            expect(() => transport.write(entry('second'))).toThrow('buffer is full');
            await transport.close();
        } finally {
            await rm(dir, {recursive: true, force: true});
        }
    });

    it('drains an in-flight HTTP request and its queued successor on close', async () => {
        let release!: () => void;
        const first = new Promise<Response>(resolve => { release = () => resolve(new Response('', {status: 200})); });
        const fetch = vi.fn().mockReturnValueOnce(first).mockResolvedValue(new Response('', {status: 200}));
        const transport = new HTTPTransport({endpoint: 'https://example.test/logs', batchSize: 1, flushInterval: 0}, fetch);
        transport.write(entry('first'));
        transport.write(entry('second'));
        const shutdown = transport.close();
        expect(fetch).toHaveBeenCalledTimes(1);
        release();
        await shutdown;
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(JSON.parse(fetch.mock.calls[1][1].body)[0]).toContain('second');
    });

    it('rejects a full HTTP queue and does not retry a client error', async () => {
        const fetch = vi.fn().mockResolvedValue(new Response('', {status: 400}));
        const transport = new HTTPTransport({endpoint: 'https://example.test/logs', batchSize: 10,
            maxQueueSize: 1, maxRetries: 3, flushInterval: 0}, fetch);
        transport.write(entry('first'));
        expect(() => transport.write(entry('overflow'))).toThrow('queue is full');
        await expect(transport.flush()).rejects.toThrow('HTTP 400');
        expect(fetch).toHaveBeenCalledTimes(1);
        await expect(transport.close()).rejects.toThrow('HTTP 400');
    });

    it('uses Elasticsearch NDJSON and detects partial bulk failure', async () => {
        const fetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({errors: true}), {status: 200}));
        const transport = new ElasticsearchTransport({endpoint: 'https://example.test/_bulk', apiKey: 'key', maxRetries: 0, flushInterval: 0});
        transport.write(entry('hello'));
        await expect(transport.flush()).rejects.toThrow('item errors');
        const options = fetch.mock.calls[0][1]!;
        expect(options.headers).toMatchObject({'Content-Type': 'application/x-ndjson', Authorization: 'ApiKey key'});
        const lines = String(options.body).trim().split('\n');
        expect(lines).toHaveLength(2);
        expect(JSON.parse(lines[0])).toEqual({index: {_index: 'logs'}});
        expect(JSON.parse(lines[1])).toMatchObject({message: 'hello'});
        await expect(transport.close()).rejects.toThrow('item errors');
    });

    it('serializes unusual context and escapes CEF separators', () => {
        const context: Record<string, unknown> = {id: 123n};
        context.self = context;
        expect(JSON.parse(new JSONFormatter().format({...entry('safe'), context})).context)
            .toEqual({id: '123', self: '[Circular]'});
        const cef = new CEFFormatter().format({...entry('user|login'), context: {'key=x': 'a=b\nc'}});
        expect(cef).toContain('user\\|login');
        expect(cef).toContain('key_x=a\\=b\\nc');
        const syslog = new SyslogFormatter().format({...entry('safe'), context: {'bad key': 'value]'}});
        expect(syslog).toContain('bad_key="value\\]"');
    });
});

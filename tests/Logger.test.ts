import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {Logger, LogLevel, LogEntry, Transport} from '../src'; // adjust path as needed

// Mock transport
class MockTransport implements Transport {
    public writes: LogEntry[] = [];
    public closed = false;

    constructor(
        public shouldThrow = false,
        public asyncWrite = false,
        public shouldReject = false
    ) {
    }

    write(entry: LogEntry): void | Promise<void> {
        if (this.shouldThrow) {
            throw new Error('Sync write failed');
        }
        this.writes.push(entry);
        if (this.asyncWrite) {
            if (this.shouldReject) {
                return Promise.reject(new Error('Async write failed'));
            }
            return Promise.resolve();
        }
    }

    async close(): Promise<void> {
        this.closed = true;
    }
}

describe('Logger', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should filter logs below minLevel', () => {
        const transport = new MockTransport();
        const logger = new Logger(LogLevel.WARN, [transport]);

        logger.info('This should not appear');
        logger.warn('This should appear');

        expect(transport.writes).toHaveLength(1);
        expect(transport.writes[0].message).toBe('This should appear');
        expect(transport.writes[0].level).toBe(LogLevel.WARN);
    });

    it('should log with context', () => {
        const transport = new MockTransport();
        const logger = new Logger(LogLevel.DEBUG, [transport]);

        logger.debug('Test', {userId: 123});

        expect(transport.writes[0].context).toEqual({userId: 123});
    });

    it('should handle error in error() and fatal() methods', () => {
        const transport = new MockTransport();
        const logger = new Logger(LogLevel.ERROR, [transport]);
        const err = new Error('Test error');

        logger.error('Message', err);
        logger.fatal('Fatal message', err);

        expect(transport.writes[0].error).toBe(err);
        expect(transport.writes[1].error).toBe(err);
    });

    it('should support context + error in error/fatal', () => {
        const transport = new MockTransport();
        const logger = new Logger(LogLevel.ERROR, [transport]);
        const err = new Error('Oops');

        logger.error('With context', {id: 1}, err);
        logger.fatal('Fatal with context', {id: 2}, err);

        expect(transport.writes[0].context).toEqual({id: 1});
        expect(transport.writes[0].error).toBe(err);
        expect(transport.writes[1].context).toEqual({id: 2});
        expect(transport.writes[1].error).toBe(err);
    });

    it('should support tagging via withTags()', () => {
        const transport = new MockTransport();
        const logger = new Logger(LogLevel.INFO, [transport]).withTags('auth', 'v1');

        logger.info('Tagged log');

        expect(transport.writes[0].tags).toEqual(['auth', 'v1']);
    });

    it('should not mutate parent tags when using withTags()', () => {
        const transport = new MockTransport();
        const parent = new Logger(LogLevel.INFO, [transport]);
        const child = parent.withTags('child');

        parent.info('Parent');
        child.info('Child');

        expect(transport.writes[0].tags).toBeUndefined();
        expect(transport.writes[1].tags).toEqual(['child']);
    });

    it('should call all transports', () => {
        const t1 = new MockTransport();
        const t2 = new MockTransport();
        const logger = new Logger(LogLevel.INFO, [t1, t2]);

        logger.info('Hello');

        expect(t1.writes).toHaveLength(1);
        expect(t2.writes).toHaveLength(1);
    });

    it('should handle sync transport errors without crashing', () => {
        const badTransport = new MockTransport(true); // throws
        const goodTransport = new MockTransport();
        const logger = new Logger(LogLevel.INFO, [badTransport, goodTransport]);

        logger.info('Test');

        expect(goodTransport.writes).toHaveLength(1);
        expect(console.error).toHaveBeenCalledWith('Sync transport failed:', expect.any(Error));
    });

    it('should handle async transport rejections without crashing', async () => {
        const badAsync = new MockTransport(false, true, true); // async + reject
        const logger = new Logger(LogLevel.INFO, [badAsync]);

        logger.info('Async fail test');

        // Let microtask queue flush
        await new Promise(setImmediate);

        expect(console.error).toHaveBeenCalledWith('Async transport failed:', expect.any(Error));
    });

    it('should support addTransport and removeTransport', () => {
        const t1 = new MockTransport();
        const t2 = new MockTransport();
        const logger = new Logger(LogLevel.INFO, [t1]);

        logger.addTransport(t2);
        logger.info('After add');
        expect(t1.writes).toHaveLength(1);
        expect(t2.writes).toHaveLength(1);

        logger.removeTransport(t1);
        logger.info('After remove');
        expect(t1.writes).toHaveLength(1); // no new log
        expect(t2.writes).toHaveLength(2);
    });

    it('should not crash if removing non-existent transport', () => {
        const logger = new Logger(LogLevel.INFO, []);
        const fake = new MockTransport();
        expect(() => logger.removeTransport(fake)).not.toThrow();
    });

    it('should respect setLevel()', () => {
        const transport = new MockTransport();
        const logger = new Logger(LogLevel.ERROR, [transport]);

        logger.info('Skipped');
        expect(transport.writes).toHaveLength(0);

        logger.setLevel(LogLevel.INFO);
        logger.info('Now logged');
        expect(transport.writes).toHaveLength(1);
    });

    it('should close all transports that implement close()', async () => {
        const t1 = new MockTransport();
        const t2 = new MockTransport();
        // Simulate a transport without close
        const t3 = {
            write: () => {
            }
        } as Transport;

        const logger = new Logger(LogLevel.INFO, [t1, t2, t3]);
        await logger.close();

        expect(t1.closed).toBe(true);
        expect(t2.closed).toBe(true);
        // t3 has no close, so nothing to check
    });

    it('should handle close() rejection gracefully (if any)', async () => {
        const faultyCloseTransport = {
            write: () => {
            },
            close: () => Promise.reject(new Error('Close failed'))
        } as Transport;

        const logger = new Logger(LogLevel.INFO, [faultyCloseTransport]);
        // Should not throw
        await expect(logger.close()).resolves.toBeUndefined()
    });
});

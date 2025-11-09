import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import { SmartFileTransport, LogLevel, LogEntry, AutoFlushConfig, JSONFormatter } from '../../src';

// Mocks for fs/path
const mocks = vi.hoisted(() => ({
    fs: {
        existsSync: vi.fn(),
        mkdirSync: vi.fn(),
        createWriteStream: vi.fn(),
    },
    path: {
        dirname: vi.fn(),
    },
}));

vi.mock('fs', () => mocks.fs);
vi.mock('path', () => mocks.path);

// Helper to create log entries
const createLogEntry = (level: LogLevel = LogLevel.INFO, message = 'test'): LogEntry => ({
    level,
    message,
    timestamp: new Date('2025-10-21T16:25:47.000Z'), // Fixed timestamp for deterministic output
});

// Helper to create mock write stream
const createMockWriteStream = () => ({
    write: vi.fn().mockImplementation((data, cb) => {
        if (cb) cb(null);
        return true;
    }),
    end: vi.fn().mockImplementation((cb) => {
        if (cb) cb();
    }),
});

describe('SmartFileTransport', () => {
    const filePath = './logs/smart.log';
    const dirPath = './logs';

    let transport: SmartFileTransport;
    let mockWriteStream: ReturnType<typeof createMockWriteStream>;
    const defaultAutoFlush: AutoFlushConfig = {
        enabled: true,
        interval: 5000,
        onSize: 50,
        onLevel: LogLevel.ERROR,
        onIdle: 10000,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers(); // reset any fake timers from previous tests

        mockWriteStream = createMockWriteStream();
        mocks.path.dirname.mockReturnValue(dirPath);
        mocks.fs.existsSync.mockReturnValue(false);
        mocks.fs.mkdirSync.mockImplementation(() => {});
        mocks.fs.createWriteStream.mockReturnValue(mockWriteStream);
    });

    afterEach(async () => {
        if (transport?.close) {
            await transport.close();
        }
        vi.useRealTimers(); // ensure real timers after each test
    });

    it('creates directory if it does not exist', () => {
        transport = new SmartFileTransport(filePath);
        expect(mocks.path.dirname).toHaveBeenCalledWith(filePath);
        expect(mocks.fs.existsSync).toHaveBeenCalledWith(dirPath);
        expect(mocks.fs.mkdirSync).toHaveBeenCalledWith(dirPath, { recursive: true });
    });

    it('does not create directory if it exists', () => {
        mocks.fs.existsSync.mockReturnValue(true);
        transport = new SmartFileTransport(filePath);
        expect(mocks.fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('initializes write stream with append flag', () => {
        transport = new SmartFileTransport(filePath);
        expect(mocks.fs.createWriteStream).toHaveBeenCalledWith(filePath, { flags: 'a' });
    });

    it('does not set up auto-flush if disabled', () => {
        vi.useFakeTimers();

        const autoFlush = { ...defaultAutoFlush, enabled: false };
        transport = new SmartFileTransport(filePath, undefined, LogLevel.INFO, autoFlush);

        transport.write(createLogEntry(LogLevel.INFO, 'test'));
        expect(mockWriteStream.write).not.toHaveBeenCalled(); // not flushed immediately

        // Advance time beyond any possible interval or idle
        vi.advanceTimersByTime(10000);

        // Still should not flush — because auto-flush is disabled
        expect(mockWriteStream.write).not.toHaveBeenCalled();
    });

    it('sets up interval-based auto-flush', () => {
        vi.useFakeTimers();
        transport = new SmartFileTransport(filePath, undefined, LogLevel.INFO, {
            enabled: true,
            interval: 2000,
        });

        const entry = createLogEntry(LogLevel.INFO, 'log1');
        transport.write(entry);
        expect(mockWriteStream.write).not.toHaveBeenCalled();

        vi.advanceTimersByTime(2000);

        const expectedJson = new JSONFormatter().format(entry);
        expect(mockWriteStream.write).toHaveBeenCalledWith(
            expect.stringContaining(expectedJson),
            expect.any(Function)
        );
    });

    it('flushes when buffer reaches onSize threshold', () => {
        transport = new SmartFileTransport(filePath, undefined, LogLevel.INFO, {
            enabled: true,
            onSize: 2,
        });

        const first = createLogEntry(LogLevel.INFO, 'first');
        const second = createLogEntry(LogLevel.INFO, 'second');

        transport.write(first);
        expect(mockWriteStream.write).not.toHaveBeenCalled();

        transport.write(second);

        const formatter = new JSONFormatter();
        const expected = `${formatter.format(first)}\n${formatter.format(second)}\n`;
        expect(mockWriteStream.write).toHaveBeenCalledWith(
            expect.stringContaining(formatter.format(first)),
            expect.any(Function)
        );
        // Better: check full content
        expect(mockWriteStream.write.mock.calls[0][0]).toBe(expected);
    });

    it('immediately flushes logs at or above onLevel', () => {
        transport = new SmartFileTransport(filePath, undefined, LogLevel.INFO, {
            enabled: true,
            onLevel: LogLevel.WARN,
        });

        const info = createLogEntry(LogLevel.INFO, 'info');
        const error = createLogEntry(LogLevel.ERROR, 'critical');

        transport.write(info);
        expect(mockWriteStream.write).not.toHaveBeenCalled();

        transport.write(error);

        const formatter = new JSONFormatter();
        const expected = `${formatter.format(info)}\n${formatter.format(error)}\n`;
        expect(mockWriteStream.write.mock.calls[0][0]).toBe(expected);
    });

    it('resets idle timer on every write', () => {
        vi.useFakeTimers();
        transport = new SmartFileTransport(filePath, undefined, LogLevel.INFO, {
            enabled: true,
            onIdle: 3000,
        });

        transport.write(createLogEntry());
        vi.advanceTimersByTime(2000);
        expect(mockWriteStream.write).not.toHaveBeenCalled();

        transport.write(createLogEntry());
        vi.advanceTimersByTime(2500);
        expect(mockWriteStream.write).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1000); // total 3500ms since last write
        expect(mockWriteStream.write).toHaveBeenCalled();
    });

    it('filters out logs below minLevel', () => {
        transport = new SmartFileTransport(filePath, undefined, LogLevel.WARN);
        transport.write(createLogEntry(LogLevel.INFO));
        transport.write(createLogEntry(LogLevel.DEBUG));
        expect(mockWriteStream.write).not.toHaveBeenCalled();
    });

    it('does not write when closing', () => {
        transport = new SmartFileTransport(filePath);
        transport.close();
        transport.write(createLogEntry(LogLevel.ERROR));
        expect(mockWriteStream.write).not.toHaveBeenCalled();
    });

    it('final flush on close', async () => {
        transport = new SmartFileTransport(filePath);
        const entry = createLogEntry(LogLevel.INFO, 'final');
        transport.write(entry);
        await transport.close();

        const expectedJson = new JSONFormatter().format(entry);
        expect(mockWriteStream.write).toHaveBeenCalledWith(
            expect.stringContaining(expectedJson),
            expect.any(Function)
        );
        expect(mockWriteStream.end).toHaveBeenCalled();
    });

    it('handles write errors gracefully', () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        mockWriteStream.write.mockImplementationOnce((data, cb) => {
            if (cb) cb(new Error('Disk full'));
            return false;
        });

        transport = new SmartFileTransport(filePath);
        transport.write(createLogEntry());
        (transport as any).flush();

        expect(consoleErrorSpy).toHaveBeenCalledWith('SmartFileTransport write error:', expect.any(Error));
        consoleErrorSpy.mockRestore();
    });

    it('flush is no-op when buffer is empty', () => {
        transport = new SmartFileTransport(filePath);
        (transport as any).flush();
        expect(mockWriteStream.write).not.toHaveBeenCalled();
    });

    it('multiple auto-flush conditions can coexist', () => {
        vi.useFakeTimers();
        transport = new SmartFileTransport(filePath, undefined, LogLevel.INFO, {
            enabled: true,
            interval: 5000,
            onSize: 3,
            onLevel: LogLevel.ERROR,
            onIdle: 4000,
        });

        transport.write(createLogEntry(LogLevel.INFO, '1'));
        transport.write(createLogEntry(LogLevel.INFO, '2'));
        expect(mockWriteStream.write).not.toHaveBeenCalled();

        transport.write(createLogEntry(LogLevel.FATAL, 'boom'));
        expect(mockWriteStream.write).toHaveBeenCalled();
        mockWriteStream.write.mockClear();

        transport.write(createLogEntry(LogLevel.INFO, 'after'));
        vi.advanceTimersByTime(4000);
        expect(mockWriteStream.write).toHaveBeenCalled();
    });

    // ✅ Additional: test formatter is customizable
    it('uses custom formatter if provided', () => {
        const customFormatter = {
            format: (entry: LogEntry) => `[${LogLevel[entry.level]}] ${entry.message}`,
        };
        transport = new SmartFileTransport(filePath, customFormatter, LogLevel.INFO);
        const entry = createLogEntry(LogLevel.INFO, 'custom');
        transport.write(entry);
        (transport as any).flush();
        expect(mockWriteStream.write).toHaveBeenCalledWith(
            expect.stringContaining('[INFO] custom'),
            expect.any(Function)
        );
    });

    // ✅ Additional: test close is idempotent
    it('close is safe to call multiple times', async () => {
        transport = new SmartFileTransport(filePath);
        await transport.close();
        await transport.close(); // should not throw
        expect(mockWriteStream.end).toHaveBeenCalledTimes(1);
    });
});

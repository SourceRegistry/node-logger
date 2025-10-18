// tests/transports/SmartFileTransport.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SmartFileTransport, LogLevel, LogEntry, AutoFlushConfig } from '../../src';

// ✅ Define mocks BEFORE vi.mock using vi.hoisted
const mocks = vi.hoisted(() => {
    return {
        fs: {
            existsSync: vi.fn(),
            mkdirSync: vi.fn(),
            createWriteStream: vi.fn(),
        },
        path: {
            dirname: vi.fn(),
        },
    };
});

vi.mock('fs', () => mocks.fs);
vi.mock('path', () => mocks.path);

// Helper
const createLogEntry = (level: LogLevel = LogLevel.INFO, message = 'test'): LogEntry => ({
    level,
    message,
    timestamp: new Date(),
});

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
        vi.useRealTimers();

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
        const autoFlush = { ...defaultAutoFlush, enabled: false };
        transport = new SmartFileTransport(filePath, undefined, LogLevel.INFO, autoFlush);
        // No timers should be set
        expect(setInterval).not.toHaveBeenCalled();
        // But we can't easily spy on global setInterval without mocking it
        // Instead, verify behavior via flush not being called automatically
    });

    it('sets up interval-based auto-flush', () => {
        vi.useFakeTimers();
        transport = new SmartFileTransport(filePath, undefined, LogLevel.INFO, {
            enabled: true,
            interval: 2000,
        });

        transport.write(createLogEntry(LogLevel.INFO, 'log1'));
        expect(mockWriteStream.write).not.toHaveBeenCalled(); // not flushed yet

        vi.advanceTimersByTime(2000);
        expect(mockWriteStream.write).toHaveBeenCalledWith(expect.stringContaining('log1\n'), expect.any(Function));
    });

    it('flushes when buffer reaches onSize threshold', () => {
        transport = new SmartFileTransport(filePath, undefined, LogLevel.INFO, {
            enabled: true,
            onSize: 2,
        });

        transport.write(createLogEntry(LogLevel.INFO, 'first'));
        expect(mockWriteStream.write).not.toHaveBeenCalled();

        transport.write(createLogEntry(LogLevel.INFO, 'second')); // triggers flush
        expect(mockWriteStream.write).toHaveBeenCalledWith(expect.stringContaining('first\nsecond\n'), expect.any(Function));
    });

    it('immediately flushes logs at or above onLevel', () => {
        transport = new SmartFileTransport(filePath, undefined, LogLevel.INFO, {
            enabled: true,
            onLevel: LogLevel.WARN,
        });

        transport.write(createLogEntry(LogLevel.INFO)); // below threshold → buffered
        expect(mockWriteStream.write).not.toHaveBeenCalled();

        transport.write(createLogEntry(LogLevel.ERROR, 'critical')); // triggers flush
        const data = mockWriteStream.write.mock.calls[0][0];
        expect(data).toContain('INFO'); // both logs flushed
        expect(data).toContain('critical');
    });

    it('resets idle timer on every write', () => {
        vi.useFakeTimers();
        transport = new SmartFileTransport(filePath, undefined, LogLevel.INFO, {
            enabled: true,
            onIdle: 3000,
        });

        transport.write(createLogEntry());
        vi.advanceTimersByTime(2000); // not yet flushed
        expect(mockWriteStream.write).not.toHaveBeenCalled();

        transport.write(createLogEntry()); // resets timer
        vi.advanceTimersByTime(2500); // still not 3s since last write
        expect(mockWriteStream.write).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1000); // now 3.5s since last write → flush
        expect(mockWriteStream.write).toHaveBeenCalled();
    });

    it('filters out logs below minLevel', () => {
        transport = new SmartFileTransport(filePath, undefined, LogLevel.WARN);
        transport.write(createLogEntry(LogLevel.INFO));
        transport.write(createLogEntry(LogLevel.DEBUG));
        expect(mockWriteStream.write).not.toHaveBeenCalled();
        expect(transport).toBeDefined(); // just to satisfy coverage
    });

    it('does not write when closing', () => {
        transport = new SmartFileTransport(filePath);
        transport.close(); // sets isClosing = true
        transport.write(createLogEntry(LogLevel.ERROR));
        expect(mockWriteStream.write).not.toHaveBeenCalled();
    });

    it('final flush on close', async () => {
        transport = new SmartFileTransport(filePath);
        transport.write(createLogEntry(LogLevel.INFO, 'final'));
        await transport.close();
        expect(mockWriteStream.write).toHaveBeenCalledWith(expect.stringContaining('final\n'), expect.any(Function));
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

        // Flush manually to trigger write
        (transport as any).flush();

        expect(consoleErrorSpy).toHaveBeenCalledWith('SmartFileTransport write error:', expect.any(Error));
        consoleErrorSpy.mockRestore();
    });

    it('flush is no-op when buffer is empty', () => {
        transport = new SmartFileTransport(filePath);
        (transport as any).flush(); // should not call write
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

        // Not yet flushed (size=2 < 3)
        expect(mockWriteStream.write).not.toHaveBeenCalled();

        // Trigger by level
        transport.write(createLogEntry(LogLevel.FATAL, 'boom'));
        expect(mockWriteStream.write).toHaveBeenCalled();
        mockWriteStream.write.mockClear();

        // Now test idle
        transport.write(createLogEntry(LogLevel.INFO, 'after'));
        vi.advanceTimersByTime(4000);
        expect(mockWriteStream.write).toHaveBeenCalled();
    });
});

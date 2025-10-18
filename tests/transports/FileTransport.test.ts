// tests/transports/FileTransport.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FileTransport, LogLevel, LogEntry } from '../../src';

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

// Mock write stream (defined outside so we can reset it per test)
const createMockWriteStream = () => ({
    write: vi.fn().mockImplementation((data, cb) => {
        if (cb) cb(null);
        return true;
    }),
    end: vi.fn().mockImplementation((cb) => {
        if (cb) cb();
    }),
    sync: vi.fn(), // for forceFlush
    destroyed: false,
});

describe('FileTransport', () => {
    const filePath = './logs/app.log';
    const dirPath = './logs';

    let transport: FileTransport;
    let mockWriteStream: ReturnType<typeof createMockWriteStream>;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();

        // Reset stream mock
        mockWriteStream = createMockWriteStream();

        // Set up default mock behaviors
        mocks.path.dirname.mockReturnValue(dirPath);
        mocks.fs.existsSync.mockReturnValue(false); // simulate dir missing
        mocks.fs.mkdirSync.mockImplementation(() => {});
        mocks.fs.createWriteStream.mockReturnValue(mockWriteStream);
    });

    afterEach(async () => {
        if (transport?.close) {
            await transport.close();
        }
    });

    it('creates directory if it does not exist', () => {
        transport = new FileTransport(filePath);
        expect(mocks.path.dirname).toHaveBeenCalledWith(filePath);
        expect(mocks.fs.existsSync).toHaveBeenCalledWith(dirPath);
        expect(mocks.fs.mkdirSync).toHaveBeenCalledWith(dirPath, { recursive: true });
    });

    it('does not create directory if it exists', () => {
        mocks.fs.existsSync.mockReturnValue(true);
        transport = new FileTransport(filePath);
        expect(mocks.fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('initializes write stream with append flag', () => {
        transport = new FileTransport(filePath);
        expect(mocks.fs.createWriteStream).toHaveBeenCalledWith(filePath, { flags: 'a' });
    });

    it('sets up auto-flush timer when interval > 0', () => {
        const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
        transport = new FileTransport(filePath, undefined, LogLevel.INFO, 1000);

        // Timer should be set
        expect(transport).toBeDefined();

        // Clean up
        transport.close();
        expect(clearIntervalSpy).toHaveBeenCalled();
        clearIntervalSpy.mockRestore();
    });

    it('does not set auto-flush timer when interval <= 0', () => {
        const setIntervalSpy = vi.spyOn(global, 'setInterval');
        transport = new FileTransport(filePath, undefined, LogLevel.INFO, 0);
        expect(setIntervalSpy).not.toHaveBeenCalled();
        setIntervalSpy.mockRestore();
    });

    it('filters out logs below minLevel', () => {
        transport = new FileTransport(filePath, undefined, LogLevel.WARN);
        transport.write(createLogEntry(LogLevel.INFO));
        transport.write(createLogEntry(LogLevel.DEBUG));
        expect(mockWriteStream.write).not.toHaveBeenCalled();
    });

    it('writes logs at or above minLevel', async () => {
        const formatter = { format: (entry: any) => `LOG: ${entry.message}` };
        transport = new FileTransport(filePath, formatter, LogLevel.INFO);

        const entry = createLogEntry(LogLevel.ERROR, 'file error');
        transport.write(entry);

        // Wait for queue to process
        await (transport as any).writeQueue;

        expect(mockWriteStream.write).toHaveBeenCalledWith(
            'LOG: file error\n',
            expect.any(Function)
        );
    });

    it('queues writes sequentially', async () => {
        transport = new FileTransport(filePath);

        transport.write(createLogEntry(LogLevel.INFO, 'first'));
        transport.write(createLogEntry(LogLevel.INFO, 'second'));

        await (transport as any).writeQueue;

        expect(mockWriteStream.write).toHaveBeenCalledTimes(2);
        expect(mockWriteStream.write).toHaveBeenNthCalledWith(1, expect.stringContaining('first'), expect.any(Function));
        expect(mockWriteStream.write).toHaveBeenNthCalledWith(2, expect.stringContaining('second'), expect.any(Function));
    });

    it('handles write errors gracefully', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        mockWriteStream.write.mockImplementationOnce((data, cb) => {
            if (cb) cb(new Error('Disk full'));
            return false;
        });

        transport = new FileTransport(filePath);
        transport.write(createLogEntry());

        await (transport as any).writeQueue;

        expect(consoleErrorSpy).toHaveBeenCalledWith('FileTransport write error:', expect.any(Error));
        consoleErrorSpy.mockRestore();
    });

    it('calls forceFlush on auto-flush timer', () => {
        vi.useFakeTimers();
        const forceFlushSpy = vi.spyOn(FileTransport.prototype as any, 'forceFlush');

        transport = new FileTransport(filePath, undefined, LogLevel.INFO, 1000);
        vi.advanceTimersByTime(1000);

        expect(forceFlushSpy).toHaveBeenCalled();
        forceFlushSpy.mockRestore();
    });

    it('forceFlush calls sync if available', () => {
        transport = new FileTransport(filePath);
        (transport as any).forceFlush();
        expect(mockWriteStream.sync).toHaveBeenCalled();
    });

    it('forceFlush handles sync error gracefully', () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        mockWriteStream.sync.mockImplementation(() => {
            throw new Error('Sync failed');
        });

        transport = new FileTransport(filePath);
        (transport as any).forceFlush();

        expect(consoleErrorSpy).toHaveBeenCalledWith('FileTransport flush error:', expect.any(Error));
        consoleErrorSpy.mockRestore();
    });

    it('close waits for pending writes, flushes, and ends stream', async () => {
        transport = new FileTransport(filePath);
        transport.write(createLogEntry(LogLevel.INFO, 'final log'));

        await transport.close();

        expect(mockWriteStream.write).toHaveBeenCalled();
        expect(mockWriteStream.sync).toHaveBeenCalled();
        expect(mockWriteStream.end).toHaveBeenCalled();
    });

    it('close works even if no writes occurred', async () => {
        transport = new FileTransport(filePath);
        await transport.close();
        expect(mockWriteStream.end).toHaveBeenCalled();
    });
});

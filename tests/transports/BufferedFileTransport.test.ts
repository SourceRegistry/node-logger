import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {BufferedFileTransport, LogLevel} from "../../src";

// Mock fs
vi.mock('fs');
vi.mock('path');

const mockWriteStream = {
    write: vi.fn().mockImplementation((data, cb) => {
        if (cb) cb(null);
        return true;
    }),
    end: vi.fn().mockImplementation((cb) => {
        if (cb) cb();
    }),
    destroyed: false,
};

describe('BufferedFileTransport', () => {
    const filePath = '/logs/test.log';
    const dirPath = '/logs';

    beforeEach(() => {
        vi.clearAllMocks();
        (fs.existsSync as any).mockReturnValue(false);
        (fs.mkdirSync as any).mockImplementation(() => {});
        (fs.createWriteStream as any).mockReturnValue(mockWriteStream);
        (path.dirname as any).mockReturnValue(dirPath);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('creates directory if not exists', () => {
        new BufferedFileTransport(filePath);
        expect(fs.existsSync).toHaveBeenCalledWith(dirPath);
        expect(fs.mkdirSync).toHaveBeenCalledWith(dirPath, { recursive: true });
    });

    it('does not create directory if exists', () => {
        (fs.existsSync as any).mockReturnValue(true);
        new BufferedFileTransport(filePath);
        expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('throws if mkdirSync fails', () => {
        const error = new Error('EACCES');
        (fs.mkdirSync as any).mockImplementation(() => { throw error; });
        expect(() => new BufferedFileTransport(filePath)).toThrow(error);
    });

    it('writes only entries >= minLevel', () => {
        const transport = new BufferedFileTransport(filePath, undefined, LogLevel.WARN);
        const debugEntry = { level: LogLevel.DEBUG, message: 'debug', timestamp: new Date(), context: {} };
        const warnEntry = { level: LogLevel.WARN, message: 'warn', timestamp: new Date(), context: {} };

        transport.write(debugEntry);
        transport.write(warnEntry);

        expect(mockWriteStream.write).not.toHaveBeenCalledWith(expect.stringContaining('debug'));
        // Buffer not flushed yet (size=1 < 100), so write not called
        expect(mockWriteStream.write).not.toHaveBeenCalled();
    });

    it('auto-flushes when buffer reaches bufferSize', () => {
        const transport = new BufferedFileTransport(filePath, undefined, LogLevel.TRACE, 2);
        const entry1 = { level: LogLevel.INFO, message: 'msg1', timestamp: new Date(), context: {} };
        const entry2 = { level: LogLevel.INFO, message: 'msg2', timestamp: new Date(), context: {} };

        transport.write(entry1);
        expect(mockWriteStream.write).not.toHaveBeenCalled();

        transport.write(entry2); // triggers flush
        expect(mockWriteStream.write).toHaveBeenCalled();
        expect(mockWriteStream.write.mock.calls[0][0]).toContain('msg1');
        expect(mockWriteStream.write.mock.calls[0][0]).toContain('msg2');
    });

    it('auto-flushes on interval', async () => {
        vi.useFakeTimers();
        const transport = new BufferedFileTransport(filePath, undefined, LogLevel.TRACE, 100, 500);
        const entry = { level: LogLevel.INFO, message: 'timed', timestamp: new Date(), context: {} };

        transport.write(entry);
        expect(mockWriteStream.write).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(500);
        expect(mockWriteStream.write).toHaveBeenCalled();
        expect(mockWriteStream.write.mock.calls[0][0]).toContain('timed');
    });

    it('does not write after close', async () => {
        const transport = new BufferedFileTransport(filePath);
        await transport.close();

        const entry = { level: LogLevel.INFO, message: 'after close', timestamp: new Date(), context: {} };
        transport.write(entry);

        expect(mockWriteStream.write).not.toHaveBeenCalled();
    });

    it('final flush on close', async () => {
        const transport = new BufferedFileTransport(filePath, undefined, LogLevel.TRACE, 100);
        const entry = { level: LogLevel.INFO, message: 'final', timestamp: new Date(), context: {} };

        transport.write(entry);
        expect(mockWriteStream.write).not.toHaveBeenCalled();

        await transport.close();
        expect(mockWriteStream.write).toHaveBeenCalled();
        expect(mockWriteStream.write.mock.calls[0][0]).toContain('final');
    });

    it('handles write error gracefully', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const failingStream = {
            write: vi.fn().mockImplementation((data, cb) => {
                if (cb) cb(new Error('disk full'));
            }),
            end: vi.fn(),
            destroyed: false,
        };
        (fs.createWriteStream as any).mockReturnValue(failingStream);

        const transport = new BufferedFileTransport(filePath);
        const entry = { level: LogLevel.INFO, message: 'test', timestamp: new Date(), context: {} };
        transport.write(entry);
        transport.flush();

        expect(consoleSpy).toHaveBeenCalledWith('BufferedFileTransport write error:', expect.any(Error));
        consoleSpy.mockRestore();
    });

    it('close is idempotent', async () => {
        const transport = new BufferedFileTransport(filePath);
        await transport.close();
        await transport.close(); // should not throw or double-end
        expect(mockWriteStream.end).toHaveBeenCalledTimes(1);
    });

    it('does not flush if buffer is empty', () => {
        const transport = new BufferedFileTransport(filePath);
        transport.flush(); // no-op
        expect(mockWriteStream.write).not.toHaveBeenCalled();
    });

    it('does not write if stream is destroyed', () => {
        const destroyedStream = { ...mockWriteStream, destroyed: true };
        (fs.createWriteStream as any).mockReturnValue(destroyedStream);

        const transport = new BufferedFileTransport(filePath);
        const entry = { level: LogLevel.INFO, message: 'test', timestamp: new Date(), context: {} };
        transport.write(entry);
        transport.flush();

        expect(destroyedStream.write).not.toHaveBeenCalled();
    });
});

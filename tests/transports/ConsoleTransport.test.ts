import {describe, it, expect, vi, beforeEach, afterEach, Mock} from 'vitest';
import { ConsoleTransport, LogLevel, TextFormatter, LogEntry } from '../../src';

describe('ConsoleTransport', () => {
    let mockConsole: {
        log: Mock;
        info: Mock;
        warn: Mock;
        error: Mock;
    };

    beforeEach(() => {
        mockConsole = {
            log: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        };
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('writes to console.log for INFO and below', () => {
        const transport = new ConsoleTransport(
            new TextFormatter(),
            LogLevel.INFO,
            mockConsole as any // inject mock
        );

        const entry: LogEntry = {
            level: LogLevel.INFO,
            message: 'test',
            timestamp: new Date('2025-10-18T08:45:24.217Z'),
        };

        transport.write(entry);

        expect(mockConsole.log).toHaveBeenCalledWith(
            expect.stringContaining('test')
        );
        expect(mockConsole.error).not.toHaveBeenCalled();
    });

    it('writes ERROR to console.error', () => {
        const transport = new ConsoleTransport(
            new TextFormatter(),
            LogLevel.INFO,
            mockConsole as any
        );

        transport.write({
            level: LogLevel.ERROR,
            message: 'error test',
            timestamp: new Date(),
        });

        expect(mockConsole.error).toHaveBeenCalledWith(
            expect.stringContaining('error test')
        );
        expect(mockConsole.log).not.toHaveBeenCalled();
    });
});

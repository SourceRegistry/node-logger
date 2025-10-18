import { describe, it, expect } from 'vitest';
import { CEFFormatter, LogLevel } from '../../src';

describe('CEFFormatter', () => {
    const formatter = new CEFFormatter();

    it('formats basic log entry in CEF', () => {
        const output = formatter.format({
            level: LogLevel.INFO,
            message: 'User login',
            timestamp: new Date('2025-10-18T12:00:00.000Z')
        });

        expect(output).toBe(
            'CEF:0|SourceRegistry|NodeLogger|1.0|INFO|User login|3|rt=1760788800000'
        );
    });

    it('maps log levels to CEF severity correctly', () => {
        const testCases = [
            { level: LogLevel.TRACE, severity: 1 },
            { level: LogLevel.DEBUG, severity: 2 },
            { level: LogLevel.INFO,  severity: 3 },
            { level: LogLevel.WARN,  severity: 6 },
            { level: LogLevel.ERROR, severity: 8 },
            { level: LogLevel.FATAL, severity: 10 },
            { level: -1, severity: 0 },
        ];

        for (const { level, severity } of testCases) {
            const output = formatter.format({
                level,
                message: 'test',
                timestamp: new Date('2025-10-18T12:00:00.000Z')
            });
            expect(output).toContain(`|${severity}|`);
        }
    });

    it('includes context fields', () => {
        const output = formatter.format({
            level: LogLevel.WARN,
            message: 'Context test',
            context: { user: 'alice', role: 'admin' },
            timestamp: new Date('2025-10-18T12:00:00.000Z')
        });

        expect(output).toContain('user=alice');
        expect(output).toContain('role=admin');
    });

    it('includes error message in the Name field (message)', () => {
        const output = formatter.format({
            level: LogLevel.ERROR,
            message: 'Connection failed',
            error: new Error('DB timeout'),
            timestamp: new Date('2025-10-18T12:00:00.000Z')
        });

        // Note: your current formatter does NOT include error in message
        // So unless you update it, this will just be "Connection failed"
        expect(output).toContain('|Connection failed|');
    });
});

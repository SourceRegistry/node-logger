// tests/formatters/TextFormatter.test.ts
import { describe, it, expect } from 'vitest';
import { TextFormatter, LogLevel } from '../../src';

describe('TextFormatter', () => {
    const timestamp = new Date('2025-10-18T12:00:00.000Z');

    it('formats basic log with timestamp, level, and message (colored)', () => {
        const formatter = new TextFormatter(true, true);
        const output = formatter.format({
            level: LogLevel.INFO,
            message: 'App started',
            timestamp
        });

        expect(output).toBe(
            `[2025-10-18T12:00:00.000Z] \x1b[34m [INFO] \x1b[0m App started`
        );
    });

    it('omits timestamp when includeTimestamp=false', () => {
        const formatter = new TextFormatter(false, true);
        const output = formatter.format({
            level: LogLevel.WARN,
            message: 'No timestamp',
            timestamp
        });

        expect(output).toBe(`\x1b[38;2;253;182;0m [WARN] \x1b[0m No timestamp`);
    });

    it('omits colors when colored=false', () => {
        const formatter = new TextFormatter(true, false);
        const output = formatter.format({
            level: LogLevel.ERROR,
            message: 'Plain text',
            timestamp
        });

        expect(output).toBe(`[2025-10-18T12:00:00.000Z] [ERROR] Plain text`);
    });

    it('includes tags if present', () => {
        const formatter = new TextFormatter(true, false);
        const output = formatter.format({
            level: LogLevel.DEBUG,
            message: 'Tagged log',
            tags: ['auth', 'v2'],
            timestamp
        });

        expect(output).toBe(`[2025-10-18T12:00:00.000Z] [DEBUG] [auth,v2] Tagged log`);
    });

    it('includes context as JSON if present', () => {
        const formatter = new TextFormatter(false, false);
        const output = formatter.format({
            level: LogLevel.INFO,
            message: 'With context',
            context: { userId: 123, ip: '192.168.1.1' },
            timestamp
        });

        expect(output).toBe(`[INFO] With context {"userId":123,"ip":"192.168.1.1"}`);
    });

    it('includes error message and stack if error is present', () => {
        const err = new Error('DB connection failed');
        err.stack = 'Error: DB connection failed\n    at connect (db.ts:10:1)';

        const formatter = new TextFormatter(false, false);
        const output = formatter.format({
            level: LogLevel.ERROR,
            message: 'Failed to connect',
            error: err,
            timestamp
        });

        expect(output).toBe(
            `[ERROR] Failed to connect\nError: DB connection failed\nError: DB connection failed\n    at connect (db.ts:10:1)`
        );
    });

    it('handles missing context, tags, and error gracefully', () => {
        const formatter = new TextFormatter(false, false);
        const output = formatter.format({
            level: LogLevel.FATAL,
            message: 'No extras',
            timestamp
        });

        expect(output).toBe(`[FATAL] No extras`);
    });

    it('applies correct colors for each log level', () => {
        const formatter = new TextFormatter(false, true);
        const testCases = [
            { level: LogLevel.TRACE, color: TextFormatter.Colors.BLUE },
            { level: LogLevel.DEBUG, color: TextFormatter.Colors.MAGENTA },
            { level: LogLevel.INFO,  color: TextFormatter.Colors.BLUE },
            { level: LogLevel.WARN,  color: TextFormatter.Colors.ORANGE },
            { level: LogLevel.ERROR, color: TextFormatter.Colors.RED_BG },
            { level: LogLevel.FATAL, color: TextFormatter.Colors.RED_BG },
        ];

        for (const { level, color } of testCases) {
            const output = formatter.format({
                level,
                message: 'test',
                timestamp
            });
            expect(output).toContain(`${color} [${LogLevel[level]}] \x1b[0m`);
        }
    });

    it('does not crash if context is null or undefined', () => {
        const formatter = new TextFormatter(false, false);
        const output1 = formatter.format({
            level: LogLevel.INFO,
            message: 'null context',
            context: null as any,
            timestamp
        });
        const output2 = formatter.format({
            level: LogLevel.INFO,
            message: 'undefined context',
            context: undefined,
            timestamp
        });

        expect(output1).toBe(`[INFO] null context`);
        expect(output2).toBe(`[INFO] undefined context`);
    });

    it('does not include context if it is empty object', () => {
        const formatter = new TextFormatter(false, false);
        const output = formatter.format({
            level: LogLevel.INFO,
            message: 'empty context',
            context: {},
            timestamp
        });

        expect(output).toBe(`[INFO] empty context`);
    });
});

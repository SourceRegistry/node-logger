// tests/formatters/SyslogFormatter.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SyslogFormatter, LogLevel } from '../../src';

// Mock process if needed
const originalPid = process.pid;
const originalHostname = process.env.HOSTNAME;

describe('SyslogFormatter (RFC 5424)', () => {
    beforeEach(() => {
        // Ensure consistent PID and hostname
        Object.defineProperty(process, 'pid', { value: 12345 });
        process.env.HOSTNAME = 'test-host';
    });

    afterEach(() => {
        Object.defineProperty(process, 'pid', { value: originalPid });
        if (originalHostname !== undefined) {
            process.env.HOSTNAME = originalHostname;
        } else {
            delete process.env.HOSTNAME;
        }
    });

    it('formats basic RFC 5424 syslog message', () => {
        const formatter = new SyslogFormatter();
        const output = formatter.format({
            level: LogLevel.INFO,
            message: 'App started',
            timestamp: new Date('2025-10-18T12:00:00.123Z')
        });

        // facility=16, severity=6 → PRI=134
        expect(output).toBe(
            '<134>1 2025-10-18T12:00:00.123Z test-host NodeLogger 12345 - - App started'
        );
    });

    it('includes structured data when tags or context are present', () => {
        const formatter = new SyslogFormatter();
        const output = formatter.format({
            level: LogLevel.WARN,
            message: 'User action',
            tags: ['auth', 'v2'],
            context: { userId: 123, ip: '192.168.1.1' },
            timestamp: new Date('2025-10-18T12:00:00.000Z')
        });

        expect(output).toBe(
            '<132>1 2025-10-18T12:00:00.000Z test-host NodeLogger 12345 - [logger@12345 tags="auth,v2" userId="123" ip="192.168.1.1"] User action'
        );
    });

    it('escapes special characters in structured data', () => {
        const formatter = new SyslogFormatter();
        const output = formatter.format({
            level: LogLevel.INFO,
            message: 'Escape test',
            context: { path: '/api/v1"test\\end]' }, // literal: /api/v1"test\end]
            timestamp: new Date('2025-10-18T12:00:00.000Z')
        });
        // Expect: \" for quote, \\ for backslash, \] for bracket
        expect(output).toContain('path="/api/v1\\"test\\\\end\\]"');
    });

    it('includes error in message', () => {
        const err = new Error('DB timeout');
        err.stack = 'Error: DB timeout\n    at connect (db.ts:10:1)';

        const formatter = new SyslogFormatter();
        const output = formatter.format({
            level: LogLevel.ERROR,
            message: 'Failed to connect',
            error: err,
            timestamp: new Date('2025-10-18T12:00:00.000Z')
        });

        expect(output).toContain('Failed to connect Error: DB timeout');
        expect(output).toContain('at connect (db.ts:10:1)');
    });

    it('handles missing message gracefully', () => {
        const formatter = new SyslogFormatter();
        const output = formatter.format({
            level: LogLevel.INFO,
            message: '',
            timestamp: new Date('2025-10-18T12:00:00.000Z')
        });

        expect(output.endsWith(' ')).toBe(false); // no trailing space
    });

    it('uses custom facility, hostname, appName, procid, msgid', () => {
        const formatter = new SyslogFormatter(
            1,               // facility = user-level
            'custom-host',
            'MyApp',
            999,
            'START'
        );

        const output = formatter.format({
            level: LogLevel.INFO,
            message: 'Custom',
            timestamp: new Date('2025-10-18T12:00:00.000Z')
        });

        // PRI = 1*8 + 6 = 14
        expect(output).toBe(
            '<14>1 2025-10-18T12:00:00.000Z custom-host MyApp 999 START - Custom'
        );
    });

    it('maps all log levels to correct syslog severity', () => {
        const cases = [
            { level: LogLevel.TRACE, pri: 16 * 8 + 7 }, // 135
            { level: LogLevel.DEBUG, pri: 135 },
            { level: LogLevel.INFO,  pri: 134 },
            { level: LogLevel.WARN,  pri: 132 },
            { level: LogLevel.ERROR, pri: 131 },
            { level: LogLevel.FATAL, pri: 130 },
        ];

        const formatter = new SyslogFormatter();
        for (const { level, pri } of cases) {
            const output = formatter.format({
                level,
                message: 'test',
                timestamp: new Date('2025-10-18T12:00:00.000Z')
            });
            expect(output.startsWith(`<${pri}>`)).toBe(true);
        }
    });
});

import { LogEntry, Formatter, LogLevel } from "../types";

export class SyslogFormatter implements Formatter {
    constructor(
        private facility = 16, // local0
        private hostname = typeof process !== 'undefined' ? (process.env.HOSTNAME || 'localhost') : 'localhost',
        private appName = 'NodeLogger',
        private procid: string | number = typeof process !== 'undefined' ? process.pid : '-',
        private msgid = '-'
    ) {}

    format(entry: LogEntry): string {
        const severity = this.mapLevelToSyslogSeverity(entry.level);
        const pri = this.facility * 8 + severity;

        // ISO 8601 timestamp with milliseconds and 'Z' for UTC
        const timestamp = entry.timestamp.toISOString();

        // Build structured data (SD) if context or tags exist
        let structuredData = '-';
        if (entry.context || entry.tags) {
            const sdParams: string[] = [];
            if (entry.tags && entry.tags.length > 0) {
                sdParams.push(`tags="${this.escape(entry.tags.join(','))}"`);
            }
            if (entry.context) {
                for (const [key, value] of Object.entries(entry.context)) {
                    // Only include primitive values
                    if (value != null && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')) {
                        sdParams.push(`${this.escape(key)}="${this.escape(String(value))}"`);
                    }
                }
            }
            if (sdParams.length > 0) {
                structuredData = `[logger@12345 ${sdParams.join(' ')}]`;
            }
        }

        // Build message: base message + error if present
        let msg = entry.message || '';
        if (entry.error) {
            const errStr = entry.error.stack || entry.error.message || String(entry.error);
            msg = msg ? `${msg} ${errStr}` : errStr;
        }

        const base = `<${pri}>1 ${timestamp} ${this.hostname} ${this.appName} ${this.procid} ${this.msgid} ${structuredData}`;
        return msg ? `${base} ${msg}` : base;
    }

    private mapLevelToSyslogSeverity(level: LogLevel): number {
        switch (level) {
            case LogLevel.TRACE:
            case LogLevel.DEBUG: return 7; // debug
            case LogLevel.INFO:  return 6; // info
            case LogLevel.WARN:  return 4; // warning
            case LogLevel.ERROR: return 3; // error
            case LogLevel.FATAL: return 2; // critical
            default: return 6;
        }
    }

    private escape(value: string): string {
        return String(value)
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/]/g, '\\]');
    }
}

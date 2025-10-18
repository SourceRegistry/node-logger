import { LogEntry, Formatter, LogLevel } from "../types";

export class CEFFormatter implements Formatter {
    constructor(
        private vendor = 'SourceRegistry',
        private product = 'NodeLogger',
        private version = '1.0'
    ) {}

    format(entry: LogEntry): string {
        const severity = this.mapLevelToSeverity(entry.level);
        // CEF:Version|Device Vendor|Device Product|Device Version|Signature ID|Name|Severity|Extension
        const header = `CEF:0|${this.vendor}|${this.product}|${this.version}|${LogLevel[entry.level]}|${entry.message}|${severity}|`;

        const extensions: string[] = [
            `rt=${entry.timestamp.getTime()}`
        ];

        if (entry.context) {
            for (const [key, value] of Object.entries(entry.context)) {
                extensions.push(`${key}=${String(value)}`);
            }
        }

        // For 100% compatibility with your current usage, we won't escape yet
        // (you can add escaping later if needed for production SIEM)
        return header + extensions.join(' ');
    }

    private mapLevelToSeverity(level: LogLevel): number {
        switch (level) {
            case LogLevel.TRACE: return 1;
            case LogLevel.DEBUG: return 2;
            case LogLevel.INFO:  return 3;
            case LogLevel.WARN:  return 6;
            case LogLevel.ERROR: return 8;
            case LogLevel.FATAL: return 10;
            default: return 0;
        }
    }
}

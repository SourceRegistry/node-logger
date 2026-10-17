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
        const header = `CEF:0|${this.escapeHeader(this.vendor)}|${this.escapeHeader(this.product)}|${this.escapeHeader(this.version)}|${LogLevel[entry.level]}|${this.escapeHeader(entry.message)}|${severity}|`;

        const extensions: string[] = [
            `rt=${entry.timestamp.getTime()}`
        ];

        if (entry.context) {
            for (const [key, value] of Object.entries(entry.context)) {
                const safeKey = key.replace(/[^a-zA-Z0-9_]/g, '_');
                if (safeKey) extensions.push(`${safeKey}=${this.escapeExtension(String(value))}`);
            }
        }

        return header + extensions.join(' ');
    }

    private escapeHeader(value: string): string {
        return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r/g, '\\r').replace(/\n/g, '\\n');
    }

    private escapeExtension(value: string): string {
        return value.replace(/\\/g, '\\\\').replace(/=/g, '\\=').replace(/\r/g, '\\r').replace(/\n/g, '\\n');
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

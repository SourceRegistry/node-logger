import {LogEntry, Formatter, LogLevel} from "../types";

export class CEFFormatter implements Formatter {
    constructor(
        private vendor = 'Logger',
        private product = 'NodeLogger',
        private version = '1.0'
    ) {}

    format(entry: LogEntry): string {
        const severity = this.mapLevelToSeverity(entry.level);
        const header = `CEF:0|${this.vendor}|${this.product}|${this.version}|${entry.level}|${LogLevel[entry.level]}|${severity}|`;

        const extensions: string[] = [
            `rt=${entry.timestamp.getTime()}`,
            `msg=${entry.message}`
        ];

        if (entry.context) {
            Object.entries(entry.context).forEach(([key, value]) => {
                extensions.push(`${key}=${value}`);
            });
        }

        return header + extensions.join(' ');
    }

    private mapLevelToSeverity(level: LogLevel): number {
        const map = {
            [LogLevel.TRACE]: 1,
            [LogLevel.DEBUG]: 2,
            [LogLevel.INFO]: 3,
            [LogLevel.WARN]: 6,
            [LogLevel.ERROR]: 8,
            [LogLevel.FATAL]: 10
        };
        return map[level] || 0;
    }
}

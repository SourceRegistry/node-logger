import {LogEntry, Formatter, LogLevel} from "../types";

export class SyslogFormatter implements Formatter {
    constructor(
        private facility = 16, // local use 0
        private hostname = process.env.HOSTNAME || 'localhost',
        private appName = 'logger'
    ) {}

    format(entry: LogEntry): string {
        const severity = this.mapLevelToSyslogSeverity(entry.level);
        const priority = this.facility * 8 + severity;

        const timestamp = entry.timestamp.toLocaleDateString('en-US', {
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        return `<${priority}>${timestamp} ${this.hostname} ${this.appName}: ${entry.message}`;
    }

    private mapLevelToSyslogSeverity(level: LogLevel): number {
        const map = {
            [LogLevel.TRACE]: 7, // debug
            [LogLevel.DEBUG]: 7, // debug
            [LogLevel.INFO]: 6,  // info
            [LogLevel.WARN]: 4,  // warning
            [LogLevel.ERROR]: 3, // error
            [LogLevel.FATAL]: 2  // critical
        };
        return map[level] || 6;
    }
}

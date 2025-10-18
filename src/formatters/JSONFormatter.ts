import {LogEntry, Formatter, LogLevel} from "../types";

export class JSONFormatter implements Formatter {
    format(entry: LogEntry): string {
        return JSON.stringify({
            timestamp: entry.timestamp.toISOString(),
            level: LogLevel[entry.level],
            message: entry.message,
            context: entry.context,
            ...(entry.error && {
                error: ({
                    name: entry.error.name,
                    message: entry.error.message,
                    stack: entry.error.stack
                })
            })
        });
    }
}

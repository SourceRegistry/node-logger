import {LogEntry, Formatter, LogLevel} from "../types";
import {safeStringify} from './safeStringify';

export class JSONFormatter implements Formatter {
    format(entry: LogEntry): string {
        return safeStringify({
            timestamp: entry.timestamp.toISOString(),
            level: LogLevel[entry.level],
            message: entry.message,
            context: entry.context,
            tags: entry.tags,
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

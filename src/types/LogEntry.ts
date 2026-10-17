import {LogLevel} from "./LogLevel";

export interface LogEntry {
    level: LogLevel;
    message: string;
    timestamp: Date;
    context?: Record<string, unknown>;
    error?: Error;
    tags?: string[];
}

import {LogLevel} from "./LogLevel";

export interface LogEntry {
    level: LogLevel;
    message: string;
    timestamp: Date;
    context?: Record<string, any>;
    error?: Error;
    tags?: string[];
}

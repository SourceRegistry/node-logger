import {LogLevel} from "./LogLevel";

export interface AutoFlushConfig {
    enabled: boolean;
    interval?: number;        // Auto-flush interval in ms
    onSize?: number;         // Auto-flush when buffer/queue reaches this size
    onLevel?: LogLevel;      // Auto-flush immediately for logs at or above this level
    onIdle?: number;         // Auto-flush after this many ms of inactivity
}

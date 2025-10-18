import {LogLevel,AutoFlushConfig} from "./types";

export const DEFAULT_AUTO_FLUSH: AutoFlushConfig = {
    enabled: true,
    interval: 5000,          // 5 seconds
    onSize: 100,            // 100 log entries
    onLevel: LogLevel.ERROR, // Immediate flush for ERROR and FATAL
    onIdle: 10000           // 10 seconds of inactivity
};

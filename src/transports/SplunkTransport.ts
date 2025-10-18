import {HTTPTransport} from "./HTTPTransport";
import {LogEntry, Formatter, LogLevel} from "../types";

export class SplunkTransport extends HTTPTransport {
    constructor(config: {
        endpoint: string;
        token: string;
        index?: string;
        sourcetype?: string;
        source?: string;
        batchSize?: number;
        flushInterval?: number;
        minLevel?: LogLevel;
    }) {
        super({
            endpoint: config.endpoint,
            headers: {
                'Authorization': `Splunk ${config.token}`,
                'Content-Type': 'application/json'
            },
            formatter: new class implements Formatter {
                format(entry: LogEntry): string {
                    return JSON.stringify({
                        event: {
                            timestamp: entry.timestamp.toISOString(),
                            level: LogLevel[entry.level],
                            message: entry.message,
                            ...entry.context
                        },
                        index: config.index || 'main',
                        sourcetype: config.sourcetype || '_json',
                        source: config.source || 'nodejs-logger'
                    });
                }
            },
            batchSize: config.batchSize,
            flushInterval: config.flushInterval,
            minLevel: config.minLevel
        });
    }
}

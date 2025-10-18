import {HTTPTransport} from "./HTTPTransport";
import {LogEntry,Formatter, LogLevel} from "../types";

export class ElasticsearchTransport extends HTTPTransport {
    constructor(config: {
        endpoint: string; // Should end with /_bulk
        apiKey?: string;
        index?: string;
        batchSize?: number;
        flushInterval?: number;
        minLevel?: LogLevel;
    }) {
        super({
            endpoint: config.endpoint,
            headers: {
                'Content-Type': 'application/x-ndjson',
                ...(config.apiKey && { 'Authorization': `Bearer ${config.apiKey}` })
            },
            formatter: new class implements Formatter {
                format(entry: LogEntry): string {
                    const indexLine = JSON.stringify({
                        index: {
                            _index: config.index || 'logs',
                            _type: '_doc'
                        }
                    });
                    const docLine = JSON.stringify({
                        '@timestamp': entry.timestamp.toISOString(),
                        level: LogLevel[entry.level],
                        message: entry.message,
                        ...entry.context
                    });
                    return indexLine + '\n' + docLine;
                }
            },
            batchSize: config.batchSize,
            flushInterval: config.flushInterval,
            minLevel: config.minLevel
        });
    }
}

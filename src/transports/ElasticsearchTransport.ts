import {HTTPTransport, HTTPDeliveryError} from "./HTTPTransport";
import {LogEntry,Formatter, LogLevel} from "../types";

export class ElasticsearchTransport extends HTTPTransport {
    constructor(config: {
        endpoint: string; // Should end with /_bulk
        apiKey?: string;
        index?: string;
        batchSize?: number;
        flushInterval?: number;
        minLevel?: LogLevel;
        maxRetries?: number;
        retryDelay?: number;
        requestTimeout?: number;
        maxQueueSize?: number;
    }) {
        super({
            endpoint: config.endpoint,
            headers: {
                'Content-Type': 'application/x-ndjson',
                ...(config.apiKey && { 'Authorization': `ApiKey ${config.apiKey}` })
            },
            formatter: new class implements Formatter {
                format(entry: LogEntry): string {
                    const indexLine = JSON.stringify({
                        index: {
                            _index: config.index || 'logs'
                        }
                    });
                    const docLine = JSON.stringify({
                        ...entry.context,
                        '@timestamp': entry.timestamp.toISOString(),
                        level: LogLevel[entry.level],
                        message: entry.message,
                        ...(entry.tags && {tags: entry.tags}),
                        ...(entry.error && {error: {name: entry.error.name, message: entry.error.message, stack: entry.error.stack}})
                    });
                    return indexLine + '\n' + docLine;
                }
            },
            batchSize: config.batchSize,
            flushInterval: config.flushInterval,
            minLevel: config.minLevel,
            maxRetries: config.maxRetries,
            retryDelay: config.retryDelay,
            requestTimeout: config.requestTimeout,
            maxQueueSize: config.maxQueueSize,
        });
    }

    protected override serializeBatch(batch: LogEntry[]): string {
        return batch.map(entry => this.config.formatter.format(entry)).join('\n') + '\n';
    }

    protected override async validateResponse(response: Response): Promise<void> {
        await super.validateResponse(response);
        let result: {errors?: boolean};
        try {
            result = await response.json() as {errors?: boolean};
        } catch {
            throw new HTTPDeliveryError('Elasticsearch bulk response is not valid JSON', false);
        }
        if (typeof result.errors !== 'boolean') throw new HTTPDeliveryError('Elasticsearch bulk response lacks an errors flag', false);
        if (result.errors) throw new HTTPDeliveryError('Elasticsearch bulk response contains item errors', false);
    }
}

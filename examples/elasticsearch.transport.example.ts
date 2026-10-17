import {ElasticsearchTransport, Logger, LogLevel} from '../src';

const endpoint = process.env.ELASTIC_ENDPOINT;
if (!endpoint) throw new Error('Set ELASTIC_ENDPOINT to your Elasticsearch /_bulk URL');

const logger = new Logger(LogLevel.INFO, [
  new ElasticsearchTransport({
    endpoint,
    index: 'application-logs',
    apiKey: process.env.ELASTIC_API_KEY,
  }),
]);

logger.info('Document indexed', {documentId: 'doc_123'});
await logger.close();

import {HTTPTransport, Logger, LogLevel} from '../src';

const endpoint = process.env.LOG_ENDPOINT;
if (!endpoint) throw new Error('Set LOG_ENDPOINT to your HTTP log ingestion URL');

const logger = new Logger(LogLevel.INFO, [
  new HTTPTransport({
    endpoint,
    headers: process.env.LOG_TOKEN ? {Authorization: 'Bearer ' + process.env.LOG_TOKEN} : {},
    batchSize: 50,
    maxQueueSize: 10_000,
    requestTimeout: 10_000,
  }),
]);

logger.info('Job finished', {jobId: 'job_123'});
await logger.close();

import {FileTransport, JSONFormatter, Logger, LogLevel} from '../src';

const logger = new Logger(LogLevel.INFO, [
  new FileTransport('./logs/app.jsonl', new JSONFormatter()),
]);

logger.info('Payment received', {paymentId: 'pay_123'});
await logger.close();

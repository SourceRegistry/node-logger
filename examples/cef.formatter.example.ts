import {CEFFormatter, ConsoleTransport, Logger, LogLevel} from '../src';

const logger = new Logger(LogLevel.INFO, [
  new ConsoleTransport(new CEFFormatter('Acme', 'API', '1.0')),
]);
logger.warn('Access denied', {requestId: 'req_123'});
await logger.close();

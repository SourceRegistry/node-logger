import {ConsoleTransport, Logger, LogLevel, SyslogFormatter} from '../src';

const logger = new Logger(LogLevel.INFO, [
  new ConsoleTransport(new SyslogFormatter(16, 'api-1', 'orders-service')),
]);
logger.error('Dependency unavailable', {service: 'database'});
await logger.close();

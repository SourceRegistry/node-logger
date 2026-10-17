import {ConsoleTransport, Logger, LogLevel, TextFormatter} from '../src';

const logger = new Logger(LogLevel.INFO, [
  new ConsoleTransport(new TextFormatter(true, false)),
]);
logger.info('Listening', {port: 3000});
await logger.close();

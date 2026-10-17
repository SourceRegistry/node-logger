import {ConsoleTransport, JSONFormatter, Logger, LogLevel} from '../src';

const logger = new Logger(LogLevel.INFO, [new ConsoleTransport(new JSONFormatter())]);
logger.info('User signed in', {userId: 'user_123'});
await logger.close();

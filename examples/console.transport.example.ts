import {Console, LogLevel} from '../src';

const logger = Console(LogLevel.INFO);
logger.info('Server started', {port: 3000});
logger.withTags('api', 'orders').warn('Slow request', {durationMs: 850});
await logger.close();

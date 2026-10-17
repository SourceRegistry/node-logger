import {JSONFormatter, Logger, LogLevel, SmartFileTransport} from '../src';

const logger = new Logger(LogLevel.INFO, [
  new SmartFileTransport('./logs/smart.jsonl', new JSONFormatter(), LogLevel.INFO, {
    enabled: true,
    interval: 5_000,
    onSize: 50,
    onLevel: LogLevel.ERROR,
    onIdle: 10_000,
  }),
]);

logger.error('Database unavailable');
await logger.close();

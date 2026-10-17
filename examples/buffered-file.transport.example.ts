import {BufferedFileTransport, JSONFormatter, Logger, LogLevel} from '../src';

const logger = new Logger(LogLevel.INFO, [
  new BufferedFileTransport('./logs/events.jsonl', new JSONFormatter(), LogLevel.INFO, 100, 1_000),
]);

logger.info('Event processed', {eventId: 'evt_123'});
await logger.close();

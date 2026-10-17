import {fileURLToPath} from 'node:url';
import {Logger, LogLevel, WorkerTransport} from '../src';

const workerScript = fileURLToPath(new URL('./logger-worker.mjs', import.meta.url));
const logger = new Logger(LogLevel.INFO, [new WorkerTransport(workerScript)]);

logger.info('Background task started', {taskId: 'task_123'});

// This transport does not acknowledge messages; stop it when the application exits.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { void logger.close().catch(console.error); });
}

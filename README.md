<div align="center">
  <a href="https://github.com/SourceRegistry"><img src="https://avatars.githubusercontent.com/u/118937887?s=240&amp;v=4" width="112" height="112" alt="SourceRegistry logo"></a>

  <h1>@sourceregistry/node-logger</h1>
  <p>Structured logging for Node.js applications, with flexible transports and formatters.</p>

  <p>
    <a href="https://www.npmjs.com/package/@sourceregistry/node-logger"><img src="https://img.shields.io/npm/v/%40sourceregistry%2Fnode-logger" alt="npm version"></a>
    <a href="https://www.npmjs.com/package/@sourceregistry/node-logger"><img src="https://img.shields.io/npm/dm/%40sourceregistry%2Fnode-logger" alt="monthly npm downloads"></a>
    <a href="https://github.com/SourceRegistry/node-logger/actions/workflows/ci.yml"><img src="https://github.com/SourceRegistry/node-logger/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI status"></a>
    <a href="https://github.com/SourceRegistry/node-logger/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/%40sourceregistry%2Fnode-logger" alt="license"></a>
  </p>
  <p><a href="https://sourceregistry.github.io/node-logger/">API documentation</a> | <a href="https://github.com/SourceRegistry/node-logger/issues">Report an issue</a></p>
</div>

## Install

Requires Node.js 22 or newer. Works with ESM, CommonJS, and TypeScript.

```sh
npm install @sourceregistry/node-logger
```

## Quick start

```ts
import {Console, LogLevel} from '@sourceregistry/node-logger';

const logger = Console(LogLevel.INFO);
logger.info('Server started', {port: 3000});
logger.withTags('api', 'orders').warn('Slow request', {durationMs: 850});
logger.error('Request failed', {requestId: 'abc'}, new Error('timeout'));
await logger.close();
```

The available levels are `TRACE`, `DEBUG`, `INFO`, `WARN`, `ERROR`, and `FATAL`. Each logging method returns immediately. Call `await logger.flush()` when you need queued writes to finish, and `await logger.close()` during shutdown. Transport failures surface from these calls as an `AggregateError`.

For commands and required environment variables, see the [runnable examples](https://github.com/SourceRegistry/node-logger/blob/main/examples/README.md).

## Transports

Choose a transport for each destination. You can combine several in one logger:

| Transport | Runnable example |
| --- | --- |
| Console | [Console](https://github.com/SourceRegistry/node-logger/blob/main/examples/console.transport.example.ts) |
| File | [File](https://github.com/SourceRegistry/node-logger/blob/main/examples/file.transport.example.ts) |
| Buffered file | [Buffered file](https://github.com/SourceRegistry/node-logger/blob/main/examples/buffered-file.transport.example.ts) |
| Smart file | [Smart file](https://github.com/SourceRegistry/node-logger/blob/main/examples/smart-file.transport.example.ts) |
| HTTP | [HTTP](https://github.com/SourceRegistry/node-logger/blob/main/examples/http.transport.example.ts) |
| Elasticsearch | [Elasticsearch](https://github.com/SourceRegistry/node-logger/blob/main/examples/elasticsearch.transport.example.ts) |
| Worker | [Worker](https://github.com/SourceRegistry/node-logger/blob/main/examples/worker.transport.example.ts) |

```ts
import {ConsoleTransport, FileTransport, JSONFormatter, Logger, LogLevel} from '@sourceregistry/node-logger';

const logger = new Logger(LogLevel.INFO, [
  new ConsoleTransport(),
  new FileTransport('./logs/app.jsonl', new JSONFormatter()),
]);
logger.info('Order accepted', {orderId: '123'});
await logger.close();
```

### Console

`Console()` is a shortcut for a text formatted console logger. To choose a formatter, create the transport directly:

```ts
import {ConsoleTransport, JSONFormatter, Logger, LogLevel} from '@sourceregistry/node-logger';

const logger = new Logger(LogLevel.INFO, [new ConsoleTransport(new JSONFormatter())]);
logger.info('Ready', {port: 3000});
await logger.close();
```

### File

`File()` writes human readable logs to the console and JSON Lines to a file:

```ts
import {File, LogLevel} from '@sourceregistry/node-logger';

const logger = File('./logs/app.jsonl', LogLevel.INFO);
logger.info('Payment received', {paymentId: 'pay_123'});
await logger.close();
```

Use `FileTransport` directly when you only want file output, as in the combined example above.

### Buffered file

Buffer entries until the batch reaches 100 entries or one second passes:

```ts
import {BufferedFileTransport, JSONFormatter, Logger, LogLevel} from '@sourceregistry/node-logger';

const logger = new Logger(LogLevel.INFO, [
  new BufferedFileTransport('./logs/events.jsonl', new JSONFormatter(), LogLevel.INFO, 100, 1_000),
]);
logger.info('Event processed', {eventId: 'evt_123'});
await logger.close();
```

### Smart file

Flush by interval, batch size, severity, or idle time:

```ts
import {JSONFormatter, Logger, LogLevel, SmartFileTransport} from '@sourceregistry/node-logger';

const logger = new Logger(LogLevel.INFO, [
  new SmartFileTransport('./logs/app.jsonl', new JSONFormatter(), LogLevel.INFO, {
    enabled: true,
    interval: 5_000,
    onSize: 50,
    onLevel: LogLevel.ERROR,
    onIdle: 10_000,
  }),
]);
logger.error('Database unavailable');
await logger.close();
```

Buffered file transports keep a bounded in-memory queue. `close()` flushes remaining entries. A completed stream write does not guarantee durability after a power loss; `FileTransport.flush()` requests `fsync` where a file descriptor is available.

### HTTP

Send batches to an HTTP endpoint:

```ts
import {HTTPTransport, Logger, LogLevel} from '@sourceregistry/node-logger';

const logger = new Logger(LogLevel.INFO, [
  new HTTPTransport({
    endpoint: 'https://logs.example.com/ingest',
    headers: {Authorization: `Bearer ${process.env.LOG_TOKEN}`},
    batchSize: 50,
    maxQueueSize: 10_000,
    requestTimeout: 10_000,
  }),
]);
logger.info('Job finished', {jobId: 'job_123'});
await logger.close();
```

The endpoint receives a JSON array of formatted strings. The transport retries network failures, HTTP 408/429, and HTTP 5xx responses. A failed batch is reported by `flush()` or `close()` and is not automatically requeued because delivery may have succeeded before the connection failed.

Set `LOG_TOKEN` in the application environment before running this example.

### Elasticsearch

Send bulk NDJSON to an Elasticsearch `/_bulk` endpoint:

```ts
import {ElasticsearchTransport, Logger, LogLevel} from '@sourceregistry/node-logger';

const logger = new Logger(LogLevel.INFO, [
  new ElasticsearchTransport({
    endpoint: 'https://es.example.com/_bulk',
    index: 'application-logs',
    apiKey: process.env.ELASTIC_API_KEY,
  }),
]);
logger.info('Document indexed', {documentId: 'doc_123'});
await logger.close();
```

The transport checks the bulk response for item errors and reports them on `flush()` or `close()`.

Set `ELASTIC_API_KEY` if your cluster requires API key authentication.

### Worker

Save this worker as `logger-worker.mjs`:

```js
import {parentPort} from 'node:worker_threads';

parentPort.on('message', message => {
  if (message.type === 'log') process.stdout.write(`${message.data}\n`);
});
```

Then connect it to the logger:

```ts
import {resolve} from 'node:path';
import {Logger, LogLevel, WorkerTransport} from '@sourceregistry/node-logger';

const logger = new Logger(LogLevel.INFO, [
  new WorkerTransport(resolve('logger-worker.mjs')),
]);
logger.info('Background task started', {taskId: 'task_123'});
process.once('SIGINT', () => { void logger.close().catch(console.error); });
```

The worker keeps this example running until Ctrl+C. Worker delivery is best effort: messages already posted to a worker are not acknowledged, and `close()` terminates the worker. Use a file or HTTP transport when confirmed delivery at shutdown matters.

## Formatters

Pass a formatter to a transport to control its output. These examples write to the console; the same formatters work with file, HTTP, and worker transports.

| Formatter | Runnable example |
| --- | --- |
| JSON | [JSON](https://github.com/SourceRegistry/node-logger/blob/main/examples/json.formatter.example.ts) |
| Text | [Text](https://github.com/SourceRegistry/node-logger/blob/main/examples/text.formatter.example.ts) |
| CEF | [CEF](https://github.com/SourceRegistry/node-logger/blob/main/examples/cef.formatter.example.ts) |
| Syslog | [Syslog](https://github.com/SourceRegistry/node-logger/blob/main/examples/syslog.formatter.example.ts) |

### JSON

```ts
import {ConsoleTransport, JSONFormatter, Logger, LogLevel} from '@sourceregistry/node-logger';

const logger = new Logger(LogLevel.INFO, [new ConsoleTransport(new JSONFormatter())]);
logger.info('User signed in', {userId: 'user_123'});
await logger.close();
```

`JSONFormatter` includes timestamps, levels, context, tags, and errors. It converts `bigint` values to strings and replaces circular references with `[Circular]`.

### Text

```ts
import {ConsoleTransport, Logger, LogLevel, TextFormatter} from '@sourceregistry/node-logger';

const logger = new Logger(LogLevel.INFO, [
  new ConsoleTransport(new TextFormatter(true, false)), // timestamp, no ANSI colors
]);
logger.info('Listening', {port: 3000});
await logger.close();
```

### CEF

```ts
import {CEFFormatter, ConsoleTransport, Logger, LogLevel} from '@sourceregistry/node-logger';

const logger = new Logger(LogLevel.INFO, [
  new ConsoleTransport(new CEFFormatter('Acme', 'API', '1.0')),
]);
logger.warn('Access denied', {requestId: 'req_123'});
await logger.close();
```

### Syslog

```ts
import {ConsoleTransport, Logger, LogLevel, SyslogFormatter} from '@sourceregistry/node-logger';

const logger = new Logger(LogLevel.INFO, [
  new ConsoleTransport(new SyslogFormatter(16, 'api-1', 'orders-service')),
]);
logger.error('Dependency unavailable', {service: 'database'});
await logger.close();
```

`SyslogFormatter` produces RFC 5424 style records. Your log collector still needs a transport that sends records to it.

## Shutdown and errors

```ts
process.once('SIGTERM', () => {
  void logger.close().then(
    () => process.exit(0),
    error => {
      console.error('Log delivery failed during shutdown:', error);
      process.exit(1);
    },
  );
});
```

`close()` is safe to call more than once. Logging after it starts throws. The logger continues sending an entry to other transports if one fails; errors are reported when you flush or close it. Context is not redacted automatically, so remove secrets and personal data before logging.

For custom destinations, implement [`Transport`](https://sourceregistry.github.io/node-logger/interfaces/Transport.html) with `write(entry)` and optionally `flush()` and `close()`.

## License

Apache-2.0. SourceRegistry logo from the [SourceRegistry organization](https://github.com/SourceRegistry), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

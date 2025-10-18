# 🧠 @sourceregistry/node-logger – Advanced Logging Framework [WORK IN PROGRESS]

A powerful, pluggable TypeScript logger for Node.js applications.  
Supports JSON, text, CEF, and Syslog formatting, multiple transport targets (console, file, HTTP, Splunk, Elasticsearch), and auto-flush strategies for production-grade logging.

---

## 🚀 Features

- **Log Levels:** `TRACE`, `DEBUG`, `INFO`, `WARN`, `ERROR`, `FATAL`
- **Formatters:**
  - `JSONFormatter` – machine-readable
  - `TextFormatter` – human-friendly
  - `CEFFormatter` – Common Event Format for SIEM
  - `SyslogFormatter` – Syslog-compatible format
- **Transports:**
  - `ConsoleTransport`
  - `FileTransport`, `BufferedFileTransport`, `SmartFileTransport`
  - `HTTPTransport`, `SplunkTransport`, `ElasticsearchTransport`
  - `WorkerTransport` – offload to worker thread
- **Auto-flushing:** Configurable by interval, size, severity, and idle timeout
- **Tagging & Contextual Logging**
- **Asynchronous-safe, fault-tolerant design**

---

## 📦 Installation

```bash
npm install @sourceregistry/node-logger
```

---

## 🛠 Usage

### Basic Logger

```ts
import { Console, LogLevel } from '@sourceregistry/node-logger';

const logger = Console(LogLevel.DEBUG);
logger.info('App started');
logger.debug('Debugging details');
```

### File Logger with JSON output

```ts
import { File } from '@sourceregistry/node-logger';

const fileLogger = File('./logs/app.log');
fileLogger.info('Writing to log file');
```

### Splunk Integration

```ts
import { Splunk } from '@sourceregistry/node-logger';

const splunkLogger = Splunk({
  endpoint: 'https://splunk.example.com:8088/services/collector/event',
  token: 'your-splunk-token',
  index: 'main'
});

splunkLogger.info('Logged to Splunk!');
```

### Elasticsearch Integration

```ts
import { Elasticsearch } from '@sourceregistry/node-logger';

const esLogger = Elasticsearch({
  endpoint: 'https://es.example.com/_bulk',
  apiKey: 'your-api-key',
  index: 'logs'
});

esLogger.error('Something went wrong!');
```

---

## 🧩 Advanced Features

### Smart File Logging

```ts
import { SmartFileTransport, Logger, LogLevel } from '@sourceregistry/node-logger';

const logger = new Logger(LogLevel.INFO, [
  new SmartFileTransport('./logs/smart.log', undefined, LogLevel.INFO, {
    enabled: true,
    interval: 5000,
    onSize: 50,
    onLevel: LogLevel.ERROR,
    onIdle: 10000
  })
]);


// DEMONSTRATION:
logger.info('This will be buffered');
logger.debug('This will also be buffered');
// ... After 5 seconds, both logs auto-flush to disk

logger.error('This flushes immediately!'); // Because onLevel: ERROR
logger.warn('This will auto-flush based on smart rules'); // Because onLevel: WARNING


```

### Tagged Logger

```ts
const taggedLogger = logger.withTags('auth', 'payment');
taggedLogger.info('User logged in');
```

---

## 🧼 Graceful Shutdown

```ts
process.on('SIGTERM', async () => {
  await logger.close();
  process.exit(0);
});
```
---

## 📜 License

Apache-2.0

---

## 🤝 Contributing

We welcome issues, feature requests, and pull requests!

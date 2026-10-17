# Runnable examples

Run these from the repository root after `npm ci`. They import the local source and use `tsx`:

```sh
npx tsx examples/console.transport.example.ts
```

## Transports

| Destination | Example | Setup |
| --- | --- | --- |
| Console | [console.transport.example.ts](console.transport.example.ts) | None |
| File | [file.transport.example.ts](file.transport.example.ts) | Writes to `./logs/app.jsonl` |
| Buffered file | [buffered-file.transport.example.ts](buffered-file.transport.example.ts) | Writes to `./logs/events.jsonl` |
| Smart file | [smart-file.transport.example.ts](smart-file.transport.example.ts) | Writes to `./logs/smart.jsonl` |
| HTTP | [http.transport.example.ts](http.transport.example.ts) | Set `LOG_ENDPOINT`; `LOG_TOKEN` is optional |
| Elasticsearch | [elasticsearch.transport.example.ts](elasticsearch.transport.example.ts) | Set `ELASTIC_ENDPOINT` to a `/_bulk` URL; `ELASTIC_API_KEY` is optional |
| Worker | [worker.transport.example.ts](worker.transport.example.ts) and [logger-worker.mjs](logger-worker.mjs) | Runs until Ctrl+C; delivery is best effort |

For example, after setting `LOG_ENDPOINT`, run `npx tsx examples/http.transport.example.ts`.

## Formatters

Each formatter example writes one entry to the console:

| Format | Example |
| --- | --- |
| JSON | [json.formatter.example.ts](json.formatter.example.ts) |
| Text | [text.formatter.example.ts](text.formatter.example.ts) |
| CEF | [cef.formatter.example.ts](cef.formatter.example.ts) |
| Syslog | [syslog.formatter.example.ts](syslog.formatter.example.ts) |

Run any of them with `npx tsx examples/<filename>.ts`.

import {LogEntry,Transport, Formatter, LogLevel} from "../types";
import {TextFormatter} from "../formatters";

export class ConsoleTransport implements Transport {
    constructor(
        private formatter: Formatter = new TextFormatter(),
        private minLevel: LogLevel = LogLevel.INFO
    ) {}

    write(entry: LogEntry): void {
        if (entry.level < this.minLevel) return;

        const formatted = this.formatter.format(entry);

        switch (entry.level) {
            case LogLevel.TRACE:
            case LogLevel.DEBUG:
            case LogLevel.INFO:
                console.info(formatted);
                break;
            case LogLevel.WARN:
                console.warn(formatted);
                break;
            case LogLevel.ERROR:
            case LogLevel.FATAL:
                console.error(formatted);
                break;
        }
    }
}

import {LogEntry,Transport, Formatter, LogLevel} from "../types";
import {TextFormatter} from "../formatters";

export class ConsoleTransport implements Transport {
    constructor(
        private formatter: Formatter = new TextFormatter(),
        private minLevel: LogLevel = LogLevel.INFO,
        private readonly binding: typeof console = console,
    ) {}

    write(entry: LogEntry): void {
        if (entry.level < this.minLevel) return;

        const formatted = this.formatter.format(entry);

        switch (entry.level) {
            case LogLevel.TRACE:
            case LogLevel.DEBUG:
            case LogLevel.INFO:
                (this.binding.log || this.binding.info)(formatted);
                break;
            case LogLevel.WARN:
                this.binding.warn(formatted);
                break;
            case LogLevel.ERROR:
            case LogLevel.FATAL:
                this.binding.error(formatted);
                break;
        }
    }
}

import {LogEntry} from "./LogEntry";

export interface Formatter {
    format(entry: LogEntry): string;
}

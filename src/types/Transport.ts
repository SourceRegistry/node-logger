import {LogEntry} from "./LogEntry";

export interface Transport {
    write(entry: LogEntry): Promise<void> | void;
    close?(): Promise<void> | void;
}

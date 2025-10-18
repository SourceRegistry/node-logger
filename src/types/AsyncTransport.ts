import {Transport} from "./Transport";
import {LogEntry} from "./LogEntry";

export interface AsyncTransport extends Transport {
    write(entry: LogEntry): Promise<void>;
}

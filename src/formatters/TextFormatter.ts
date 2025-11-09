import {LogEntry, Formatter, LogLevel} from "../types";

export class TextFormatter implements Formatter {
    constructor(private includeTimestamp = true, private colored: boolean = true) {
    }

    format(entry: LogEntry): string {
        const parts: string[] = [];

        if (this.includeTimestamp) {
            parts.push(`[${entry.timestamp.toISOString()}]`);
        }

        if (this.colored) parts.push(this.getLevelColor(entry.level));
        parts.push(`[${LogLevel[entry.level]}]`);
        if (this.colored) parts.push(TextFormatter.Colors.RESET);

        if (entry.tags?.length) {
            entry.tags.forEach(tag => parts.push(`[${tag}]`))
        }

        parts.push(entry.message);

        // Handle context
        if (entry.context && Object.keys(entry.context).length > 0) {
            parts.push(JSON.stringify(entry.context));
        }

        // Build the full output so far
        let result = parts.join(' ');

        // Append error without leading space
        if (entry.error) {
            result += `\nError: ${entry.error.message}\n${entry.error.stack}`;
        }

        return result;
    }

    private getLevelColor(level: LogLevel): string {
        switch (level) {
            case LogLevel.TRACE:
                return TextFormatter.Colors.BLUE;
            case LogLevel.DEBUG:
                return TextFormatter.Colors.MAGENTA;
            case LogLevel.INFO:
                return TextFormatter.Colors.BLUE;
            case LogLevel.WARN:
                return TextFormatter.Colors.ORANGE;
            case LogLevel.ERROR:
                return TextFormatter.Colors.RED_BG;
            case LogLevel.FATAL:
                return TextFormatter.Colors.RED_BG;
            default:
                return '';
        }
    }

    public static Colors = {
        // Reset
        RESET: '\x1b[0m',

        // Regular colors
        RED: '\x1b[31m',
        GREEN: '\x1b[92m',
        BLUE: '\x1b[34m',
        MAGENTA: '\x1b[35m',
        CYAN: '\x1b[36m',
        GRAY: '\x1b[90m',

        // Custom colors (RGB)
        ORANGE: '\x1b[38;2;253;182;0m',

        // Background colors
        RED_BG: '\x1b[41m'
    }
}

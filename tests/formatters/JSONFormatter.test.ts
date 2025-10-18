import {it, expect} from "vitest";
import {JSONFormatter, LogLevel} from '../../src';

it('formats log entry as valid JSON', () => {
    const formatter = new JSONFormatter();
    const output = formatter.format({
        level: LogLevel.INFO,
        message: 'test',
        timestamp: new Date('2025-10-18T10:00:00Z'),
        context: {user: 'alice'},
        tags: ['auth']
    });

    const parsed = JSON.parse(output);
    expect(parsed.message).toBe('test');
    expect(parsed.level).toBe('INFO');
    expect(parsed.context.user).toBe('alice');
});

it('formats log entry as valid JSON with Error', () => {
    const formatter = new JSONFormatter();

    const error = new Error("Test Error")
    error.stack = "STACK";

    const output = formatter.format({
        level: LogLevel.INFO,
        message: 'test',
        timestamp: new Date('2025-10-18T10:00:00Z'),
        context: {user: 'alice'},
        tags: ['auth'],
        error
    });

    const parsed = JSON.parse(output);
    expect(parsed.message).toBe('test');
    expect(parsed.level).toBe('INFO');
    expect(parsed.context.user).toBe('alice');
    expect(parsed.error.name).toBe("Error")
    expect(parsed.error.message).toBe("Test Error")
    expect(parsed.error.stack).toBe("STACK")
});

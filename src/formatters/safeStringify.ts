export function safeStringify(value: unknown): string {
    const seen = new WeakSet<object>();
    return JSON.stringify(value, (_key, item: unknown) => {
        if (typeof item === 'bigint') return item.toString();
        if (item instanceof Error) return {name: item.name, message: item.message, stack: item.stack};
        if (typeof item === 'object' && item !== null) {
            if (seen.has(item)) return '[Circular]';
            seen.add(item);
        }
        return item;
    });
}

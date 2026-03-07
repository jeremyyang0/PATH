import * as fs from 'fs';
import * as path from 'path';

export const ORDER_FILE_NAME = '.order';

export function readOrderEntries(directoryPath: string): string[] | undefined {
    const orderFilePath = path.join(directoryPath, ORDER_FILE_NAME);
    if (!fs.existsSync(orderFilePath)) {
        return undefined;
    }

    try {
        const rawContent = fs.readFileSync(orderFilePath, 'utf8');
        const parsed = JSON.parse(rawContent);
        if (!Array.isArray(parsed) || parsed.some(entry => typeof entry !== 'string')) {
            return undefined;
        }
        return parsed;
    } catch {
        return undefined;
    }
}

export function orderItemsByDirectoryFile<T>(
    directoryPath: string,
    items: T[],
    getName: (item: T) => string
): T[] {
    const orderEntries = readOrderEntries(directoryPath);
    if (!orderEntries || orderEntries.length === 0) {
        return items;
    }

    const remainingItems = new Map<string, T[]>();
    for (const item of items) {
        const name = getName(item);
        const bucket = remainingItems.get(name);
        if (bucket) {
            bucket.push(item);
        } else {
            remainingItems.set(name, [item]);
        }
    }

    const orderedItems: T[] = [];
    for (const entryName of orderEntries) {
        const matchedItems = remainingItems.get(entryName);
        if (!matchedItems || matchedItems.length === 0) {
            continue;
        }
        orderedItems.push(...matchedItems);
        remainingItems.delete(entryName);
    }

    for (const item of items) {
        const name = getName(item);
        const bucket = remainingItems.get(name);
        if (!bucket || bucket.length === 0) {
            continue;
        }

        const nextItem = bucket.shift();
        if (nextItem) {
            orderedItems.push(nextItem);
        }

        if (bucket.length === 0) {
            remainingItems.delete(name);
        }
    }

    return orderedItems;
}

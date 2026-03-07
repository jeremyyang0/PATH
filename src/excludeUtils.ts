import * as path from 'path';

type ExcludeSettingValue = boolean | { when?: string };

function normalizeSeparators(value: string): string {
    return value.replace(/\\/g, '/');
}

function escapeRegExp(value: string): string {
    return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function globToRegExp(pattern: string): RegExp {
    const normalizedPattern = normalizeSeparators(pattern);
    let expression = '^';

    for (let index = 0; index < normalizedPattern.length; index++) {
        const currentChar = normalizedPattern[index];
        const nextChar = normalizedPattern[index + 1];
        if (!currentChar) {
            continue;
        }

        if (currentChar === '*') {
            if (nextChar === '*') {
                expression += '.*';
                index++;
            } else {
                expression += '[^/]*';
            }
            continue;
        }

        if (currentChar === '?') {
            expression += '[^/]';
            continue;
        }

        expression += escapeRegExp(currentChar);
    }

    expression += '$';
    return new RegExp(expression);
}

export function createExcludeMatcher(
    workspaceRoot: string,
    excludeSettings: Record<string, ExcludeSettingValue> | undefined
): (fullPath: string, isDirectory: boolean) => boolean {
    if (!excludeSettings) {
        return () => false;
    }

    const activePatterns = Object.entries(excludeSettings)
        .filter(([, enabled]) => enabled === true)
        .map(([pattern]) => ({
            pattern,
            regex: globToRegExp(pattern)
        }));

    if (activePatterns.length === 0) {
        return () => false;
    }

    const resolvedRoot = path.resolve(workspaceRoot);

    return (fullPath: string, isDirectory: boolean): boolean => {
        let relativePath = normalizeSeparators(path.relative(resolvedRoot, path.resolve(fullPath)));
        if (!relativePath || relativePath.startsWith('..')) {
            return false;
        }

        if (isDirectory) {
            relativePath = relativePath.replace(/\/+$/, '');
        }

        for (const pattern of activePatterns) {
            if (pattern.regex.test(relativePath)) {
                return true;
            }

            if (pattern.pattern.startsWith('**/')) {
                const withoutPrefix = pattern.pattern.slice(3);
                if (globToRegExp(withoutPrefix).test(relativePath)) {
                    return true;
                }
            }
        }

        return false;
    };
}

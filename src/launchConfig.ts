import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Strips comments from JSON to allow parsing with JSON.parse
 */
function stripComments(content: string): string {
    return content.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1');
}

/**
 * Finds the insertion position for a new configuration in the launch.json file
 * returns { position: number, needsComma: boolean } or null if not found
 */
function findInsertionPosition(content: string): { position: number, needsComma: boolean } | null {
    // 1. Locate "configurations" key
    const configKeyRegex = /"configurations"\s*:\s*\[/g;
    const match = configKeyRegex.exec(content);
    if (!match) {
        return null; // "configurations" array not found
    }

    const startIndex = match.index + match[0].length;
    let balance = 1;
    let inString = false;
    let isEscaped = false;
    let lastNonWhitespaceChar = ''; // To check for trailing comma necessity

    // 2. Scan for matching closing bracket ]
    for (let i = startIndex; i < content.length; i++) {
        const char = content[i]!;

        if (isEscaped) {
            isEscaped = false;
            continue;
        }

        if (char === '\\') {
            isEscaped = true;
            continue;
        }

        if (char === '"') {
            inString = !inString;
            continue;
        }

        if (!inString) {
            if (char === '[') {
                balance++;
            } else if (char === ']') {
                balance--;
                if (balance === 0) {
                    // Found the end of the configurations array
                    // Check if we need a comma
                    // Look backward for non-whitespace/comment
                    let j = i - 1;
                    while (j >= startIndex) {
                        const c = content[j]!;
                        if (!/\s/.test(c)) {
                            lastNonWhitespaceChar = c;
                            break;
                        }
                        j--;
                    }

                    // If empty array, no comma needed. If ended with } or " or ], check comma
                    const needsComma = lastNonWhitespaceChar !== '[' && lastNonWhitespaceChar !== ',';
                    return { position: i, needsComma };
                }
            } else if (char === '}') {
                // Just track content
            }
        }
    }

    return null;
}

export async function checkAndAddLaunchConfig() {
    console.log('Checking launch configuration...');
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        return;
    }

    const vscodeDir = path.join(workspaceFolder.uri.fsPath, '.vscode');
    const launchJsonPath = path.join(vscodeDir, 'launch.json');

    const configToAdd = {
        "name": "MarkRunner CLI",
        "type": "debugpy",
        "request": "launch",
        "module": "markrunner.cli",
        "args": ["run", "-p", "${workspaceFolder}"],
        "console": "integratedTerminal"
    };

    try {
        if (!fs.existsSync(vscodeDir)) {
            fs.mkdirSync(vscodeDir);
        }

        let content = '{}';
        if (fs.existsSync(launchJsonPath)) {
            content = fs.readFileSync(launchJsonPath, 'utf8');
        }

        // Parse check
        let launchConfig: any = {};
        try {
            launchConfig = JSON.parse(stripComments(content));
        } catch (e) {
            console.error('Failed to parse existing launch.json', e);
            // If we can't parse it, we probably shouldn't mess with it automatically
            return;
        }

        const configurations = launchConfig.configurations || [];
        const exists = configurations.some((c: any) =>
            c.module === "markrunner.cli" &&
            JSON.stringify(c.args) === JSON.stringify(configToAdd.args)
        );

        if (!exists) {
            console.log('MarkRunner CLI config missing, preparing to add...');
            const insertionInfo = findInsertionPosition(content);
            const indent = '    ';

            if (insertionInfo) {
                // Append to existing array
                const { position, needsComma } = insertionInfo;
                const prefix = needsComma ? ',' : '';
                const configString = JSON.stringify(configToAdd, null, 4).split('\n').map(line => indent + indent + line).join('\n')
                    // Fix indentation of the first line to be consistent if needed, but JSON.stringify result is self-contained. 
                    // We just need to ensure it looks nice. 
                    // Actually JSON.stringify(obj, null, 4) creates indentation from start 0
                    .trim(); // We'll manually indent

                // Re-formatting for nicer insertion:
                const formattedConfig = JSON.stringify(configToAdd, null, 4).replace(/\n/g, '\n' + indent + indent);

                const newContent = content.slice(0, position) +
                    prefix + '\n' + indent + indent + formattedConfig + '\n' + indent +
                    content.slice(position);

                fs.writeFileSync(launchJsonPath, newContent);
                console.log('Launch config appended successfully.');

            } else {
                // "configurations" key not found or malformed.
                // If it's a simple object, try to add configurations array.
                // Find last closing brace
                const lastBraceIndex = content.lastIndexOf('}');
                if (lastBraceIndex !== -1) {
                    // Check if we need a comma before inserting configurations
                    // Allow simple check: parse again?
                    // Let's just assume we might need one if it's not empty ({})
                    const needsComma = stripComments(content).trim().length > 2; // "{}" is 2 chars

                    const newConfigArray = {
                        "version": "0.2.0",
                        "configurations": [configToAdd]
                    };

                    // Simplifying: If parsing failed we returned. If parsing succeeded but no configurations,
                    // we can assume safe to insert.

                    if (!launchConfig.configurations) {
                        // We need to insert `"configurations": [ ... ]`
                        const configStr = `\n${indent}"configurations": [\n${indent}${indent}${JSON.stringify(configToAdd, null, 4).replace(/\n/g, '\n' + indent + indent)}\n${indent}]`;

                        // We verify last non-whitespace char before }
                        let j = lastBraceIndex - 1;
                        let lastChar = '';
                        while (j >= 0) {
                            if (!/\s/.test(content[j]!)) {
                                lastChar = content[j]!;
                                break;
                            }
                            j--;
                        }

                        const prefix = (lastChar && lastChar !== '{' && lastChar !== ',') ? ',' : '';

                        const newContent = content.slice(0, lastBraceIndex) +
                            prefix + configStr + '\n' +
                            content.slice(lastBraceIndex);

                        fs.writeFileSync(launchJsonPath, newContent);
                        console.log('Launch config (and configurations array) added.');
                    }
                } else {
                    // Empty-ish file or invalid format, overwrite with safe default
                    const newContent = JSON.stringify({
                        "version": "0.2.0",
                        "configurations": [configToAdd]
                    }, null, 4);
                    fs.writeFileSync(launchJsonPath, newContent);
                    console.log('Created new launch.json.');
                }
            }
        } else {
            console.log('MarkRunner CLI launch config already exists.');
        }

    } catch (error) {
        console.error('Error handling launch.json:', error);
    }
}

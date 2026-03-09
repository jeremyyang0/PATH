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

async function ensureConfigExists(vscodeDir: string, launchJsonPath: string, configToAdd: any) {
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
        return;
    }

    const configurations = launchConfig.configurations || [];
    const exists = configurations.some((c: any) =>
        (c.name === configToAdd.name) || // Check by name first to avoid duplicates if args changed slightly
        (c.module === configToAdd.module && JSON.stringify(c.args) === JSON.stringify(configToAdd.args))
    );

    if (!exists) {
        console.log(`Config '${configToAdd.name}' missing, preparing to add...`);
        const insertionInfo = findInsertionPosition(content);
        const indent = '    ';

        if (insertionInfo) {
            // Append to existing array
            const { position, needsComma } = insertionInfo;
            const prefix = needsComma ? ',' : '';

            // Re-formatting for nicer insertion:
            const formattedConfig = JSON.stringify(configToAdd, null, 4).replace(/\n/g, '\n' + indent + indent);

            const newContent = content.slice(0, position) +
                prefix + '\n' + indent + indent + formattedConfig + '\n' + indent +
                content.slice(position);

            fs.writeFileSync(launchJsonPath, newContent);
            console.log(`Config '${configToAdd.name}' appended successfully.`);

        } else {
            // "configurations" key not found or malformed.
            const lastBraceIndex = content.lastIndexOf('}');
            if (lastBraceIndex !== -1) {
                // If configurations was missing, we can probably just merge it in.

                if (!launchConfig.configurations) {
                    // We need to insert `"configurations": [ ... ]`
                    const configStr = `\n${indent}"configurations": [\n${indent}${indent}${JSON.stringify(configToAdd, null, 4).replace(/\n/g, '\n' + indent + indent)}\n${indent}]`;

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
                    console.log(`Config '${configToAdd.name}' added with configurations array.`);
                }
            } else {
                // Empty-ish file or invalid format
                const newContent = JSON.stringify({
                    "version": "0.2.0",
                    "configurations": [configToAdd]
                }, null, 4);
                fs.writeFileSync(launchJsonPath, newContent);
                console.log(`Created new launch.json with '${configToAdd.name}'.`);
            }
        }
    } else {
        console.log(`Config '${configToAdd.name}' already exists.`);
    }
}

export async function checkAndAddLaunchConfig() {
    console.log('Checking launch configuration...');
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        return;
    }

    const vscodeDir = path.join(workspaceFolder.uri.fsPath, '.vscode');
    const launchJsonPath = path.join(vscodeDir, 'launch.json');

    try {
        if (!fs.existsSync(vscodeDir)) {
            fs.mkdirSync(vscodeDir);
        }

        const cliConfig = {
            "name": "MarkRunner CLI",
            "type": "debugpy",
            "request": "launch",
            "module": "markrunner.cli",
            "args": ["run", "-p", "${workspaceFolder}"],
            "console": "integratedTerminal"
        };

        const contextConfig = {
            "name": "MarkRunner Context Debug",
            "type": "debugpy",
            "request": "launch",
            "module": "markrunner.cli",
            "args": ["run", "-w", "${workspaceFolder}", "-p", "${relativeFile}", "--no-report", "--reruns", "0"],
            "console": "integratedTerminal"
        };

        await ensureConfigExists(vscodeDir, launchJsonPath, cliConfig);
        await ensureConfigExists(vscodeDir, launchJsonPath, contextConfig);

    } catch (error) {
        console.error('Error handling launch.json:', error);
    }
}

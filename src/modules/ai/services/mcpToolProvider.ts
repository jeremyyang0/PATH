import { AgentTool } from '../models/agentModels';

export interface McpClientAdapter {
    readonly serverName: string;
    listResources(): Promise<Array<{ uri: string; description: string }>>;
    readResource(uri: string): Promise<unknown>;
    callTool(toolName: string, args: Record<string, unknown>): Promise<unknown>;
}

export class McpToolProvider {
    private readonly clients = new Map<string, McpClientAdapter>();

    public registerClient(client: McpClientAdapter): void {
        this.clients.set(client.serverName, client);
    }

    public getEnabledServerNames(allowedServers: string[]): string[] {
        return allowedServers.filter(serverName => this.clients.has(serverName));
    }

    public getTools(allowedServers: string[]): AgentTool[] {
        const enabled = new Set(this.getEnabledServerNames(allowedServers));
        if (enabled.size === 0) {
            return [];
        }

        return [
            {
                definition: {
                    name: 'mcp.listResources',
                    description: 'List readable resources from configured MCP servers.',
                    inputSchema: '{"serverName":"string"}'
                },
                execute: async args => {
                    const serverName = typeof args['serverName'] === 'string' ? args['serverName'] : '';
                    if (!enabled.has(serverName)) {
                        throw new Error(`MCP server is not enabled: ${serverName}`);
                    }
                    const client = this.clients.get(serverName);
                    if (!client) {
                        throw new Error(`MCP client is not registered: ${serverName}`);
                    }
                    const resources = await client.listResources();
                    return {
                        ok: true,
                        summary: `Loaded ${resources.length} resources from ${serverName}`,
                        content: resources
                    };
                }
            },
            {
                definition: {
                    name: 'mcp.readResource',
                    description: 'Read a resource from an enabled MCP server.',
                    inputSchema: '{"serverName":"string","uri":"string"}'
                },
                execute: async args => {
                    const serverName = typeof args['serverName'] === 'string' ? args['serverName'] : '';
                    const uri = typeof args['uri'] === 'string' ? args['uri'] : '';
                    if (!enabled.has(serverName)) {
                        throw new Error(`MCP server is not enabled: ${serverName}`);
                    }
                    const client = this.clients.get(serverName);
                    if (!client) {
                        throw new Error(`MCP client is not registered: ${serverName}`);
                    }
                    const resource = await client.readResource(uri);
                    return {
                        ok: true,
                        summary: `Read MCP resource ${uri}`,
                        content: resource
                    };
                }
            },
            {
                definition: {
                    name: 'mcp.callTool',
                    description: 'Call a read-only tool exposed by an enabled MCP server.',
                    inputSchema: '{"serverName":"string","toolName":"string","args":{}}'
                },
                execute: async args => {
                    const serverName = typeof args['serverName'] === 'string' ? args['serverName'] : '';
                    const toolName = typeof args['toolName'] === 'string' ? args['toolName'] : '';
                    const toolArgs = typeof args['args'] === 'object' && args['args'] !== null ? args['args'] as Record<string, unknown> : {};
                    if (!enabled.has(serverName)) {
                        throw new Error(`MCP server is not enabled: ${serverName}`);
                    }
                    const client = this.clients.get(serverName);
                    if (!client) {
                        throw new Error(`MCP client is not registered: ${serverName}`);
                    }
                    const result = await client.callTool(toolName, toolArgs);
                    return {
                        ok: true,
                        summary: `Executed MCP tool ${toolName} on ${serverName}`,
                        content: result
                    };
                }
            }
        ];
    }
}

export const mcpToolProvider = new McpToolProvider();

import { experimental_createMCPClient as createMCPClient } from 'ai';
// import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export interface KeyValuePair {
  key: string;
  value: string;
}

export interface MCPServerConfig {
  url: string;
  type: 'sse' | 'stdio' | 'streamable-http';
  command?: string;
  args?: string[];
  env?: KeyValuePair[];
  headers?: KeyValuePair[];
}

export interface MCPClientManager {
  tools: Record<string, any>;
  clients: any[];
  cleanup: () => Promise<void>;
}

/**
 * Initialize MCP clients for API calls
 * This uses the already running persistent SSE servers
 */
export async function initializeMCPClients(
  mcpServers: MCPServerConfig[] = [],
  abortSignal?: AbortSignal
): Promise<MCPClientManager> {
  // Initialize tools
  let tools = {};
  const mcpClients: any[] = [];

  // Process each MCP server configuration
  for (const mcpServer of mcpServers) {
    try {
      let mcpClient: any;
      if (mcpServer.type === 'streamable-http') {
        const url = new URL(mcpServer.url);
        const headers = mcpServer.headers?.reduce((acc, header) => {
          if (header.key) acc[header.key] = header.value || '';
          return acc;
        }, {} as Record<string, string>);
        mcpClient = await createMCPClient({
          transport: new StreamableHTTPClientTransport(url, {
            sessionId: `session_${Date.now()}`,
            // headers,
          }),
        });
      } else {
        // Fallback to existing SSE transport definition
        const transport = {
          type: 'sse' as const,
          url: mcpServer.url,
          headers: mcpServer.headers?.reduce((acc, header) => {
            if (header.key) acc[header.key] = header.value || '';
            return acc;
          }, {} as Record<string, string>),
        };
        mcpClient = await createMCPClient({ transport });
      }
      mcpClients.push(mcpClient);

      const mcptools = await mcpClient.tools();

      console.log(`MCP tools from ${mcpServer.url}:`, Object.keys(mcptools));

      // Add MCP tools to tools object
      tools = { ...tools, ...mcptools };
    } catch (error) {
      console.error('Failed to initialize MCP client:', error);
      // Continue with other servers instead of failing the entire request
    }
  }

  // Register cleanup for all clients if an abort signal is provided
  if (abortSignal && mcpClients.length > 0) {
    abortSignal.addEventListener('abort', async () => {
      await cleanupMCPClients(mcpClients);
    });
  }

  return {
    tools,
    clients: mcpClients,
    cleanup: async () => await cleanupMCPClients(mcpClients),
  };
}

async function cleanupMCPClients(clients: any[]): Promise<void> {
  // Clean up the MCP clients
  for (const client of clients) {
    try {
      await client.close();
    } catch (error) {
      console.error('Error closing MCP client:', error);
    }
  }
}

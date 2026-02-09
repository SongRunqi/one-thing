/**
 * Mock MCP Server for E2E Testing
 *
 * A simple stdio-based MCP server that implements the Model Context Protocol
 * for testing MCP connection and tool execution functionality.
 */

import { spawn, type ChildProcess } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'

interface MockMCPServerOptions {
  /** Server name */
  name?: string
  /** Should server fail to connect? */
  shouldFail?: boolean
  /** List of mock tools to provide */
  tools?: Array<{
    name: string
    description: string
    parameters?: Record<string, any>
  }>
}

/**
 * Creates a mock MCP server script and returns configuration
 */
export function createMockMCPServer(options: MockMCPServerOptions = {}) {
  const name = options.name || 'mock-mcp-server'
  const shouldFail = options.shouldFail || false
  const tools = options.tools || [
    {
      name: 'get_time',
      description: 'Get current time',
      parameters: {},
    },
    {
      name: 'calculate',
      description: 'Perform a calculation',
      parameters: {
        type: 'object',
        properties: {
          expression: { type: 'string', description: 'Math expression to evaluate' },
        },
        required: ['expression'],
      },
    },
  ]

  // Create a temporary directory for the mock server
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mock-mcp-'))
  const serverPath = path.join(tmpDir, 'server.js')

  // Generate mock server script
  const serverScript = `
const readline = require('readline');

const tools = ${JSON.stringify(tools)};
const shouldFail = ${shouldFail};

// Create readline interface for stdio communication
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

// Track request ID
let requestId = 0;

function sendResponse(id, result, error) {
  const response = {
    jsonrpc: '2.0',
    id,
    ...(error ? { error } : { result })
  };
  console.log(JSON.stringify(response));
}

function sendNotification(method, params) {
  const notification = {
    jsonrpc: '2.0',
    method,
    params
  };
  console.log(JSON.stringify(notification));
}

// Handle incoming JSON-RPC messages
rl.on('line', (line) => {
  try {
    const message = JSON.parse(line);
    
    // Simulate connection failure
    if (shouldFail && message.method === 'initialize') {
      sendResponse(message.id, null, {
        code: -32603,
        message: 'Mock connection failure'
      });
      process.exit(1);
      return;
    }
    
    // Handle methods
    switch (message.method) {
      case 'initialize':
        sendResponse(message.id, {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
            resources: {}
          },
          serverInfo: {
            name: '${name}',
            version: '1.0.0'
          }
        });
        break;
        
      case 'tools/list':
        sendResponse(message.id, {
          tools: tools.map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.parameters || { type: 'object', properties: {} }
          }))
        });
        break;
        
      case 'tools/call':
        const toolName = message.params.name;
        const args = message.params.arguments || {};
        
        // Mock tool execution
        if (toolName === 'get_time') {
          sendResponse(message.id, {
            content: [{
              type: 'text',
              text: new Date().toISOString()
            }]
          });
        } else if (toolName === 'calculate') {
          try {
            // Simple eval for testing (NEVER use eval in production!)
            const result = eval(args.expression);
            sendResponse(message.id, {
              content: [{
                type: 'text',
                text: String(result)
              }]
            });
          } catch (e) {
            sendResponse(message.id, {
              content: [{
                type: 'text',
                text: 'Error: ' + e.message
              }],
              isError: true
            });
          }
        } else {
          sendResponse(message.id, null, {
            code: -32601,
            message: 'Tool not found: ' + toolName
          });
        }
        break;
        
      case 'resources/list':
        sendResponse(message.id, { resources: [] });
        break;
        
      case 'prompts/list':
        sendResponse(message.id, { prompts: [] });
        break;
        
      default:
        sendResponse(message.id, null, {
          code: -32601,
          message: 'Method not found: ' + message.method
        });
    }
  } catch (e) {
    // Invalid JSON or processing error
    console.error('Error processing message:', e.message);
  }
});

// Ready signal
process.stderr.write('Mock MCP server ready\\n');
`.trim()

  fs.writeFileSync(serverPath, serverScript)

  return {
    tmpDir,
    serverPath,
    config: {
      name,
      command: 'node',
      args: [serverPath],
      transport: 'stdio' as const,
    },
    cleanup: () => {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true })
      }
    },
  }
}

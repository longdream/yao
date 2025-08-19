export type Provider = 'ollama' | 'openai'

export type ModelConfig = {
  name: string
  provider: Provider
  baseUrl?: string
  apiKey?: string
}

export type MCPConfig = {
  id: string
  name: string
  command: string
  args?: string[]
  env?: Record<string, string>
  enabled: boolean
  description?: string
}

export type MCPToolCall = {
  tool: string
  arguments: Record<string, any>
}

export type MCPToolResult = {
  success: boolean
  result?: any
  error?: string
}

export type ReActStep = {
  thought: string
  action?: MCPToolCall
  observation?: string
}

export type MCPTool = {
  name: string
  description?: string
  inputSchema?: any
}

export type MCPServerInfo = {
  name: string
  version?: string
  tools?: MCPTool[]
}

// ReAct循环执行相关类型
export type ReActCycle = {
  cycleId: number
  thought: string
  action?: MCPToolCall
  observation?: string
  reflection: string
  success: boolean
  error?: string
}

export type TaskExecution = {
  taskId: string
  description: string
  cycles: ReActCycle[]
  completed: boolean
  maxRetries: number
  currentRetry: number
}



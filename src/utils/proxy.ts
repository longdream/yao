import { invoke } from '@tauri-apps/api/core'
import { Command } from '@tauri-apps/plugin-shell'
import type { AppConfig } from './store'
import type { Message } from '../ui/App'
import type { MCPConfig, MCPToolCall, MCPToolResult, ReActStep, MCPTool, MCPServerInfo } from './types'
import { log } from './log'

export async function fetchModels(config: AppConfig): Promise<string[]> {
  // If provider is ollama, probe server and try to start if not running
  if (config.provider === 'ollama') {
    try {
      await fetch(`${config.baseUrl.replace(/\/$/, '')}/api/tags`, { method: 'GET' })
      log('INFO', 'ollama probe ok', { baseUrl: config.baseUrl })
    } catch {
      // attempt to start Ollama background service cross-platform (best-effort)
      try {
        const base = config.baseUrl.replace(/\/$/, '')
        if (navigator.userAgent.includes('Windows')) {
          await Command.create('cmd', ['/c', 'start', '', 'ollama', 'serve']).spawn()
        } else {
          await Command.create('ollama', ['serve']).spawn()
        }
        log('INFO', 'ollama start command issued')
        // wait and re-probe up to 12s
        const deadline = Date.now() + 12000
        while (Date.now() < deadline) {
          try {
            await new Promise(r => setTimeout(r, 900))
            const resp = await fetch(`${base}/api/tags`)
            if (resp.ok) { log('INFO', 'ollama became ready'); break }
          } catch {}
        }
      } catch {}
    }
  }
  const res = await invoke<string>('proxy_models', { config })
  try {
    const list = JSON.parse(res) as string[]
    return list
  } catch {
    return []
  }
}

export async function* streamChat(params: {
  config: AppConfig
  messages: Message[]
  model: string
  think?: boolean
}): AsyncGenerator<string, void, unknown> {
  if (params.config.provider === 'ollama') {
    try {
      const ok = await invoke<boolean>('ensure_ollama', { config: params.config })
      if (!ok) throw new Error('Ollama is not running')
    } catch (e) {
      log('ERROR', 'ensure_ollama tauri failed', e)
      throw e as Error
    }
  }
  try {
    const streamId = await invoke<string>('start_chat_stream', { body: JSON.stringify(params) })
    const { listen } = await import('@tauri-apps/api/event')
    const unsubs: Array<() => void> = []
    const queue: string[] = []
    const done = { v: false }
    const err = { v: '' }
    unsubs.push(await listen<string>(`chat-chunk:${streamId}`, (e)=>{ queue.push(e.payload) }))
    unsubs.push(await listen<string>(`chat-end:${streamId}`, ()=>{ done.v = true }))
    unsubs.push(await listen<string>(`chat-error:${streamId}`, (e)=>{ err.v = e.payload; done.v = true }))
    while (!done.v || queue.length) {
      if (queue.length) {
        yield queue.shift()!
      } else {
        await new Promise(r=> setTimeout(r, 40))
      }
    }
    unsubs.forEach(u=>u())
    if (err.v) throw new Error(err.v)
    return
  } catch {}
  const handle = await invoke<string>('proxy_chat_stream', { body: JSON.stringify(params) })
  const text = await invoke<string>('proxy_chat', { handle })
  yield text
}

async function* streamFromTauri(_handle: string): AsyncGenerator<string> {
  // Placeholder for Tauri 2 streaming via events; simplified to single-shot proxy for now
  // In this MVP, just call non-streaming and yield once.
  const text = await invoke<string>('proxy_chat', { handle: _handle })
  yield text
}

async function ensureOllamaRunning(config: AppConfig) {
  try {
    await fetch(`${config.baseUrl.replace(/\/$/, '')}/api/tags`)
    return
  } catch {}
  try {
    const base = config.baseUrl.replace(/\/$/, '')
    const custom = (config as any).ollamaPath as string | undefined
    if (navigator.userAgent.includes('Windows')) {
      if (custom && custom.trim().length > 0) {
        await Command.create('cmd', ['/c', 'start', '', '"' + custom + '"', 'serve']).spawn()
      } else {
        await Command.create('cmd', ['/c', 'start', '', 'ollama', 'serve']).spawn()
      }
    } else {
      await Command.create(custom && custom.trim().length > 0 ? custom : 'ollama', ['serve']).spawn()
    }
    const deadline = Date.now() + 12000
    while (Date.now() < deadline) {
      try {
        await new Promise(r => setTimeout(r, 900))
        const resp = await fetch(`${base}/api/tags`)
        if (resp.ok) return
      } catch {}
    }
  } catch {}
  throw new Error('Ollama is not running')
}

// MCP相关函数

// 获取MCP服务器的工具列表
export async function getMCPTools(mcpConfig: MCPConfig): Promise<MCPServerInfo> {
  try {
    await log('INFO', 'mcp_get_tools_start', { mcp: mcpConfig.name })
    
    // 暂时返回模拟的工具列表，直到我们能正确实现MCP协议
    // 这里可以根据已知的MCP服务器类型返回预定义的工具
    let mockTools: MCPTool[] = []
    
    if (mcpConfig.id === 'excel-mcp' || mcpConfig.name.toLowerCase().includes('excel')) {
      mockTools = [
        { name: 'read_excel', description: 'Read data from Excel files' },
        { name: 'write_excel', description: 'Write data to Excel files' },
        { name: 'list_sheets', description: 'List all sheets in an Excel file' },
        { name: 'get_cell_value', description: 'Get value from a specific cell' },
        { name: 'set_cell_value', description: 'Set value to a specific cell' }
      ]
    }
    
    const serverInfo: MCPServerInfo = { 
      name: mcpConfig.name, 
      tools: mockTools 
    }
    
    await log('INFO', 'mcp_get_tools_success', { 
      mcp: mcpConfig.name, 
      toolsCount: serverInfo.tools?.length || 0,
      tools: serverInfo.tools?.map(t => t.name) || []
    })
    
    return serverInfo
    
  } catch (error) {
    const errorMsg = String(error)
    await log('ERROR', 'mcp_get_tools_exception', { mcp: mcpConfig.name, error: errorMsg })
    return { name: mcpConfig.name, tools: [] }
  }
}

// 初始化所有启用的MCP服务器，获取它们的工具列表
export async function initializeMCPServers(mcpServers: MCPConfig[]): Promise<Record<string, MCPServerInfo>> {
  const enabledServers = mcpServers.filter(mcp => mcp.enabled)
  const serverInfos: Record<string, MCPServerInfo> = {}
  
  await log('INFO', 'mcp_initialize_servers_start', { enabledCount: enabledServers.length })
  
  for (const server of enabledServers) {
    try {
      const info = await getMCPTools(server)
      serverInfos[server.id] = info
    } catch (error) {
      await log('ERROR', 'mcp_initialize_server_failed', { server: server.name, error: String(error) })
      serverInfos[server.id] = { name: server.name, tools: [] }
    }
  }
  
  await log('INFO', 'mcp_initialize_servers_complete', { 
    initialized: Object.keys(serverInfos).length,
    totalTools: Object.values(serverInfos).reduce((sum, info) => sum + (info.tools?.length || 0), 0)
  })
  
  return serverInfos
}

export async function callMCPTool(mcpConfig: MCPConfig, toolCall: MCPToolCall): Promise<MCPToolResult> {
  try {
    await log('INFO', 'mcp_tool_call_start', { mcp: mcpConfig.name, tool: toolCall.tool, args: toolCall.arguments })
    
    // 首先初始化MCP服务器
    const initMessage = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "yao", version: "1.0.0" }
      }
    }
    
    // 然后构建工具调用消息
    const toolMessage = {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: toolCall.tool,
        arguments: toolCall.arguments || {}
      }
    }
    
    // 创建临时文件来传递JSON消息
    const tempFileName = `mcp_${Date.now()}.json`
    const tempFilePath = `D:\\${tempFileName}`
    
    // 写入包含初始化和工具调用的JSON文件
    const fs = await import('@tauri-apps/plugin-fs')
    const combinedMessages = JSON.stringify(initMessage) + '\n' + JSON.stringify(toolMessage)
    await fs.writeTextFile(tempFilePath, combinedMessages)
    
    try {
      // 使用cmd通过重定向执行MCP命令
      const command = Command.create('cmd', [
        '/c', 
        `type "${tempFilePath}" | npx --yes @negokaz/excel-mcp-server`
      ], {
        env: mcpConfig.env
      })
      
      // 执行命令
      const result = await command.execute()
      
      await log('INFO', 'mcp_raw_response', { 
        mcp: mcpConfig.name, 
        tool: toolCall.tool,
        exitCode: result.code,
        stdout: result.stdout.slice(0, 500),
        stderr: result.stderr.slice(0, 500)
      })
      
      if (result.code === 0 && result.stdout.trim()) {
        const output = result.stdout.trim()
        try {
          // 尝试解析JSON-RPC响应
          const jsonResponse = JSON.parse(output)
          if (jsonResponse.result) {
            await log('INFO', 'mcp_tool_call_success', { mcp: mcpConfig.name, tool: toolCall.tool, result: jsonResponse.result })
            return { success: true, result: jsonResponse.result }
          } else if (jsonResponse.error) {
            await log('ERROR', 'mcp_tool_call_rpc_error', { mcp: mcpConfig.name, tool: toolCall.tool, error: jsonResponse.error })
            return { success: false, error: JSON.stringify(jsonResponse.error) }
          }
        } catch (parseError) {
          await log('WARN', 'mcp_response_parse_failed', { mcp: mcpConfig.name, tool: toolCall.tool, output: output.slice(0, 200), parseError: String(parseError) })
          return { success: true, result: output } // 返回原始输出
        }
      }
      
      const error = result.stderr || `Exit code: ${result.code}, no output`
      await log('ERROR', 'mcp_tool_call_error', { mcp: mcpConfig.name, tool: toolCall.tool, error })
      return { success: false, error }
      
    } finally {
      // 清理临时文件
      try {
        await fs.remove(tempFilePath)
      } catch {} // 忽略清理错误
    }
    
  } catch (error) {
    const errorMsg = String(error)
    await log('ERROR', 'mcp_tool_call_exception', { mcp: mcpConfig.name, tool: toolCall.tool, error: errorMsg })
    return { success: false, error: errorMsg }
  }
}

// 简化的MCP调用 - 移除复杂的ReAct机制
export async function* streamChatWithMCP(params: {
  config: AppConfig
  messages: Message[]
  model: string
  think?: boolean
  mcpEnabled?: boolean
}): AsyncGenerator<string, void, unknown> {
  if (!params.mcpEnabled || !params.config.mcpServers?.length) {
    await log('INFO', 'mcp_disabled_fallback_to_normal_chat', { mcpEnabled: params.mcpEnabled, mcpServersCount: params.config.mcpServers?.length || 0 })
    yield* streamChat(params)
    return
  }

  const enabledMCPServers = params.config.mcpServers.filter(mcp => mcp.enabled)
  if (enabledMCPServers.length === 0) {
    await log('INFO', 'mcp_no_enabled_servers_fallback', { totalServers: params.config.mcpServers.length })
    yield* streamChat(params)
    return
  }

  await log('INFO', 'mcp_simple_start', { enabledServers: enabledMCPServers.length })

  // 检查用户消息是否需要Excel操作
  const userMessage = params.messages[params.messages.length - 1]?.content || ''
  const needsExcelOperation = /excel|xlsx|xls|工作表|表格|打开.*文件/i.test(userMessage)
  let toolResult: MCPToolResult | null = null
  
  if (needsExcelOperation) {
    await log('INFO', 'mcp_excel_operation_detected', { userMessage: userMessage.slice(0, 100) })
    
    // 尝试直接调用MCP工具
    
    // 从用户消息中提取文件路径
    let filePath = ''
    
    // 首先尝试匹配标准路径格式：D:\file.xlsx 或 D:/file.xlsx
    const standardPathMatch = userMessage.match(/[A-Za-z]:[\\\/][^\\\/\s]+\.xlsx?/i)
    if (standardPathMatch) {
      filePath = standardPathMatch[0].replace(/\//g, '\\')
    } else {
      // 处理中文格式：D盘的file.xlsx
      const chinesePathMatch = userMessage.match(/([A-Za-z])盘.*?([^\\\/\s]*\.xlsx?)/i)
      if (chinesePathMatch) {
        filePath = `${chinesePathMatch[1]}:\\${chinesePathMatch[2]}`
      }
    }
    
    if (filePath) {
      
      await log('INFO', 'mcp_extracted_file_path', { originalMessage: userMessage, extractedPath: filePath })
      
      // 尝试调用 excel_describe_sheets
      const toolCall: MCPToolCall = {
        tool: 'excel_describe_sheets',
        arguments: { fileAbsolutePath: filePath }
      }
      
      for (const mcpServer of enabledMCPServers) {
        try {
          toolResult = await callMCPTool(mcpServer, toolCall)
          if (toolResult.success) {
            yield `\n正在分析Excel文件: ${filePath}\n\n`
            yield `文件信息: ${JSON.stringify(toolResult.result, null, 2)}\n\n`
            break
          }
        } catch (error) {
          await log('ERROR', 'mcp_direct_tool_call_failed', { server: mcpServer.name, error: String(error) })
        }
      }
      
      if (toolResult?.success) {
        yield `已成功读取Excel文件信息！\n`
        await log('INFO', 'mcp_direct_call_success', { filePath, result: toolResult.result })
        return
      } else {
        yield `无法读取Excel文件，可能是文件不存在或权限问题。\n`
        yield `错误信息: ${toolResult?.error || '未知错误'}\n`
        await log('INFO', 'mcp_fallback_after_tool_failure', { filePath, error: toolResult?.error })
      }
    } else {
      yield `无法从消息中提取文件路径，请提供完整的文件路径，例如：D:\\data.xlsx\n`
      await log('INFO', 'mcp_no_file_path_extracted', { userMessage: userMessage.slice(0, 100) })
    }
  }

  // 如果没有检测到Excel操作或工具调用失败，使用普通聊天
  await log('INFO', 'mcp_fallback_to_normal_chat', { needsExcelOperation, hasToolResult: !!toolResult })
  yield* streamChat(params)
}



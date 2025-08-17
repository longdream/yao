import { invoke } from '@tauri-apps/api/core'
import { Command } from '@tauri-apps/plugin-shell'
import type { AppConfig } from './store'
import type { Message } from '../ui/App'
import type { MCPConfig, MCPToolCall, MCPToolResult, ReActStep } from './types'
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
export async function callMCPTool(mcpConfig: MCPConfig, toolCall: MCPToolCall): Promise<MCPToolResult> {
  try {
    await log('INFO', 'mcp_tool_call_start', { mcp: mcpConfig.name, tool: toolCall.tool })
    
    // 构建MCP工具调用命令
    const args = [...(mcpConfig.args || []), '--tool', toolCall.tool, '--args', JSON.stringify(toolCall.arguments)]
    
    // 创建命令并设置环境变量
    const command = Command.create(mcpConfig.command, args, {
      env: mcpConfig.env
    })
    
    const result = await command.execute()
    
    if (result.code === 0) {
      const output = result.stdout.trim()
      let parsedResult
      try {
        parsedResult = JSON.parse(output)
      } catch {
        parsedResult = output
      }
      
      await log('INFO', 'mcp_tool_call_success', { mcp: mcpConfig.name, tool: toolCall.tool, result: parsedResult })
      return { success: true, result: parsedResult }
    } else {
      const error = result.stderr || `Exit code: ${result.code}`
      await log('ERROR', 'mcp_tool_call_error', { mcp: mcpConfig.name, tool: toolCall.tool, error })
      return { success: false, error }
    }
  } catch (error) {
    const errorMsg = String(error)
    await log('ERROR', 'mcp_tool_call_exception', { mcp: mcpConfig.name, tool: toolCall.tool, error: errorMsg })
    return { success: false, error: errorMsg }
  }
}

export async function* streamChatWithMCP(params: {
  config: AppConfig
  messages: Message[]
  model: string
  think?: boolean
  mcpEnabled?: boolean
}): AsyncGenerator<string, void, unknown> {
  if (!params.mcpEnabled || !params.config.mcpServers?.length) {
    // 如果没有启用MCP或没有配置MCP服务器，使用普通聊天
    yield* streamChat(params)
    return
  }

  const enabledMCPServers = params.config.mcpServers.filter(mcp => mcp.enabled)
  if (enabledMCPServers.length === 0) {
    yield* streamChat(params)
    return
  }

  await log('INFO', 'mcp_react_start', { enabledServers: enabledMCPServers.length })

  const maxAttempts = 5
  let attempt = 0
  const reactSteps: ReActStep[] = []

  while (attempt < maxAttempts) {
    attempt++
    await log('INFO', 'mcp_react_attempt', { attempt, maxAttempts })

    // 构建包含ReAct历史的消息
    const mcpSystemPrompt = `You are an AI assistant with access to MCP (Model Context Protocol) tools. You should use ReAct (Reasoning and Acting) pattern to solve problems.

Available MCP servers and their capabilities:
${enabledMCPServers.map(mcp => `- ${mcp.name}: ${mcp.description || 'No description'}`).join('\n')}

When you need to use tools, follow this format:
Thought: [Your reasoning about what to do next]
Action: [tool_name with arguments in JSON format]
Observation: [The result will be provided here]

Continue this process until you can provide a final answer. If you don't need any tools, just provide your response directly.

Previous ReAct steps:
${reactSteps.map(step => `Thought: ${step.thought}\n${step.action ? `Action: ${step.action.tool}(${JSON.stringify(step.action.arguments)})\n` : ''}${step.observation ? `Observation: ${step.observation}\n` : ''}`).join('\n')}
`

    const mcpMessages: Message[] = [
      { role: 'user', content: mcpSystemPrompt },
      ...params.messages
    ]

    // 获取AI的响应
    let response = ''
    for await (const chunk of streamChat({
      ...params,
      messages: mcpMessages
    })) {
      response += chunk
      yield chunk
    }

    // 解析响应中的Thought和Action
    const thoughtMatch = response.match(/Thought:\s*(.+?)(?=\n|$)/i)
    const actionMatch = response.match(/Action:\s*(\w+)\s*\((.+?)\)/i)

    const thought = thoughtMatch?.[1]?.trim() || response.trim()
    
    if (!actionMatch || !thought) {
      // 没有找到工具调用，这是最终答案
      await log('INFO', 'mcp_react_final_answer', { attempt, thought })
      break
    }

    const toolName = actionMatch[1]
    let toolArgs: Record<string, any> = {}
    
    try {
      toolArgs = JSON.parse(actionMatch[2])
    } catch {
      yield `\n\n[Error] Invalid tool arguments format: ${actionMatch[2]}`
      break
    }

    const toolCall: MCPToolCall = {
      tool: toolName,
      arguments: toolArgs
    }

    // 尝试找到匹配的MCP服务器并调用工具
    let toolResult: MCPToolResult | null = null
    
    for (const mcpServer of enabledMCPServers) {
      try {
        toolResult = await callMCPTool(mcpServer, toolCall)
        if (toolResult.success) {
          break
        }
      } catch (error) {
        await log('ERROR', 'mcp_tool_call_failed', { server: mcpServer.name, tool: toolName, error: String(error) })
      }
    }

    const observation = toolResult?.success 
      ? `Success: ${JSON.stringify(toolResult.result)}`
      : `Error: ${toolResult?.error || 'Tool call failed'}`

    reactSteps.push({
      thought,
      action: toolCall,
      observation
    })

    yield `\n\nObservation: ${observation}\n\n`

    if (!toolResult?.success) {
      yield `[Error] Tool call failed after trying all available MCP servers.`
      break
    }
  }

  if (attempt >= maxAttempts) {
    yield `\n\n[Info] Reached maximum ReAct attempts (${maxAttempts}). Providing current analysis.`
  }

  await log('INFO', 'mcp_react_end', { totalAttempts: attempt, stepsCount: reactSteps.length })
}



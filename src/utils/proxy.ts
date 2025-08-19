import { invoke } from '@tauri-apps/api/core'
import { Command } from '@tauri-apps/plugin-shell'
import type { AppConfig } from './store'
import type { Message } from '../ui/App'
import type { MCPConfig, MCPToolCall, MCPToolResult, ReActStep, MCPTool, MCPServerInfo, ReActCycle, TaskExecution } from './types'
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

// ReAct循环执行架构类型
export type ReActThought = {
  analysis: string
  plan: string
  nextAction?: string
}

export type ReActAction = {
  tool: string
  arguments: Record<string, any>
  reasoning: string
}

export type ReActObservation = {
  success: boolean
  result?: any
  error?: string
  raw_output?: string
}

export type ReActReflection = {
  success_analysis: string
  error_analysis?: string
  should_continue: boolean
  next_approach?: string
  completion_status: 'success' | 'partial' | 'failed' | 'continue'
}

// AI驱动的思考生成器
export async function generateThought(userMessage: string, previousCycles: ReActCycle[], availableTools: MCPTool[]): Promise<ReActThought> {
  await log('INFO', 'react_thought_generation', { 
    userMessage: userMessage.slice(0, 100),
    previousCycles: previousCycles.length,
    availableTools: availableTools.length
  })
  
  // 构建思考提示词
  const toolsList = availableTools.map(t => `- ${t.name}: ${t.description || '无描述'}`).join('\n')
  const previousAttempts = previousCycles.map((cycle, idx) => 
    `循环${idx + 1}: ${cycle.thought} -> ${cycle.action ? `调用${cycle.action.tool}` : '无动作'} -> ${cycle.observation || '无观察'}`
  ).join('\n')
  
  const systemPrompt = `你是一个智能助手，需要分析用户请求并制定行动计划。

可用工具:
${toolsList}

用户请求: ${userMessage}

${previousCycles.length > 0 ? `之前的尝试:\n${previousAttempts}` : ''}

请分析用户需求并制定下一步行动计划。返回JSON格式:
{
  "analysis": "对用户请求的分析",
  "plan": "具体的执行计划", 
  "nextAction": "下一步要执行的动作"
}`

  // 这里应该调用AI模型生成思考，暂时返回简化版本
  const thought: ReActThought = {
    analysis: `用户想要处理Excel文件相关操作: ${userMessage}`,
    plan: "首先分析文件路径，然后选择合适的工具执行操作",
    nextAction: previousCycles.length === 0 ? "excel_describe_sheets" : "根据之前结果决定"
  }
  
  return thought
}

// 动作执行器
export async function executeAction(action: ReActAction, mcpServers: MCPConfig[]): Promise<ReActObservation> {
  await log('INFO', 'react_action_execution', { tool: action.tool, reasoning: action.reasoning })
  
  // 找到合适的MCP服务器
  const mcpServer = mcpServers.find(mcp => 
    mcp.enabled && action.tool.startsWith('excel_')
  )
  
  if (!mcpServer) {
    return {
      success: false,
      error: `No suitable MCP server found for tool: ${action.tool}`
    }
  }
  
  try {
    const result = await callMCPTool(mcpServer, {
      tool: action.tool,
      arguments: action.arguments
    })
    
    return {
      success: result.success,
      result: result.result,
      error: result.error,
      raw_output: typeof result.result === 'string' ? result.result : JSON.stringify(result.result)
    }
  } catch (error) {
    return {
      success: false,
      error: String(error)
    }
  }
}

// 反思生成器
export async function generateReflection(
  thought: ReActThought, 
  action: ReActAction | null, 
  observation: ReActObservation | null,
  userMessage: string
): Promise<ReActReflection> {
  await log('INFO', 'react_reflection_generation', { 
    hasAction: !!action,
    hasObservation: !!observation,
    observationSuccess: observation?.success
  })
  
  if (!action || !observation) {
    return {
      success_analysis: "未执行任何动作",
      should_continue: true,
      completion_status: 'continue'
    }
  }
  
  if (observation.success) {
    // 成功的情况下分析是否完成任务
    const hasUsefulResult = observation.result && Object.keys(observation.result).length > 0
    
    return {
      success_analysis: `成功执行了${action.tool}工具，获得了${hasUsefulResult ? '有用的' : '部分'}结果`,
      should_continue: !hasUsefulResult,
      completion_status: hasUsefulResult ? 'success' : 'partial'
    }
  } else {
    // 失败的情况下分析错误并建议下一步
    return {
      success_analysis: "执行失败",
      error_analysis: observation.error || "未知错误",
      should_continue: true,
      next_approach: "尝试不同的方法或检查参数",
      completion_status: 'failed'
    }
  }
}

// 使用PowerShell管道执行MCP工具
export async function callMCPTool(mcpConfig: MCPConfig, toolCall: MCPToolCall): Promise<MCPToolResult> {
  try {
    await log('INFO', 'mcp_tool_call_start', { mcp: mcpConfig.name, tool: toolCall.tool, args: toolCall.arguments })
    
    // 构建JSON-RPC消息
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
    
    const toolMessage = {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: toolCall.tool,
        arguments: toolCall.arguments || {}
      }
    }
    
    // 使用PowerShell的Here-String避免文件权限问题
    const command = Command.create('powershell', [
      '-Command',
      `@"
${JSON.stringify(initMessage)}
"@ | npx --yes @negokaz/excel-mcp-server; @"
${JSON.stringify(toolMessage)}
"@ | npx --yes @negokaz/excel-mcp-server`
    ], {
      env: mcpConfig.env
    })
    
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
      // 解析多个JSON响应 (初始化 + 工具调用)
      const lines = output.split('\n').filter(line => line.trim())
      
      for (const line of lines) {
        try {
          const jsonResponse = JSON.parse(line)
          // 查找工具调用的响应 (id: 2)
          if (jsonResponse.id === 2) {
            if (jsonResponse.result) {
              await log('INFO', 'mcp_tool_call_success', { mcp: mcpConfig.name, tool: toolCall.tool, result: jsonResponse.result })
              return { success: true, result: jsonResponse.result }
            } else if (jsonResponse.error) {
              await log('ERROR', 'mcp_tool_call_rpc_error', { mcp: mcpConfig.name, tool: toolCall.tool, error: jsonResponse.error })
              return { success: false, error: JSON.stringify(jsonResponse.error) }
            }
          }
        } catch (parseError) {
          continue // 跳过解析失败的行
        }
      }
      
      // 如果没有找到工具响应，返回原始输出
      await log('WARN', 'mcp_no_tool_response_found', { output: output.slice(0, 200) })
      return { success: true, result: output }
    }
    
    const error = result.stderr || `Exit code: ${result.code}, no output`
      await log('ERROR', 'mcp_tool_call_error', { mcp: mcpConfig.name, tool: toolCall.tool, error })
      return { success: false, error }
    
  } catch (error) {
    const errorMsg = String(error)
    await log('ERROR', 'mcp_tool_call_exception', { mcp: mcpConfig.name, tool: toolCall.tool, error: errorMsg })
    return { success: false, error: errorMsg }
  }
}

// ReAct循环执行器
export async function executeReActCycles(
  userMessage: string, 
  mcpServers: MCPConfig[], 
  maxRetries: number = 3,
  reflectionEnabled: boolean = true
): Promise<TaskExecution> {
  const taskId = `task_${Date.now()}`
  const cycles: ReActCycle[] = []
  let currentRetry = 0
  
  await log('INFO', 'react_execution_start', { 
    taskId, 
    userMessage: userMessage.slice(0, 100),
    maxRetries,
    reflectionEnabled
  })
  
  // 获取可用工具
  const availableTools: MCPTool[] = []
  for (const server of mcpServers.filter(s => s.enabled)) {
    // 这里应该从server info中获取工具列表
    // 暂时使用硬编码的Excel工具
    availableTools.push(
      { name: 'excel_describe_sheets', description: '获取Excel文件工作表信息' },
      { name: 'excel_read_sheet', description: '读取Excel工作表数据' },
      { name: 'excel_write_sheet', description: '写入Excel工作表数据' }
    )
  }
  
  while (currentRetry < maxRetries) {
    const cycleId = cycles.length + 1
    await log('INFO', 'react_cycle_start', { taskId, cycleId, retry: currentRetry })
    
    try {
      // 1. Think - 生成思考
      const thought = await generateThought(userMessage, cycles, availableTools)
      await log('INFO', 'react_thought_generated', { 
        taskId, 
        cycleId,
        analysis: thought.analysis.slice(0, 100),
        plan: thought.plan.slice(0, 100)
      })
      
      // 2. Act - 执行动作
      let action: ReActAction | null = null
      let observation: ReActObservation | null = null
      
      if (thought.nextAction && thought.nextAction !== "根据之前结果决定") {
        // 从用户消息中提取文件路径
        let filePath = extractFilePath(userMessage)
        
        if (filePath || thought.nextAction === 'excel_describe_sheets') {
          action = {
            tool: thought.nextAction,
            arguments: filePath ? { fileAbsolutePath: filePath } : {},
            reasoning: `基于思考结果执行${thought.nextAction}`
          }
          
          // 3. Observe - 观察结果
          observation = await executeAction(action, mcpServers)
          await log('INFO', 'react_observation', { 
            taskId, 
            cycleId,
            success: observation.success,
            hasResult: !!observation.result
          })
        } else {
          observation = {
            success: false,
            error: "无法从用户消息中提取文件路径"
          }
        }
      }
      
      // 4. Reflect - 反思 (如果启用)
      let reflection: ReActReflection
      if (reflectionEnabled) {
        reflection = await generateReflection(thought, action, observation, userMessage)
        await log('INFO', 'react_reflection', { 
          taskId, 
          cycleId,
          completionStatus: reflection.completion_status,
          shouldContinue: reflection.should_continue
        })
      } else {
        // 如果不启用反思，简单判断是否成功
        reflection = {
          success_analysis: observation?.success ? "执行成功" : "执行失败",
          should_continue: !observation?.success,
          completion_status: observation?.success ? 'success' : 'failed'
        }
      }
      
      // 记录当前循环
      const cycle: ReActCycle = {
        cycleId,
        thought: `${thought.analysis} | ${thought.plan}`,
        action: action || undefined,
        observation: observation?.raw_output || observation?.error || "无观察结果",
        reflection: reflection.success_analysis,
        success: observation?.success || false,
        error: observation?.error
      }
      cycles.push(cycle)
      
      // 判断是否完成
      if (reflection.completion_status === 'success') {
        await log('INFO', 'react_task_completed', { taskId, totalCycles: cycles.length })
        return {
          taskId,
          description: userMessage,
          cycles,
          completed: true,
          maxRetries,
          currentRetry
        }
      } else if (!reflection.should_continue) {
        await log('INFO', 'react_task_stopped', { taskId, reason: 'reflection_decided_stop' })
        break
      }
      
    } catch (error) {
      await log('ERROR', 'react_cycle_error', { taskId, cycleId, error: String(error) })
      cycles.push({
        cycleId,
        thought: "执行过程中发生错误",
        observation: String(error),
        reflection: "需要重试或采用不同方法",
        success: false,
        error: String(error)
      })
    }
    
    currentRetry++
  }
  
  await log('INFO', 'react_execution_complete', { 
    taskId, 
    completed: false,
    totalCycles: cycles.length,
    maxRetriesReached: currentRetry >= maxRetries
  })
  
  return {
    taskId,
    description: userMessage,
    cycles,
    completed: false,
    maxRetries,
    currentRetry
  }
}

// 辅助函数：提取文件路径
function extractFilePath(userMessage: string): string | null {
  // 首先尝试匹配标准路径格式：D:\file.xlsx 或 D:/file.xlsx
  const standardPathMatch = userMessage.match(/([A-Za-z]:[\\\/][^\\\/\s]+\.xlsx?)/i)
  if (standardPathMatch) {
    return standardPathMatch[1].replace(/\//g, '\\')
  }
  
  // 处理中文格式：D盘的file.xlsx
  const chinesePathMatch = userMessage.match(/([A-Za-z])盘.*?([^\\\/\s]*\.xlsx?)/i)
  if (chinesePathMatch) {
    return `${chinesePathMatch[1]}:\\${chinesePathMatch[2]}`
  }
  
  return null
}

// ReAct驱动的MCP智能调用
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

  const userMessage = params.messages[params.messages.length - 1]?.content || ''
  const maxRetries = params.config.mcpMaxRetries || 3
  const reflectionEnabled = params.config.mcpReflectionEnabled ?? true
  
  await log('INFO', 'mcp_react_start', { 
    enabledServers: enabledMCPServers.length,
    maxRetries,
    reflectionEnabled,
    userMessage: userMessage.slice(0, 100)
  })

  // 检查是否是Excel相关操作
  const isExcelOperation = /excel|xlsx|xls|工作表|表格|打开.*文件|读取.*文件/i.test(userMessage)
  
  if (!isExcelOperation) {
    await log('INFO', 'not_excel_operation_fallback', { userMessage: userMessage.slice(0, 100) })
    yield* streamChat(params)
    return
  }

  try {
    // 执行ReAct循环
    const taskExecution = await executeReActCycles(
      userMessage, 
      enabledMCPServers, 
      maxRetries, 
      reflectionEnabled
    )

    // 输出执行过程和结果
    yield `## 🤖 MCP ReAct 执行过程\n\n`
    yield `**任务**: ${taskExecution.description}\n`
    yield `**执行状态**: ${taskExecution.completed ? '✅ 完成' : '❌ 未完成'}\n`
    yield `**循环次数**: ${taskExecution.cycles.length}/${maxRetries}\n\n`

    // 显示每个循环的详细过程
    for (let i = 0; i < taskExecution.cycles.length; i++) {
      const cycle = taskExecution.cycles[i]
      
      yield `### 🔄 循环 ${cycle.cycleId}\n\n`
      
      // Think阶段
      yield `**💭 思考**: ${cycle.thought}\n\n`
      
      // Act阶段
      if (cycle.action) {
        yield `**🎯 动作**: 调用工具 \`${cycle.action.tool}\`\n`
        if (Object.keys(cycle.action.arguments).length > 0) {
          yield `**📝 参数**: \`${JSON.stringify(cycle.action.arguments)}\`\n\n`
        } else {
          yield `\n`
        }
      } else {
        yield `**🎯 动作**: 无动作\n\n`
      }
      
      // Observe阶段
      yield `**👁️ 观察**: ${cycle.success ? '✅' : '❌'} ${cycle.observation}\n\n`
      
      // Reflect阶段 (如果启用)
      if (reflectionEnabled) {
        yield `**🤔 反思**: ${cycle.reflection}\n\n`
      }
      
      // 如果有错误，显示错误信息
      if (cycle.error) {
        yield `**⚠️ 错误**: ${cycle.error}\n\n`
      }
      
      yield `---\n\n`
      
      // 添加小延迟使输出更自然
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    // 显示最终结果
    if (taskExecution.completed) {
      yield `## ✅ 任务完成\n\n`
      const lastSuccessfulCycle = taskExecution.cycles.find((c: ReActCycle) => c.success)
      if (lastSuccessfulCycle && lastSuccessfulCycle.action) {
        yield `成功执行了 \`${lastSuccessfulCycle.action.tool}\` 工具，获得了预期结果。\n\n`
      }
    } else {
      yield `## ❌ 任务未完成\n\n`
      yield `经过 ${taskExecution.cycles.length} 次尝试后仍未成功完成任务。\n\n`
      
      // 回退到AI处理
      yield `正在回退到AI助手处理...\n\n`
      
      // 构建上下文消息
      const contextMessage = `MCP ReAct执行未完成。执行了${taskExecution.cycles.length}个循环，最后的错误: ${taskExecution.cycles[taskExecution.cycles.length - 1]?.error || '未知错误'}`
      const enhancedMessages = [
        ...params.messages,
        { role: 'assistant' as const, content: contextMessage }
      ]
      
      yield* streamChat({ ...params, messages: enhancedMessages })
    }

  } catch (error) {
    await log('ERROR', 'mcp_react_execution_error', { error: String(error) })
    
    yield `## ❌ MCP执行错误\n\n`
    yield `执行过程中发生错误: ${String(error)}\n\n`
    yield `正在回退到普通AI助手...\n\n`
    
    yield* streamChat(params)
  }
}



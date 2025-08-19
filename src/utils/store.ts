import { log } from './log'
import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import type { ModelConfig, Provider, MCPConfig, MCPServerInfo } from './types'

export type AppConfig = {
  provider: Provider
  baseUrl: string
  apiKey?: string
  model?: string
  ollamaPath?: string
  models?: ModelConfig[]
  // chat options
  streamingEnabled?: boolean
  defaultThink?: boolean
  maxContextMessages?: number
  temperature?: number
  // ui options
  language?: 'zh-CN' | 'en'
  // mcp options
  mcpServers?: MCPConfig[]
  mcpServerInfos?: Record<string, MCPServerInfo>
  mcpMaxRetries?: number
  mcpReflectionEnabled?: boolean
}

type StoreState = {
  config: AppConfig
  setConfig: (partial: Partial<AppConfig>) => void
  persist: () => Promise<void>
}

export const useStore = create<StoreState>((set, get) => ({
  config: {
    provider: 'ollama',
    baseUrl: 'http://localhost:11434',
    apiKey: '',
    model: 'gpt-oss:20b',
    ollamaPath: '',
    models: [ { name: 'qwen3:0.6b', provider: 'ollama', baseUrl: 'http://localhost:11434' } ],
    streamingEnabled: true,
    defaultThink: true,
    maxContextMessages: 20,
    temperature: 0.6,
    language: 'zh-CN',
    mcpServers: [],
    mcpMaxRetries: 3,
    mcpReflectionEnabled: true,
  },
  setConfig(partial) {
    const merged = { ...get().config, ...partial }
    set({ config: merged })
    log('DEBUG', 'setConfig', merged)
  },
  async persist() {
    try {
      console.log('persist开始，当前配置:', get().config);
      const fs = await import('@tauri-apps/plugin-fs')
      const path = await invoke<string>('get_config_path')
      console.log('配置文件路径:', path);
      const configJson = JSON.stringify(get().config, null, 2);
      console.log('准备写入的JSON:', configJson);
      await fs.writeTextFile(path, configJson)
      console.log('文件写入成功');
      log('INFO', 'settings saved', get().config)
      
      // 验证写入是否成功
      try {
        const readBack = await fs.readTextFile(path);
        console.log('验证读取回的内容:', readBack);
        const parsed = JSON.parse(readBack);
        console.log('解析后的配置:', parsed);
      } catch (verifyError) {
        console.error('验证读取失败:', verifyError);
      }
    } catch (error) {
      console.error('persist失败:', error);
      log('ERROR', 'persist failed', error);
      // 重新抛出错误，让调用者知道保存失败
      throw error;
    }
  },
}))

export async function bootstrapConfig() {
  try {
    const fs = await import('@tauri-apps/plugin-fs')
    const path = await invoke<string>('get_config_path')
    let value: AppConfig | null = null
    try {
      const text = await fs.readTextFile(path)
      value = JSON.parse(text)
    } catch {}
    if (value) {
      const hydrated: AppConfig = {
        provider: value.provider || 'ollama',
        baseUrl: value.baseUrl || 'http://localhost:11434',
        apiKey: value.apiKey || '',
        model: value.model && value.model.length > 0 ? value.model : 'gpt-oss:20b',
        ollamaPath: value.ollamaPath || '',
        models: value.models && value.models.length ? value.models : [ { name: 'qwen3:0.6b', provider: 'ollama', baseUrl: 'http://localhost:11434' } ],
        streamingEnabled: value.streamingEnabled ?? true,
        defaultThink: value.defaultThink ?? true,
        maxContextMessages: value.maxContextMessages ?? 20,
        temperature: value.temperature ?? 0.6,
        language: value.language ?? 'zh-CN',
        mcpServers: (value.mcpServers || []).map(mcp => ({
          ...mcp,
          args: mcp.args || [],
          env: mcp.env || {}
        })),
        mcpServerInfos: value.mcpServerInfos || {},
        mcpMaxRetries: value.mcpMaxRetries ?? 3,
        mcpReflectionEnabled: value.mcpReflectionEnabled ?? true
      }
      useStore.setState({ config: hydrated })
      log('INFO', 'settings loaded', hydrated)
      
      // 初始化MCP服务器（如果有启用的服务器）
      const enabledMCPServers = hydrated.mcpServers?.filter(mcp => mcp.enabled) || []
      if (enabledMCPServers.length > 0) {
        // 异步初始化MCP服务器，不阻塞应用启动
        initializeMCPServersAsync(hydrated.mcpServers || [])
      }
    } else {
      // keep defaults
      log('INFO', 'settings not found, using defaults')
    }
  } catch {
    // ignore read errors
  }
}

// 异步初始化MCP服务器
async function initializeMCPServersAsync(mcpServers: MCPConfig[]) {
  try {
    const { initializeMCPServers } = await import('./proxy')
    const serverInfos = await initializeMCPServers(mcpServers)
    
    // 更新store中的MCP服务器信息
    const currentConfig = useStore.getState().config
    useStore.setState({ 
      config: { 
        ...currentConfig, 
        mcpServerInfos: serverInfos 
      } 
    })
  } catch (error) {
    log('ERROR', 'mcp_async_initialization_failed', { error: String(error) })
  }
}



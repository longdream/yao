import React, { useState } from 'react'
import { useStore } from '../utils/store'
import type { ModelConfig, MCPConfig } from '../utils/types'
import { Dropdown } from './Dropdown'
import { invoke } from '@tauri-apps/api/core'
import { Command } from '@tauri-apps/plugin-shell'
import { t, getCurrentLocale } from '../utils/i18n'

type Tab = 'models' | 'chat' | 'mcp'

export const SettingsDrawer: React.FC<{ close: () => void }> = ({ close }) => {
  const { config, setConfig, persist } = useStore()
  const [tab, setTab] = useState<Tab>('models')
  const [local, setLocal] = useState(config)
  const [modelList, setModelList] = useState<ModelConfig[]>(config.models || [])
  const [mcpList, setMcpList] = useState<MCPConfig[]>(config.mcpServers || [])
  const [currentLang, setCurrentLang] = useState(getCurrentLocale())
  
  // 确保local状态与最新的config同步
  React.useEffect(() => {
    console.log('设置页面打开，当前配置:', config);
    setLocal(config);
    setModelList(config.models || []);
    setMcpList(config.mcpServers || []);
  }, [config]);

  // 监听语言变化，强制重新渲染
  React.useEffect(() => {
    const newLang = getCurrentLocale();
    if (newLang !== currentLang) {
      setCurrentLang(newLang);
      console.log('Settings drawer language changed to:', newLang);
    }
  }, [config.language]); // 监听config.language变化

  const getDirectoryPath = (fullPath: string) => {
    const lastSlash = Math.max(fullPath.lastIndexOf('/'), fullPath.lastIndexOf('\\'))
    return lastSlash > 0 ? fullPath.substring(0, lastSlash) : fullPath
  }

  const openLogDirectory = async () => {
    try {
      const p = await invoke<string>('get_log_path')
      const dir = getDirectoryPath(p)
      console.log('打开日志目录:', dir)
      await Command.create('cmd', ['/c', 'start', '', dir]).spawn()
    } catch (error) {
      console.error('打开日志目录失败:', error)
      alert('打开日志目录失败: ' + error)
    }
  }

  const openConfigDirectory = async () => {
    try {
      const p = await invoke<string>('get_config_path')
      const dir = getDirectoryPath(p)
      console.log('打开配置目录:', dir)
      await Command.create('cmd', ['/c', 'start', '', dir]).spawn()
    } catch (error) {
      console.error('打开配置目录失败:', error)
      alert('打开配置目录失败: ' + error)
    }
  }

  const saveSettings = async () => {
    try {
      console.log('保存前的配置:', { ...local, models: modelList, mcpServers: mcpList })
      setConfig({ ...local, models: modelList, mcpServers: mcpList })
      console.log('调用persist前...')
      await persist()
      console.log('persist完成，准备重启...')
      location.reload()
    } catch (error) {
      console.error('保存失败:', error)
      alert('保存配置失败: ' + error)
    }
  }

  return (
    <div className="fixed inset-0 bg-white z-50 flex">
      <div className="w-[240px] h-full border-r border-gray-200 p-4 flex flex-col gap-2 bg-gray-50">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs text-gray-500 px-1">{t('settings.title')}</div>
          <button className="text-gray-500 hover:text-gray-700 p-1" onClick={close}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <button 
          className={`w-full h-10 rounded-ollama text-left px-3 ${tab==='models'?'bg-gray-900 text-white':'bg-white text-gray-800 border border-gray-200'}`} 
          onClick={() => setTab('models')}
        >
          {t('settings.models')}
        </button>
        <button 
          className={`w-full h-10 rounded-ollama text-left px-3 ${tab==='chat'?'bg-gray-900 text-white':'bg-white text-gray-800 border border-gray-200'}`} 
          onClick={() => setTab('chat')}
        >
          {t('settings.chat')}
        </button>
        <button 
          className={`w-full h-10 rounded-ollama text-left px-3 ${tab==='mcp'?'bg-gray-900 text-white':'bg-white text-gray-800 border border-gray-200'}`} 
          onClick={() => setTab('mcp')}
        >
          {t('settings.mcp')}
        </button>
        <div className="mt-auto text-[11px] text-gray-400 px-1">Yao Desktop</div>
      </div>
      
      <div className="flex-1 h-full flex flex-col">
        <div className="h-12 border-b border-gray-200 flex items-center justify-between px-4">
          <div className="text-sm text-gray-700">
            {tab === 'models' ? t('settings.models') : tab === 'chat' ? t('settings.chat') : t('settings.mcp')}
          </div>
        </div>
        
        <div className="flex-1 overflow-auto p-6">
          {tab === 'models' && (
            <div className="space-y-6 max-w-[760px]">
              <div className="space-y-2">
                <div className="text-sm text-gray-600">{t('settings.default_provider')}</div>
                <Dropdown 
                  value={local.provider} 
                  options={[{label:'ollama',value:'ollama'},{label:'openai',value:'openai'}]} 
                  onChange={(v) => setLocal({...local, provider: v as any})} 
                />
              </div>
              
              <div className="space-y-2">
                <div className="text-sm text-gray-600">{t('settings.default_base_url')}</div>
                <input 
                  className="input w-full" 
                  value={local.baseUrl} 
                  onChange={(e) => setLocal({...local, baseUrl: e.target.value})} 
                />
              </div>
              
              <div className="space-y-2">
                <div className="text-sm text-gray-600">{t('settings.default_model')}</div>
                <input 
                  className="input w-full" 
                  value={local.model || ''} 
                  onChange={(e) => setLocal({...local, model: e.target.value})} 
                />
              </div>
              
              <div className="pt-2 text-sm text-gray-800">{t('settings.model_list')}</div>
              <div className="space-y-3">
                {modelList.map((m, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-ollama p-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <div className="text-xs text-gray-500">{t('settings.name')}</div>
                      <input 
                        className="input h-10 w-full" 
                        value={m.name} 
                        onChange={(e) => {
                          const next = [...modelList]
                          next[idx] = {...m, name: e.target.value}
                          setModelList(next)
                        }} 
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-gray-500">Provider</div>
                      <Dropdown 
                        value={m.provider} 
                        options={[{label:'ollama',value:'ollama'},{label:'openai',value:'openai'}]} 
                        onChange={(v) => {
                          const next = [...modelList]
                          next[idx] = {...m, provider: v as any}
                          setModelList(next)
                        }} 
                      />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <div className="text-xs text-gray-500">Base URL</div>
                      <input 
                        className="input h-10 w-full" 
                        placeholder={t('settings.base_url_placeholder')} 
                        value={m.baseUrl || ''} 
                        onChange={(e) => {
                          const next = [...modelList]
                          next[idx] = {...m, baseUrl: e.target.value}
                          setModelList(next)
                        }} 
                      />
                    </div>
                    {m.provider === 'openai' && (
                      <div className="space-y-1 md:col-span-2">
                        <div className="text-xs text-gray-500">API Key</div>
                        <input 
                          className="input h-10 w-full" 
                          placeholder={t('settings.api_key_placeholder')} 
                          value={m.apiKey || ''} 
                          onChange={(e) => {
                            const next = [...modelList]
                            next[idx] = {...m, apiKey: e.target.value}
                            setModelList(next)
                          }} 
                        />
                      </div>
                    )}
                    <div className="md:col-span-2 flex justify-end">
                      <button 
                        className="btn h-9 px-3" 
                        onClick={() => {
                          const next = [...modelList]
                          next.splice(idx, 1)
                          setModelList(next)
                        }}
                      >
                        {t('settings.delete')}
                      </button>
                    </div>
                  </div>
                ))}
                <button 
                  className="btn h-10 px-3" 
                  onClick={() => setModelList([
                    ...(modelList || []), 
                    { name: 'qwen3:0.6b', provider: 'ollama', baseUrl: 'http://localhost:11434' }
                  ])}
                >
                  {t('settings.add_model')}
                </button>
              </div>
            </div>
          )}
          
          {tab === 'chat' && (
            <div className="space-y-6 max-w-[760px]">
              <div className="text-sm text-gray-600">{t('settings.chat')}</div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input 
                    type="checkbox" 
                    checked={!!local.streamingEnabled} 
                    onChange={(e) => setLocal({ ...local, streamingEnabled: e.target.checked })} 
                  />
                  {t('settings.streaming_enabled')}
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input 
                    type="checkbox" 
                    checked={!!local.defaultThink} 
                    onChange={(e) => setLocal({ ...local, defaultThink: e.target.checked })} 
                  />
                  {t('settings.default_think')}
                </label>
                <div className="space-y-1">
                  <div className="text-sm text-gray-600">{t('settings.max_context_messages')}</div>
                  <input 
                    type="number" 
                    min={0} 
                    className="input w-[160px]" 
                    value={local.maxContextMessages ?? 20} 
                    onChange={(e) => setLocal({ ...local, maxContextMessages: Number(e.target.value) || 0 })} 
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-gray-600">{t('settings.temperature')}</div>
                  <input 
                    type="number" 
                    min={0} 
                    max={2} 
                    step={0.1} 
                    className="input w-[160px]" 
                    value={local.temperature ?? 0.6} 
                    onChange={(e) => setLocal({ ...local, temperature: Number(e.target.value) || 0.6 })} 
                  />
                  <div className="text-xs text-gray-500">{t('settings.temperature_desc')}</div>
                </div>
              </div>
            </div>
          )}
          
          {tab === 'mcp' && (
            <div className="space-y-6 max-w-[760px]">
              <div className="text-sm text-gray-600">{t('settings.mcp_servers')}</div>
              <div className="space-y-3">
                {mcpList.map((mcp, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-ollama p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <input 
                          type="checkbox" 
                          checked={mcp.enabled} 
                          onChange={(e) => {
                            const next = [...mcpList]
                            next[idx] = {...mcp, enabled: e.target.checked}
                            setMcpList(next)
                          }} 
                        />
                        <span className="text-sm font-medium">{t('settings.mcp_enabled')}</span>
                      </div>
                      <button 
                        className="btn h-9 px-3" 
                        onClick={() => {
                          const next = [...mcpList]
                          next.splice(idx, 1)
                          setMcpList(next)
                        }}
                      >
                        {t('settings.delete')}
                      </button>
                    </div>
                    
                    <div className="space-y-1">
                      <div className="text-xs text-gray-500">{t('settings.mcp_name')}</div>
                      <input 
                        className="input h-10 w-full" 
                        value={mcp.name} 
                        onChange={(e) => {
                          const next = [...mcpList]
                          next[idx] = {...mcp, name: e.target.value}
                          setMcpList(next)
                        }} 
                      />
                    </div>
                    
                    <div className="space-y-1">
                      <div className="text-xs text-gray-500">{t('settings.mcp_json_config')}</div>
                      <textarea 
                        className="input w-full min-h-[120px] font-mono text-sm" 
                        placeholder={t('settings.mcp_json_placeholder')} 
                        value={JSON.stringify({
                          command: mcp.command,
                          args: mcp.args || [],
                          env: mcp.env || {}
                        }, null, 2)} 
                        onChange={(e) => {
                          try {
                            const config = JSON.parse(e.target.value)
                            const next = [...mcpList]
                            next[idx] = {
                              ...mcp,
                              command: config.command || '',
                              args: config.args || [],
                              env: config.env || {}
                            }
                            setMcpList(next)
                          } catch (error) {
                            // 忽略JSON解析错误，让用户继续编辑
                          }
                        }} 
                      />
                    </div>
                    
                    <div className="space-y-1">
                      <div className="text-xs text-gray-500">{t('settings.mcp_description')}</div>
                      <input 
                        className="input h-10 w-full" 
                        placeholder={t('settings.mcp_description_placeholder')} 
                        value={mcp.description || ''} 
                        onChange={(e) => {
                          const next = [...mcpList]
                          next[idx] = {...mcp, description: e.target.value}
                          setMcpList(next)
                        }} 
                      />
                    </div>
                  </div>
                ))}
                <div className="flex gap-2">
                  <button 
                    className="btn h-10 px-3" 
                    onClick={() => setMcpList([
                      ...mcpList, 
                      { 
                        id: `mcp-${Date.now()}`, 
                        name: 'New MCP Server', 
                        command: '', 
                        args: [],
                        env: {},
                        enabled: true 
                      }
                    ])}
                  >
                    {t('settings.add_mcp')}
                  </button>
                  <button 
                    className="btn h-10 px-3" 
                    onClick={() => setMcpList([
                      ...mcpList, 
                      { 
                        id: 'excel-mcp',
                        name: 'Excel MCP Server', 
                        command: 'cmd',
                        args: ['/c', 'npx', '--yes', '@negokaz/excel-mcp-server'],
                        env: {
                          'EXCEL_MCP_PAGING_CELLS_LIMIT': '4000'
                        },
                        enabled: true,
                        description: 'MCP server for Excel file operations'
                      }
                    ])}
                  >
                    {t('settings.add_excel_mcp')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        
        <div className="h-14 border-t border-gray-200 px-4 flex items-center justify-end gap-2 bg-white">
          <button className="btn h-10 px-3" onClick={close}>
            {t('settings.cancel')}
          </button>
          <button className="btn h-10 px-3" onClick={saveSettings}>
            {t('settings.save_and_restart')}
          </button>
          <button className="btn h-10 px-3" onClick={openLogDirectory}>
            {t('settings.open_log_dir')}
          </button>
          <button className="btn h-10 px-3" onClick={openConfigDirectory}>
            {t('settings.open_config_dir')}
          </button>
        </div>
      </div>
    </div>
  )
}
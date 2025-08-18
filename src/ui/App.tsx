import React, { useEffect, useMemo, useRef, useState } from 'react'
import { SettingsDrawer } from './SettingsDrawer'
import { ChatBubble } from './ChatBubble'
import { useStore } from '../utils/store'
import { fetchModels, streamChat, streamChatWithMCP } from '../utils/proxy'
import { t, setLocale, getCurrentLocale } from '../utils/i18n'
import { IconSend, IconStop, IconGlobe, IconCloud, IconList, IconEdit, IconBrain, IconLanguage, IconMCP } from './icons'
import { Dropdown } from './Dropdown'
import { createConversationId, loadConversations, saveConversations, type Conversation } from '../utils/conversations'
import { log } from '../utils/log'
import { ModelPullDialog } from './ModelPullDialog'
// Loading现在在HTML中处理，不需要React组件
import { invoke } from '@tauri-apps/api/core'

export type Message = {
  role: 'user' | 'assistant'
  content: string
}

export const App: React.FC = () => {
  const [showSettings, setShowSettings] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [currentCid, setCurrentCid] = useState<string>('')
  const [input, setInput] = useState('')
  const [models, setModels] = useState<string[]>([])
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [typingIndex, setTypingIndex] = useState<number | null>(null)
  const [view, setView] = useState<'starter' | 'main'>('starter')
  const [isDrawerOpen, setDrawerOpen] = useState(false)
  const [thinkStartAt, setThinkStartAt] = useState<number | null>(null)
  const [thinkingMs, setThinkingMs] = useState<number>(0)
  const [assistantOutputStarted, setAssistantOutputStarted] = useState<boolean>(false)
  const [thinkEnabled, setThinkEnabled] = useState<boolean>(true)
  const [mcpEnabled, setMcpEnabled] = useState<boolean>(false)
  const [pullingModel, setPullingModel] = useState<string>('')
  const [currentLanguage, setCurrentLanguage] = useState(getCurrentLocale())
  const [isGenerating, setIsGenerating] = useState<boolean>(false)
  // 移除了isLoading状态，现在在main.tsx中处理初始加载
  const abortControllerRef = useRef<AbortController | null>(null)

  const { config } = useStore()
  const listRef = useRef<HTMLDivElement | null>(null)

  // 应用数据初始化
  useEffect(() => {
    const initAppData = async () => {
      try {
        const list = await fetchModels(config)
        setModels(list)
        const cs = await loadConversations()
        setConversations(cs)
        if (cs.length) {
          setCurrentCid(cs[0].id)
          setMessages(cs[0].messages.map(m=>({ role:m.role, content:m.content })))
        }
      } catch (error) {
        setModels([])
      }
    }
    
    initAppData()
  }, []) // 只在挂载时执行一次
  
  // 当config变化时重新获取models
  useEffect(() => {
    const updateModels = async () => {
      try {
        const list = await fetchModels(config)
        setModels(list)
      } catch (error) {
        setModels([])
      }
    }
    updateModels()
  }, [config.provider, config.baseUrl, config.apiKey])

  useEffect(() => {
    // Ensure think state matches config, but only update if config is actually loaded
    if (config.defaultThink !== undefined) {
      setThinkEnabled(!!config.defaultThink)
    }
  }, [config.defaultThink])

  // 初始化语言设置
  useEffect(() => {
    if (config.language) {
      setLocale(config.language)
      setCurrentLanguage(config.language)
    }
  }, [config.language])

  // 语言切换函数
  const toggleLanguage = async () => {
    const currentLang = getCurrentLocale()
    const newLang = currentLang === 'zh-CN' ? 'en' : 'zh-CN'
    setLocale(newLang)
    setCurrentLanguage(newLang)
    
    // 保存语言设置到配置中
    const { setConfig, persist } = useStore.getState()
    try {
      // 先更新store中的配置
      setConfig({ language: newLang })
      // 然后持久化到文件
      await persist()
      console.log('Language saved:', newLang)
    } catch (error) {
      console.error('Failed to save language:', error)
    }
  }

  useEffect(() => {
    if (!listRef.current) return
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages])

  const currentModel = useMemo(() => {
    // if configured models exist, restrict dropdown to them; otherwise fallback to fetched list
    if (config.models && config.models.length) {
      const names = config.models.map(m => m.name)
      const prefer = config.model && names.includes(config.model) ? config.model : (names[0] || '')
      return prefer
    }
    return config.model || models[0] || ''
  }, [config.model, config.models, models])
  const modelOptions = useMemo(() => {
    if (config.models && config.models.length) {
      return config.models.map(m => ({ label: m.name, value: m.name }))
    }
    return (models.length ? models : ['qwen3:0.6b']).map(m => ({ label: m, value: m }))
  }, [config.models, models])

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setIsGenerating(false)
    setTypingIndex(null)
    setThinkStartAt(null)
    log('INFO', 'chat_generation_stopped_by_user', {})
  }

  const handleSend = async () => {
    if (!input.trim()) return
    if (isGenerating) {
      handleStop()
      return
    }
    if (view === 'starter') setView('main')
    const newMessages = [...messages, { role: 'user', content: input.trim() }]
    setMessages(newMessages)
    setInput('')
    const cid = currentCid || createConversationId()
    if (!currentCid) setCurrentCid(cid)
    // 根据上下文限制截断
    const contextLimit = config.maxContextMessages ?? 20
    const history = newMessages.slice(Math.max(0, newMessages.length - contextLimit))
    await log('INFO', 'chat_send_start', { model: currentModel, think: thinkEnabled, input: input.trim() })
    // 找到当前模型的配置，使用其特定的baseUrl和provider
    const modelConfig = config.models?.find(m => m.name === currentModel)
    const modelBaseUrl = modelConfig?.baseUrl || config.baseUrl
    const modelProvider = modelConfig?.provider || config.provider
    
    await log('INFO', 'model_config_resolved', { 
      model: currentModel, 
      provider: modelProvider, 
      baseUrl: modelBaseUrl,
      configProvider: config.provider 
    })
    
    // 只对ollama provider的模型进行本地存在检查
    if (modelProvider === 'ollama') {
      try {
        await log('INFO', 'model_check_start', { model: currentModel, baseUrl: modelBaseUrl })
        const checkConfig = { ...config, baseUrl: modelBaseUrl, provider: modelProvider }
        const exists = await invoke<boolean>('check_model_exists', { config: checkConfig, model: currentModel })
        await log('INFO', 'model_check_result', { model: currentModel, exists })
        if (!exists) {
          await log('INFO', 'model_download_required', { model: currentModel, reason: 'model not found locally' })
          setPullingModel(currentModel)
          return
        }
      } catch (error) {
        await log('ERROR', 'model_check_failed', { model: currentModel, error: String(error) })
        // Continue with chat attempt even if check fails
      }
    }
    // streaming assistant
    const assistant: Message = { role: 'assistant', content: '' }
    setMessages(prev => [...prev, assistant])
    const assistantIndex = newMessages.length
    setTypingIndex(assistantIndex)
    setThinkStartAt(Date.now())
    setAssistantOutputStarted(false)
    setIsGenerating(true)
    
    // 创建AbortController
    abortControllerRef.current = new AbortController()
    
    try {
      // 使用模型特定的配置
      const modelSpecificConfig = { 
        ...config, 
        baseUrl: modelBaseUrl, 
        provider: modelProvider,
        apiKey: modelConfig?.apiKey || config.apiKey
      }
      
      await log('INFO', 'chat_stream_start', { 
        model: currentModel, 
        provider: modelProvider, 
        baseUrl: modelBaseUrl,
        think: thinkEnabled,
        hasApiKey: !!(modelSpecificConfig.apiKey && modelSpecificConfig.apiKey.length > 0),
        apiKeyLength: modelSpecificConfig.apiKey?.length || 0
      })
      
      for await (const chunk of streamChatWithMCP({
        config: modelSpecificConfig,
        messages: history,
        model: currentModel,
        think: thinkEnabled,
        mcpEnabled: mcpEnabled,
      })) {
        // typewriter effect for each chunk
        for (let i = 0; i < chunk.length; i++) {
          if (!assistantOutputStarted && chunk[i]) {
            setAssistantOutputStarted(true)
          }
          assistant.content += chunk[i]
          setMessages(prev => prev.map((m, i2) => (i2 === assistantIndex ? assistant : m)))
          await sleep(6)
        }
      }
      setTypingIndex(null)
      setThinkStartAt(null)
      setIsGenerating(false)
      abortControllerRef.current = null
      await log('INFO', 'chat_send_end', { model: currentModel, outputLen: assistant.content.length })
      // persist conversation
      const updated: Conversation = {
        id: cid,
        title: newMessages[0]?.content.slice(0, 24) || '对话',
        model: currentModel,
        provider: config.provider as any,
        updatedAt: Date.now(),
        messages: [...newMessages, assistant].map(m=>({ role:m.role, content:m.content, createdAt: Date.now() }))
      }
      const others = conversations.filter(c=>c.id!==cid)
      const saved = [updated, ...others].sort((a,b)=> b.updatedAt - a.updatedAt)
      setConversations(saved)
      await saveConversations(saved)
    } catch (err) {
      assistant.content += '\n[Error] Request failed.'
      setMessages(prev => prev.map((m, i) => (i === assistantIndex ? assistant : m)))
      setTypingIndex(null)
      setThinkStartAt(null)
      setIsGenerating(false)
      abortControllerRef.current = null
      await log('ERROR', 'chat_send_error', { error: String(err) })
    }
  }

  const InputBar = (
    <div className="h-[72px] bg-gray-100 rounded-[24px] flex items-center px-6 gap-3">
      <input
        className="flex-1 bg-transparent outline-none text-gray-700 placeholder-gray-400"
        placeholder={t('chat.send_message')}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key==='Enter' && !e.shiftKey){ e.preventDefault(); handleSend()} }}
      />
      <button
        className={`w-10 h-10 rounded-full flex items-center justify-center border ${thinkEnabled ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200'}`}
        title={t('chat.thinking')}
        onClick={()=> setThinkEnabled(v=>!v)}
      >
        <IconBrain className="w-5 h-5" />
      </button>
      <button
        className={`w-10 h-10 rounded-full flex items-center justify-center border ${mcpEnabled ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200'}`}
        title="MCP Agentic"
        onClick={()=> setMcpEnabled(v=>!v)}
      >
        <IconMCP className="w-5 h-5" />
      </button>
      {/* 隐藏互联网与 Turbo 按钮 */}
      <Dropdown
        value={currentModel}
        options={modelOptions}
        onChange={(v) => useStore.getState().setConfig({ model: v })}
        className=""
        buttonClassName="!h-10"
        direction="up"
      />
      <button
        className={`w-10 h-10 rounded-full flex items-center justify-center ${
          isGenerating 
            ? 'bg-gray-900 text-white hover:bg-gray-800' 
            : 'bg-gray-900 text-white hover:bg-gray-800'
        }`}
        onClick={handleSend}
        aria-label={isGenerating ? t('chat.stop') : t('chat.send')}
      >
        {isGenerating ? (
          <IconStop className="w-6 h-6 text-white" />
        ) : (
          <IconSend className="w-5 h-5" />
        )}
      </button>
    </div>
  )

  const TopBar = (
    <div className="h-12 flex items-center justify-between px-4">
      <div className="flex items-center gap-4 text-gray-700">
        {/* 系统标题栏左上角图标由系统绘制；这里的内嵌 logo去除 */}
        <button className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center" onClick={() => setDrawerOpen(true)} aria-label={t('chat.menu')}>
          <IconList className="w-4 h-4" />
        </button>
        <button className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center" onClick={() => { setView('starter'); setMessages([]); setCurrentCid('') }} aria-label={t('chat.new_chat')}>
          <IconEdit className="w-4 h-4" />
        </button>
        <button className="px-3 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-700 hover:bg-gray-200" onClick={toggleLanguage} aria-label={t('chat.language')}>
          {currentLanguage === 'zh-CN' ? 'EN' : '中'}
        </button>
        <div className="text-sm text-gray-600">Yao</div>
      </div>
      <div />
    </div>
  )

  const Drawer = (
    <div className={`fixed inset-0 z-50 ${isDrawerOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}>
      <div
        className={`absolute inset-0 bg-black/30 transition-opacity duration-400 ${isDrawerOpen ? 'opacity-100' : 'opacity-0'}`}
        onClick={() => setDrawerOpen(false)}
      />
      <div
        className={`absolute left-0 top-0 bottom-0 w-[360px] bg-white border-r border-gray-200 p-4 flex flex-col will-change-transform transform transition-transform duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] rounded-r-2xl shadow-2xl ${
          isDrawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="space-y-3">
          <button className="w-full h-11 rounded-ollama bg-gray-100 text-gray-800 text-left px-3" onClick={() => { setView('starter'); setMessages([]); setCurrentCid(''); setDrawerOpen(false) }}>{t('chat.new_chat')}</button>
          <button className="w-full h-11 rounded-ollama bg-gray-100 text-gray-800 text-left px-3" onClick={() => { setShowSettings(true); setDrawerOpen(false) }}>{t('chat.settings')}</button>
        </div>
        <div className="pt-4 text-xs text-gray-500">{t('chat.this_week')}</div>
        <div className="flex-1 overflow-y-auto space-y-3 pt-2">
          {conversations.map((c) => (
            <div key={c.id} className={`text-sm truncate cursor-pointer ${currentCid===c.id?'text-gray-900':'text-gray-800'}`} onClick={()=>{ setCurrentCid(c.id); setMessages(c.messages.map(m=>({role:m.role, content:m.content}))); setView('main'); setDrawerOpen(false) }}>
              {c.title}
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  // Esc 关闭抽屉 & 打开时锁定滚动
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    try {
      if (isDrawerOpen) document.body.classList.add('overflow-hidden')
      else document.body.classList.remove('overflow-hidden')
    } catch {}
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      try { document.body.classList.remove('overflow-hidden') } catch {}
    }
  }, [isDrawerOpen])

  // thinking timer
  useEffect(() => {
    if (thinkStartAt === null || assistantOutputStarted) return
    const id = setInterval(() => {
      setThinkingMs(Date.now() - (thinkStartAt ?? 0))
    }, 250)
    return () => clearInterval(id)
  }, [thinkStartAt, assistantOutputStarted])

  if (view === 'starter') {
    const hasHistory = messages.length > 0
    return (
      <div className="relative h-screen w-screen bg-white text-gray-900 overflow-hidden">
        <div className={`h-full transition-[padding] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] ${isDrawerOpen ? 'pl-[360px]' : 'pl-0'}`}>
          <div
            className={`flex flex-col h-full w-full will-change-transform origin-center transform transition-[transform,border-radius,box-shadow] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] bg-white ${
              isDrawerOpen ? 'scale-[0.96] rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.18)]' : 'scale-100'
            }`}
          >
          {TopBar}
          {!hasHistory ? (
            <div className="flex-1 w-full flex items-center justify-center">
              <img src="/images/yaologo-1.png" alt="logo" className="w-24 h-24 select-none" />
            </div>
          ) : (
            <div ref={listRef} className="flex-1 overflow-y-auto p-6 scrollbar">
              {messages.map((m, idx) => (
                <ChatBubble
                  key={idx}
                  role={m.role}
                  content={m.content}
                  isStreaming={typingIndex === idx && m.role === 'assistant'}
                  thinkingMs={!assistantOutputStarted && typingIndex === idx && m.role === 'assistant' ? thinkingMs : undefined}
                  thinkEnabled={thinkEnabled}
                  onCopy={()=> navigator.clipboard.writeText(m.content)}
                  onRetry={m.role==='assistant'? ()=>{ setInput(messages.filter((_,i)=>i<idx).map(m=>m.content).join('\n')); handleSend() } : undefined}
                />
              ))}
            </div>
          )}
          <div className="w-full px-6 pb-6">
            <div className="max-w-[1040px] mx-auto">{InputBar}</div>
          </div>
          </div>
        </div>
        {Drawer}
        {showSettings && <SettingsDrawer key={currentLanguage} close={() => setShowSettings(false)} />}
      </div>
    )
  }

  // 显示加载屏幕
  return (
    <div className="relative h-screen w-screen bg-white text-gray-900 overflow-hidden">
      <div className={`h-full transition-[padding] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] ${isDrawerOpen ? 'pl-[360px]' : 'pl-0'}`}>
        <div
          className={`flex flex-col h-full w-full will-change-transform origin-center transform transition-[transform,border-radius,box-shadow] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] bg-white ${
            isDrawerOpen ? 'scale-[0.96] rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.18)]' : 'scale-100'
          }`}
        >
          {TopBar}
          {/* Chat Area */}
          <div className="flex-1 h-full flex flex-col">
            <div ref={listRef} className="flex-1 overflow-y-auto p-6 scrollbar">
              {messages.map((m, idx) => (
                <ChatBubble
                  key={idx}
                  role={m.role}
                  content={m.content}
                  isStreaming={typingIndex === idx && m.role === 'assistant'}
                  thinkingMs={!assistantOutputStarted && typingIndex === idx && m.role === 'assistant' ? thinkingMs : undefined}
                  thinkEnabled={thinkEnabled}
                />
              ))}
            </div>
            <div className="w-full px-6 pb-6">
              <div className="max-w-[920px] mx-auto">{InputBar}</div>
            </div>
          </div>
        </div>
      </div>
      {Drawer}
      {showSettings && <SettingsDrawer close={() => setShowSettings(false)} />}
      {pullingModel && (
        <ModelPullDialog baseUrl={config.baseUrl} model={pullingModel} onClose={()=> setPullingModel('')} />
      )}
    </div>
  )
}



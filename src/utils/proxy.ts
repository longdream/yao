import { invoke } from '@tauri-apps/api/core'
import { Command } from '@tauri-apps/plugin-shell'
import type { AppConfig } from './store'
import type { Message } from '../ui/App'
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



import { invoke } from '@tauri-apps/api/core'
import type { Provider } from './types'

export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  createdAt: number
}

export type Conversation = {
  id: string
  title: string
  model: string
  provider: Provider
  updatedAt: number
  messages: ChatMessage[]
}

export async function getConversationsPath(): Promise<string> {
  return await invoke<string>('get_conversations_path')
}

export async function loadConversations(): Promise<Conversation[]> {
  try {
    const fs = await import('@tauri-apps/plugin-fs')
    const path = await getConversationsPath()
    const text = await fs.readTextFile(path).catch(() => '[]')
    const data = JSON.parse(text)
    if (Array.isArray(data)) return data as Conversation[]
    return []
  } catch {
    return []
  }
}

export async function saveConversations(conversations: Conversation[]): Promise<void> {
  try {
    const fs = await import('@tauri-apps/plugin-fs')
    const path = await getConversationsPath()
    await fs.writeTextFile(path, JSON.stringify(conversations, null, 2))
  } catch {
    // ignore
  }
}

export function createConversationId(): string {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}



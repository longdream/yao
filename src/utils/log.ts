import { invoke } from '@tauri-apps/api/core'

let inMemoryLogs: string[] = []

export async function getLogPath(): Promise<string> {
  try { return await invoke<string>('get_log_path') } catch { return 'unknown' }
}

async function ensureDir(path: string) {
  const dir = path.replace(/[\\/][^\\/]*$/, '')
  try {
    const fs = await import('@tauri-apps/plugin-fs')
    if (!(await fs.exists(dir))) {
      await fs.mkdir(dir, { recursive: true })
    }
  } catch {}
}

export async function log(level: 'INFO' | 'ERROR' | 'DEBUG' | 'WARN', message: string, data?: unknown) {
  const ts = new Date().toISOString()
  const line = `[${ts}] [${level}] ${message}${data !== undefined ? ' ' + safeJson(data) : ''}`
  inMemoryLogs.push(line)
  if (inMemoryLogs.length > 500) inMemoryLogs = inMemoryLogs.slice(-500)
  try { await invoke('write_log_line', { line }) } catch {}
  // eslint-disable-next-line no-console
  console.log(line)
}

export function getInMemoryLogs(): string[] {
  return inMemoryLogs.slice(-200)
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}



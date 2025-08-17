import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './ui/App'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { bootstrapConfig } from './utils/store'
import { log } from './utils/log'
import { invoke } from '@tauri-apps/api/core'

// 启动时异步读取配置，但不阻塞渲染，避免白屏
bootstrapConfig()
  .then(async () => {
    const logPath = await import('./utils/log').then(m => m.getLogPath())
    const cfgPath = await invoke<string>('get_config_path').catch(()=> 'unknown')
    await log('INFO', 'bootstrapConfig done', { logPath, cfgPath })
  })
  .catch((e) => log('ERROR', 'bootstrapConfig failed', e))
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)



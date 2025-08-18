import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './ui/App'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { bootstrapConfig } from './utils/store'
import { log } from './utils/log'
import { invoke } from '@tauri-apps/api/core'

// 创建应用实例但先不渲染
const root = createRoot(document.getElementById('root')!)

// 异步初始化配置，完成后才渲染应用
async function initializeApp() {
  try {
    await bootstrapConfig()
    const logPath = await import('./utils/log').then(m => m.getLogPath())
    const cfgPath = await invoke<string>('get_config_path').catch(()=> 'unknown')
    await log('INFO', 'bootstrapConfig done', { logPath, cfgPath })
    
    // 配置加载完成后渲染主应用
    root.render(
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    )
    
    // 清除初始loading界面
    const initialLoading = document.getElementById('initial-loading')
    if (initialLoading) {
      initialLoading.remove()
    }
  } catch (error) {
    await log('ERROR', 'bootstrapConfig failed', error)
    // 即使配置失败也要渲染应用
    root.render(
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    )
    
    // 清除初始loading界面
    const initialLoading = document.getElementById('initial-loading')
    if (initialLoading) {
      initialLoading.remove()
    }
  }
}

// 立即启动初始化
initializeApp()



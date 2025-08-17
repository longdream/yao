import React, { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { log } from '../utils/log'

interface ProgressData {
  status: string
  total: number
  completed: number
  percent: number
}

export const ModelPullDialog: React.FC<{ baseUrl: string; model: string; onClose: () => void }> = ({ baseUrl, model, onClose }) => {
  const [lines, setLines] = useState<string[]>([])
  const [id, setId] = useState<string>('')
  const [percent, setPercent] = useState<number>(0)
  const [status, setStatus] = useState<string>('初始化...')
  const [totalSize, setTotalSize] = useState<number>(0)
  const [completedSize, setCompletedSize] = useState<number>(0)
  const [downloadSpeed, setDownloadSpeed] = useState<string>('')
  const [startTime] = useState<number>(Date.now())
  const [lastCompletedSize, setLastCompletedSize] = useState<number>(0)
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now())

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  const calculateSpeed = (currentCompleted: number, currentTime: number): string => {
    const timeDiff = currentTime - lastUpdateTime
    const sizeDiff = currentCompleted - lastCompletedSize
    
    if (timeDiff > 0 && sizeDiff > 0) {
      const speedBytesPerSecond = (sizeDiff / timeDiff) * 1000
      return formatSize(speedBytesPerSecond) + '/s'
    }
    return ''
  }

  useEffect(() => {
    const run = async () => {
      await log('INFO', 'model_pull_dialog_start', { model, baseUrl })
      const pullId = await invoke<string>('start_pull_model', { baseUrl, name: model })
      setId(pullId)
      await log('INFO', 'model_pull_dialog_created', { model, pullId })
      
      const { listen } = await import('@tauri-apps/api/event')
      const unsubs: Array<() => void> = []
      
      unsubs.push(await listen<ProgressData | string>(`model-pull-progress:${pullId}`, (e) => {
        const p = e.payload as ProgressData | string
        const currentTime = Date.now()
        
        if (typeof p === 'string') {
          setLines(prev => [...prev.slice(-20), p]) // Keep last 20 lines
          setStatus(p.length > 50 ? p.substring(0, 50) + '...' : p)
        } else {
          const currentStatus = p?.status || '下载中...'
          const currentPercent = typeof p?.percent === 'number' ? p.percent : 0
          const currentTotal = p?.total || 0
          const currentCompleted = p?.completed || 0
          
          setPercent(currentPercent)
          setStatus(currentStatus)
          setTotalSize(currentTotal)
          setCompletedSize(currentCompleted)
          
          // Calculate download speed
          if (currentCompleted > lastCompletedSize) {
            const speed = calculateSpeed(currentCompleted, currentTime)
            if (speed) {
              setDownloadSpeed(speed)
              setLastCompletedSize(currentCompleted)
              setLastUpdateTime(currentTime)
            }
          }
          
          const statusLine = `${currentStatus} - ${currentPercent.toFixed(1)}% (${formatSize(currentCompleted)}/${formatSize(currentTotal)})`
          setLines(prev => [...prev.slice(-20), statusLine])
        }
      }))
      
      unsubs.push(await listen<string>(`model-pull-end:${pullId}`, async () => {
        await log('INFO', 'model_pull_dialog_completed', { 
          model, 
          pullId, 
          duration: Date.now() - startTime,
          totalSize: formatSize(totalSize)
        })
        setStatus('下载完成！')
        setPercent(100)
        // Auto close after 2 seconds
        setTimeout(onClose, 2000)
      }))
      
      unsubs.push(await listen<string>(`model-pull-error:${pullId}`, async (e) => {
        const errorMsg = `错误: ${e.payload}`
        setLines(prev => [...prev, errorMsg])
        setStatus('下载失败')
        await log('ERROR', 'model_pull_dialog_error', { 
          model, 
          pullId, 
          error: e.payload,
          duration: Date.now() - startTime
        })
      }))
      
      return () => unsubs.forEach(u => u())
    }
    run()
  }, [baseUrl, model, onClose, startTime, lastCompletedSize, lastUpdateTime, totalSize])

  const elapsedTime = Math.floor((Date.now() - startTime) / 1000)
  const estimatedTotal = percent > 0 ? Math.floor(elapsedTime / (percent / 100)) : 0
  const remaining = estimatedTotal > elapsedTime ? estimatedTotal - elapsedTime : 0

  return (
    <div className="fixed inset-0 bg-black/20 z-50 flex items-end justify-center p-6">
      <div className="w-full max-w-[680px] bg-white rounded-ollama border border-gray-200 shadow-xl overflow-hidden">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-lg font-medium text-gray-800">正在下载模型 {model}</div>
            <div className="text-sm text-gray-500">ID: {id}</div>
          </div>
          
          {/* Progress bar with percentage */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">{status}</span>
              <span className="font-mono text-gray-800">{percent.toFixed(1)}%</span>
            </div>
            <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden">
              <div 
                className="h-3 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-300 ease-out" 
                style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} 
              />
            </div>
          </div>
          
          {/* Download stats */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <div className="text-gray-500">下载大小</div>
              <div className="font-mono">{formatSize(completedSize)} / {formatSize(totalSize)}</div>
            </div>
            <div className="space-y-1">
              <div className="text-gray-500">下载速度</div>
              <div className="font-mono">{downloadSpeed || '-'}</div>
            </div>
            <div className="space-y-1">
              <div className="text-gray-500">已用时间</div>
              <div className="font-mono">{Math.floor(elapsedTime / 60)}:{(elapsedTime % 60).toString().padStart(2, '0')}</div>
            </div>
            <div className="space-y-1">
              <div className="text-gray-500">预计剩余</div>
              <div className="font-mono">{remaining > 0 ? `${Math.floor(remaining / 60)}:${(remaining % 60).toString().padStart(2, '0')}` : '-'}</div>
            </div>
          </div>
          
          {/* Status log */}
          <div className="max-h-[180px] overflow-auto bg-gray-50 border border-gray-200 rounded-lg p-3">
            {lines.length === 0 ? (
              <div className="text-xs text-gray-500">正在建立连接...</div>
            ) : (
              <pre className="text-xs whitespace-pre-wrap text-gray-700 font-mono leading-relaxed">
                {lines.slice(-10).join('\n')}
              </pre>
            )}
          </div>
          
          <div className="flex justify-end gap-3">
            <button className="btn h-10 px-4 bg-gray-100 text-gray-700 hover:bg-gray-200" onClick={onClose}>
              后台下载
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}



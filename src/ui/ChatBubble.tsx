import React, { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { IconCopy, IconRefresh, IconCheck, IconBot, IconUser } from './icons'
import { ThinkingBadge } from './Thinking'

export const ChatBubble: React.FC<{
  role: 'user' | 'assistant'
  content: string
  createdAt?: number
  isStreaming?: boolean
  thinkingMs?: number
  thinkEnabled?: boolean
  onCopy?: () => void
  onRetry?: () => void
}> = ({ role, content, createdAt, isStreaming, thinkingMs, thinkEnabled = true, onCopy, onRetry }) => {
  const isUser = role === 'user'
  const time = createdAt ? new Date(createdAt).toLocaleTimeString() : ''
  const [copied, setCopied] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  
  // Real-time streaming think parsing
  const parseStreamingContent = (text: string) => {
    if (isUser) return { thinkContent: '', mainContent: text, isInThink: false, isThinkComplete: false }
    
    // Check if we're currently inside a think tag
    const thinkStartMatch = text.match(/<think>/g)
    const thinkEndMatch = text.match(/<\/think>/g)
    
    const thinkStartCount = thinkStartMatch ? thinkStartMatch.length : 0
    const thinkEndCount = thinkEndMatch ? thinkEndMatch.length : 0
    
    // Extract think content
    const thinkRegex = /<think>([\s\S]*?)(?:<\/think>|$)/g
    const thinkMatches = []
    let match
    let processedContent = text
    
    while ((match = thinkRegex.exec(text)) !== null) {
      thinkMatches.push(match[1])
      if (match[0].includes('</think>')) {
        // Complete think tag, remove it from main content
        processedContent = processedContent.replace(match[0], '')
      } else {
        // Incomplete think tag (streaming), keep it for now but don't show in main
        processedContent = processedContent.replace(match[0], '')
      }
    }
    
    // Remove any remaining incomplete think tags from main content
    processedContent = processedContent.replace(/<think>[\s\S]*$/g, '')
    
    return {
      thinkContent: thinkMatches.join('\n\n'),
      mainContent: processedContent.trim(),
      isInThink: thinkStartCount > thinkEndCount,
      isThinkComplete: thinkEndCount > 0
    }
  }
  
  const { thinkContent, mainContent, isInThink, isThinkComplete } = parseStreamingContent(content)
  
  const handleCopy = () => {
    if (onCopy) {
      onCopy()
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const Avatar = () => {
    if (isUser) {
      return (
        <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center flex-shrink-0 shadow-sm">
          <IconUser className="w-4 h-4 text-white" />
        </div>
      )
    }
    return (
      <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center flex-shrink-0 shadow-sm overflow-hidden">
        <img 
          src="/images/yaologo-1.png" 
          alt="AI Assistant" 
          className="w-6 h-6 object-contain"
        />
      </div>
    )
  }

  const ThinkingSection = ({ content, isStreaming, isComplete }: { content: string, isStreaming?: boolean, isComplete?: boolean }) => {
    const [isExpanded, setIsExpanded] = useState(false)
    
    // Auto expand when streaming, but don't auto collapse when complete
    useEffect(() => {
      if (isStreaming && !isComplete) {
        setIsExpanded(true)
      }
      // Removed auto-collapse logic - user must manually click to collapse
    }, [isStreaming, isComplete])
    
    if (!content && !isStreaming) return null
    
    const estimatedSeconds = Math.max(1, Math.ceil(content.length / 50))
    
    return (
      <div className="mb-3 border border-gray-200 rounded-lg overflow-hidden">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full px-3 py-2 bg-gray-50 text-left text-sm text-gray-600 hover:bg-gray-100 transition-colors duration-200 flex items-center justify-between"
        >
          <span className="flex items-center gap-2">
            <span>💭</span>
            <span>
              {isStreaming && !isComplete ? 'Thinking...' : `Thought for ${estimatedSeconds} seconds`}
            </span>
            {isStreaming && !isComplete && (
              <div className="flex gap-1">
                <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            )}
          </span>
          <svg 
            className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {isExpanded && (
          <div className="px-3 py-2 text-sm text-gray-700 bg-white border-t border-gray-200">
            <div className="whitespace-pre-wrap leading-relaxed">
              {content}
              {isStreaming && !isComplete && (
                <span className="inline-block w-2 h-4 bg-gray-400 ml-1 animate-pulse" />
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  const ActionButtons = () => {
    return (
      <div className="flex items-center gap-1">
        {onCopy && (
          <button
            onClick={handleCopy}
            className={`p-1.5 rounded-lg transition-all duration-200 ${
              copied 
                ? 'bg-green-100 text-green-600' 
                : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'
            }`}
            title={copied ? '已复制!' : '复制'}
            disabled={copied}
          >
            {copied ? (
              <IconCheck className="w-3.5 h-3.5" />
            ) : (
              <IconCopy className="w-3.5 h-3.5" />
            )}
          </button>
        )}
        {!isUser && onRetry && (
          <button
            onClick={onRetry}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all duration-200"
            title="重新生成"
          >
            <IconRefresh className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    )
  }

  return (
    <div 
      className={`group w-full flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={`flex items-start gap-3 max-w-[80%] ${isUser ? 'flex-row-reverse' : ''}`}>
        <Avatar />
        
        <div className="flex flex-col min-w-0">
          {/* Thinking Section - Only show if think is enabled */}
          {!isUser && thinkEnabled && (thinkContent || isInThink) && (
            <ThinkingSection 
              content={thinkContent} 
              isStreaming={isStreaming && isInThink}
              isComplete={isThinkComplete}
            />
          )}
          
          {/* Message Bubble - Only show if there's main content or not currently thinking */}
          {(mainContent || isUser || (!isInThink && isStreaming)) && (
            <div
              className={`px-4 py-3 rounded-2xl shadow-sm ${
                isUser 
                  ? 'bg-blue-600 text-white rounded-br-md' 
                  : 'bg-gray-100 text-gray-800 rounded-bl-md'
              }`}
            >
              {/* Legacy Thinking Indicator (for streaming without think tags) */}
              {!isUser && thinkingMs && thinkingMs > 0 && !thinkContent && !isInThink && (
                <div className="mb-2">
                  <ThinkingBadge ms={thinkingMs} />
                </div>
              )}

              {/* Message Content */}
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
                    a: ({ children, href }) => <span className="underline">{children}</span>,
                    h1: ({ children }) => <h1 className="text-lg font-semibold mb-2">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-base font-semibold mb-2">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-sm font-semibold mb-1">{children}</h3>,
                    h4: ({ children }) => <h4 className="text-sm font-medium mb-1">{children}</h4>,
                    h5: ({ children }) => <h5 className="text-sm font-medium mb-1">{children}</h5>,
                    h6: ({ children }) => <h6 className="text-sm font-medium mb-1">{children}</h6>,
                    ul: ({ children }) => <ul className="list-disc list-inside mb-2">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal list-inside mb-2">{children}</ol>,
                    li: ({ children }) => <li className="mb-1">{children}</li>,
                    img: () => null,
                    code: ({ children, className }) => {
                      const isInline = !className
                      return isInline ? (
                        <code className={`px-1.5 py-0.5 rounded font-mono text-sm ${
                          isUser ? 'bg-blue-700/30 text-blue-100' : 'bg-gray-200 text-gray-800'
                        }`}>
                          {children}
                        </code>
                      ) : (
                        <code className="font-mono text-sm">{children}</code>
                      )
                    },
                    pre: ({ children }) => (
                      <pre className={`p-3 rounded-lg mt-2 mb-2 overflow-x-auto font-mono text-sm ${
                        isUser ? 'bg-blue-700/20 text-blue-100' : 'bg-gray-200 text-gray-800'
                      }`}>
                        {children}
                      </pre>
                    ),
                    blockquote: ({ children }) => (
                      <blockquote className={`border-l-4 pl-4 my-2 ${
                        isUser ? 'border-blue-300' : 'border-gray-300'
                      }`}>
                        {children}
                      </blockquote>
                    ),
                  }}
                >
                  {mainContent}
                </ReactMarkdown>
                
                {/* Typing Indicator - Only show when not in think mode */}
                {isStreaming && !isInThink && (
                  <span className="inline-flex items-center ml-1">
                    <span className={`w-1 h-4 rounded-full animate-pulse ${
                      isUser ? 'bg-blue-200' : 'bg-gray-400'
                    }`} />
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Action Buttons & Timestamp */}
          <div className={`flex items-center justify-between mt-1`}>
            <div className={`flex items-center gap-2 ${isUser ? 'order-2' : 'order-1'}`}>
              {time && (
                <span className="text-xs text-gray-400 px-2">
                  {time}
                </span>
              )}
            </div>
            <div className={`flex items-center gap-1 ${isUser ? 'order-1' : 'order-2'}`}>
              <ActionButtons />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}



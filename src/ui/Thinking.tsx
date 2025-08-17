import React from 'react'

export const ThinkingBadge: React.FC<{ ms: number }> = ({ ms }) => {
  const sec = Math.max(0, Math.round(ms / 100) / 10)
  return (
    <div className="inline-flex items-center gap-2 text-xs text-gray-300">
      <span>thinking {sec.toFixed(1)}s</span>
      <span className="inline-flex gap-1">
        <span className="dot" />
        <span className="dot delay-100" />
        <span className="dot delay-200" />
      </span>
    </div>
  )
}



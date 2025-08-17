import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type DropdownOption = { label: string; value: string }

export function Dropdown(props: {
  value?: string
  options: DropdownOption[]
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  align?: 'left' | 'right'
  buttonClassName?: string
  direction?: 'down' | 'up' | 'auto'
}) {
  const { value, options, onChange, placeholder, className, align = 'left', buttonClassName, direction = 'auto' } = props
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [panelPos, setPanelPos] = useState<{ top?: number; left?: number; right?: number; bottom?: number; width?: number; dir: 'up' | 'down' } | null>(null)

  const current = options.find(o => o.value === value)

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node
      const insideButton = !!rootRef.current && rootRef.current.contains(target)
      const insidePanel = !!panelRef.current && panelRef.current.contains(target)
      if (!insideButton && !insidePanel) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  useLayoutEffect(() => {
    if (!open || !rootRef.current) return
    const rect = rootRef.current.getBoundingClientRect()
    const viewportH = window.innerHeight
    const dir = direction === 'auto' ? ((viewportH - rect.bottom) < 220 ? 'up' : 'down') : direction
    setPanelPos({
      top: dir === 'down' ? rect.bottom + 8 : undefined,
      bottom: dir === 'up' ? (viewportH - rect.top) + 8 : undefined,
      left: align === 'left' ? rect.left : undefined,
      right: align === 'right' ? (window.innerWidth - rect.right) : undefined,
      width: rect.width,
      dir,
    })
    const onScroll = () => setOpen(false)
    window.addEventListener('scroll', onScroll, true)
    return () => window.removeEventListener('scroll', onScroll, true)
  }, [open, direction, align])

  return (
    <div ref={rootRef} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`h-10 px-4 rounded-full bg-white text-gray-700 border border-gray-200 flex items-center gap-2 hover:bg-white/95 focus:outline-none focus:ring-2 focus:ring-gray-200 ${
          buttonClassName ?? ''
        }`}
        onClick={() => setOpen(o => !o)}
      >
        <span className="truncate max-w-[200px] text-sm">{current?.label ?? placeholder ?? 'Select'}</span>
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
          <path d="M5.25 7.5l4.75 4.75L14.75 7.5" />
        </svg>
      </button>

      {open && panelPos && createPortal(
        <div
          className={`fixed z-[60] ${panelPos.dir === 'up' ? 'origin-bottom' : 'origin-top'} ${open ? 'opacity-100 scale-100' : 'pointer-events-none opacity-0 scale-95'} transition-all duration-200 bg-white border border-gray-200 rounded-ollama shadow-lg p-1`}
          style={{
            top: panelPos.top,
            bottom: panelPos.bottom,
            left: panelPos.left,
            right: panelPos.right,
            width: Math.min(panelPos.width ?? 280, window.innerWidth - 20),
            maxHeight: Math.min(240, window.innerHeight - 40),
          }}
          role="listbox"
          ref={panelRef}
        >
          {options.length === 0 ? (
            <div className="h-9 px-3 flex items-center text-sm text-gray-500">No options</div>
          ) : (
            options.map(opt => (
              <div
                key={opt.value}
                className={`h-9 px-3 rounded-ollama text-sm flex items-center cursor-pointer hover:bg-gray-100 ${
                  opt.value === value ? 'bg-gray-100' : ''
                }`}
                onClick={() => {
                  onChange(opt.value)
                  setOpen(false)
                }}
                role="option"
                aria-selected={opt.value === value}
              >
                <span className="truncate">{opt.label}</span>
              </div>
            ))
          )}
        </div>,
        document.body
      )}
    </div>
  )
}



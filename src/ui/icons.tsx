import React from 'react'

export const IconSend: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" />
  </svg>
)

export const IconGlobe: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
  </svg>
)

export const IconCloud: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M6 18a4 4 0 1 1 .5-7.97A6 6 0 1 1 18 17H6z" />
  </svg>
)

export const IconList: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
    <path d="M4 6h16M4 12h16M4 18h10" />
  </svg>
)

export const IconEdit: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" />
    <path d="M14.06 4.94l3.75 3.75" />
  </svg>
)

export const IconBrain: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className}>
    {/* 人类大脑侧面轮廓 */}
    <path d="M4 12c0-4.5 3.5-8 8-8s8 3.5 8 8c0 2-0.7 3.8-1.9 5.2-0.8 1-1.8 1.8-3.1 2.3-1.3 0.5-2.7 0.5-4 0s-2.3-1.3-3.1-2.3C4.7 15.8 4 14 4 12z" />
    {/* 额叶区域 */}
    <path d="M6 10c1-1.5 2.5-2.5 4-3" />
    {/* 顶叶区域 */}
    <path d="M10 7c1.5-0.5 3-0.5 4.5 0" />
    {/* 颞叶区域 */}
    <path d="M6 14c1 1 2.5 1.5 4 1.5" />
    {/* 枕叶区域 */}
    <path d="M14.5 7c1.5 0.5 2.5 1.5 3.5 2.5" />
    {/* 脑干连接 */}
    <path d="M11 17c0.5 0.5 1 0.5 1.5 0" />
    {/* 大脑皮层褶皱 */}
    <path d="M8 9c1 0.5 2 0.5 3 0" />
    <path d="M13 9c1 0.5 2 0.5 3 0" />
    <path d="M8 13c1-0.5 2-0.5 3 0" />
  </svg>
)

export const IconCopy: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className}>
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
)

export const IconRefresh: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className}>
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <path d="M3 21v-5h5" />
  </svg>
)

export const IconCheck: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
    <path d="M20 6L9 17l-5-5" />
  </svg>
)

export const IconBot: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2ZM21 9V7L15 1L13.5 2.5L16.17 5.17C15.24 5.06 14.24 5 13.23 5H10.77C9.76 5 8.76 5.06 7.83 5.17L10.5 2.5L9 1L3 7V9C3 10.1 3.9 11 5 11V16.5C5 17.3 5.7 18 6.5 18S8 17.3 8 16.5V11H16V16.5C16 17.3 16.3 18 17.5 18S19 17.3 19 16.5V11C20.1 11 21 10.1 21 9Z"/>
  </svg>
)

export const IconUser: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12ZM12 14C9.33 14 4 15.34 4 18V20H20V18C20 15.34 14.67 14 12 14Z"/>
  </svg>
)

export const IconLanguage: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/>
    <path d="M2 12h20"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
)

export const IconMCP: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
    {/* M字母 */}
    <path d="M4 20V8l4 8 4-8v12" />
    <path d="M16 8v12" />
    <path d="M20 8v12" />
    <path d="M16 8l2-4 2 4" />
    {/* 连接线表示协议 */}
    <circle cx="6" cy="4" r="1" fill="currentColor" />
    <circle cx="12" cy="4" r="1" fill="currentColor" />
    <circle cx="18" cy="4" r="1" fill="currentColor" />
    <path d="M6 4h12" strokeWidth="1" opacity="0.5" />
  </svg>
)

export const IconStop: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
)


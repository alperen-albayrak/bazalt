import React, { useRef, useState, useEffect, useCallback } from 'react'
import type { Tab } from '../../App.js'

interface TabBarProps {
  paneId: string
  tabs: Tab[]
  activeTabPath: string | null
  onSelect: (path: string) => void
  onClose: (path: string) => void
  onDrop: (path: string, fromPaneId: string) => void
  onOpenFile: (path: string) => void
  onSplit: () => void
}

const iconMini =
  'w-6 h-6 flex items-center justify-center text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors'

export function TabBar({ paneId, tabs, activeTabPath, onSelect, onClose, onDrop, onOpenFile, onSplit }: TabBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [draggingPath, setDraggingPath] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 0)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scroll', updateScrollState, { passive: true })
    const ro = new ResizeObserver(updateScrollState)
    ro.observe(el)
    updateScrollState()
    return () => {
      el.removeEventListener('scroll', updateScrollState)
      ro.disconnect()
    }
  }, [updateScrollState, tabs])

  // Auto-scroll active tab into view
  useEffect(() => {
    if (!activeTabPath) return
    const escaped = activeTabPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    scrollRef.current
      ?.querySelector(`[data-path="${escaped}"]`)
      ?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })
  }, [activeTabPath])

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dropdownOpen])

  const handleWheel = (e: React.WheelEvent) => {
    scrollRef.current?.scrollBy({ left: e.deltaY + e.deltaX, behavior: 'auto' })
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'))
      if (data.source === 'filetree') {
        onOpenFile(data.path)
      } else if (data.paneId !== paneId) {
        onDrop(data.path, data.paneId)
      }
    } catch {
      // ignore
    }
  }

  return (
    <div className="h-9 shrink-0 flex items-stretch border-b border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-950 overflow-hidden select-none relative">
      {/* Scrollable tab list */}
      <div
        ref={scrollRef}
        className="tab-scroll flex items-stretch overflow-x-auto flex-1 min-w-0"
        onWheel={handleWheel}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {tabs.map((tab) => {
          const isActive = tab.path === activeTabPath
          const isDragging = tab.path === draggingPath
          return (
            <div
              key={tab.path}
              data-path={tab.path}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', JSON.stringify({ paneId, path: tab.path }))
                setDraggingPath(tab.path)
              }}
              onDragEnd={() => setDraggingPath(null)}
              onMouseDown={(e) => {
                if (e.button === 1) {
                  e.preventDefault()
                  onClose(tab.path)
                }
              }}
              onClick={() => onSelect(tab.path)}
              className={[
                'group flex items-center gap-1.5 px-3 h-full text-sm shrink-0 max-w-[180px]',
                'border-r border-gray-200 dark:border-gray-700',
                'transition-colors relative cursor-pointer',
                isDragging ? 'opacity-50' : '',
                isActive
                  ? 'bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 font-medium'
                  : 'bg-gray-100 dark:bg-gray-950 text-gray-500 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-900/60',
              ].join(' ')}
            >
              {tab.unsaved && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 dark:bg-amber-300 shrink-0" />
              )}
              <span className="truncate">{tab.title}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onClose(tab.path)
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity ml-auto text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xs leading-none shrink-0"
                title="Close tab"
              >
                ×
              </button>
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent" />
              )}
            </div>
          )
        })}
      </div>

      {/* Right controls */}
      <div className="flex items-center shrink-0 border-l border-gray-200 dark:border-gray-700 px-1 gap-0.5">
        {canScrollLeft && (
          <button
            onClick={() => scrollRef.current?.scrollBy({ left: -120, behavior: 'smooth' })}
            className={iconMini}
            title="Scroll tabs left"
          >
            ‹
          </button>
        )}
        {canScrollRight && (
          <button
            onClick={() => scrollRef.current?.scrollBy({ left: 120, behavior: 'smooth' })}
            className={iconMini}
            title="Scroll tabs right"
          >
            ›
          </button>
        )}
        <button onClick={onSplit} title="Split pane right" className={iconMini}>
          ⧉
        </button>
        <div className="relative" ref={dropdownRef}>
          <button
            onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); setDropdownOpen((v) => !v) }}
            className={iconMini}
            title="All open tabs"
          >
            ▾
          </button>
          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1 min-w-[160px] max-h-64 overflow-y-auto">
              {tabs.length === 0 ? (
                <div className="px-3 py-2 text-xs text-gray-400">No open tabs</div>
              ) : tabs.map((tab) => (
                <button
                  key={tab.path}
                  onClick={() => {
                    onSelect(tab.path)
                    setDropdownOpen(false)
                  }}
                  className={[
                    'w-full text-left px-3 py-1.5 text-sm truncate flex items-center gap-2',
                    tab.path === activeTabPath
                      ? 'bg-accent/10 text-accent'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800',
                  ].join(' ')}
                >
                  {tab.unsaved && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 dark:bg-amber-300 shrink-0" />
                  )}
                  {tab.title}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

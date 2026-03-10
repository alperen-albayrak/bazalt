import React from 'react'

interface PaneSplitterProps {
  onDelta: (dx: number) => void
}

export function PaneSplitter({ onDelta }: PaneSplitterProps) {
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    let lastX = e.clientX
    const onMove = (ev: MouseEvent) => {
      onDelta(ev.clientX - lastX)
      lastX = ev.clientX
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div
      className="w-1 shrink-0 cursor-col-resize bg-gray-200 dark:bg-gray-700 hover:bg-accent/60 active:bg-accent transition-colors"
      onMouseDown={onMouseDown}
    />
  )
}

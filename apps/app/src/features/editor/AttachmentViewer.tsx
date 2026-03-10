import React, { useEffect, useRef, useState } from 'react'

type FileType = 'image' | 'audio' | 'video' | 'binary'

interface AttachmentViewerProps {
  path: string
  fileType: FileType
  resolveAttachment: (path: string) => Promise<string>
}

export function AttachmentViewer({ path, fileType, resolveAttachment }: AttachmentViewerProps) {
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const prevSrc = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    resolveAttachment(path)
      .then((url) => { if (!cancelled) setSrc(url) })
      .catch(() => { if (!cancelled) setError(true) })
    return () => {
      cancelled = true
      // Revoke the previous blob URL when path changes or unmount
      if (prevSrc.current) URL.revokeObjectURL(prevSrc.current)
    }
  }, [path, resolveAttachment])

  useEffect(() => {
    prevSrc.current = src
  }, [src])

  const fileName = path.split('/').pop() ?? path

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-2 text-gray-400">
        <span className="text-3xl">⚠</span>
        <p className="text-sm">Could not load file</p>
      </div>
    )
  }

  if (!src) {
    return (
      <div className="flex items-center justify-center flex-1 text-gray-400 text-sm">
        Loading…
      </div>
    )
  }

  if (fileType === 'image') {
    return (
      <div className="flex-1 flex items-center justify-center overflow-auto p-4 bg-checkerboard">
        <img
          src={src}
          alt={fileName}
          className="max-w-full max-h-full object-contain rounded shadow-sm"
        />
      </div>
    )
  }

  if (fileType === 'audio') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 bg-white dark:bg-gray-900">
        <span className="text-4xl">🎵</span>
        <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">{fileName}</p>
        <audio controls src={src} className="w-full max-w-lg" />
      </div>
    )
  }

  if (fileType === 'video') {
    return (
      <div className="flex-1 flex items-center justify-center p-4 bg-black">
        <video
          controls
          src={src}
          className="max-w-full max-h-full rounded shadow"
        />
      </div>
    )
  }

  // binary fallback
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-white dark:bg-gray-900">
      <span className="text-4xl">📄</span>
      <p className="text-sm text-gray-600 dark:text-gray-400">{fileName}</p>
      <a
        href={src}
        download={fileName}
        className="px-4 py-2 rounded-md bg-accent text-white text-sm hover:opacity-90 transition-opacity"
      >
        Download file
      </a>
    </div>
  )
}

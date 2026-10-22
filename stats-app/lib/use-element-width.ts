import { useEffect, useState } from 'react'

/**
 * Width of an element in px, kept up to date as it resizes (0 before the first
 * measure). Returns a callback ref, so it also works for an element that only
 * appears after loading.
 */
export function useElementWidth<T extends HTMLElement>() {
  const [element, setElement] = useState<T | null>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    if (!element) return
    // Measure right away: the observer's first report waits for a frame, which
    // background tabs delay, and the chart would stay blank until then
    setWidth(element.getBoundingClientRect().width)
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [element])

  return [setElement, width] as const
}

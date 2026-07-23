'use client'

import { useEffect, useRef } from 'react'

// Reveal-on-scroll (subtle; respects reduced motion via CSS)
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      el.dataset.visible = 'true'
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            ;(e.target as HTMLElement).dataset.visible = 'true'
            io.unobserve(e.target)
          }
        })
      },
      // A percentage threshold can never be reached when a long section is
      // taller than the viewport (especially on phones). Reveal as soon as
      // any part enters the reading area instead.
      { threshold: 0, rootMargin: '0px 0px -8% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return ref
}

import { useId, useMemo } from 'react'

/** Ritar ett spår som en mjuk SVG-linje – ingen karta behövs för översikten. */
export function RoutePreview({ points, className = '' }: { points: [number, number][]; className?: string }) {
  const gid = useId()
  const d = useMemo(() => {
    if (points.length < 2) return ''
    const k = Math.cos((points[0][0] * Math.PI) / 180)
    const xs = points.map((p) => p[1] * k)
    const ys = points.map((p) => -p[0])
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    const span = Math.max(maxX - minX, maxY - minY) || 1
    const pad = 12
    const size = 200 - pad * 2
    const ox = pad + (size - ((maxX - minX) / span) * size) / 2
    const oy = pad + (size - ((maxY - minY) / span) * size) / 2
    return xs
      .map((x, i) => `${i ? 'L' : 'M'}${(ox + ((x - minX) / span) * size).toFixed(1)} ${(oy + ((ys[i] - minY) / span) * size).toFixed(1)}`)
      .join(' ')
  }, [points])

  const start = d.match(/^M([\d.]+) ([\d.]+)/)

  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#83974a" />
          <stop offset="1" stopColor="#213400" />
        </linearGradient>
      </defs>
      <path d={d} fill="none" stroke="white" strokeOpacity="0.8" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={`url(#${gid})`} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      {start && <circle cx={start[1]} cy={start[2]} r="6" fill="#fffbeb" stroke="#2d4600" strokeWidth="3" />}
    </svg>
  )
}

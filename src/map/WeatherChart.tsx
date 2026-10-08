import type { Weather } from '../analysis/weather'

/** Nederbörd (staplar) och medeltemperatur (linje) – 14 dygn bakåt + prognos. */
export function WeatherChart({ weather, height = 120 }: { weather: Weather; height?: number }) {
  const today = new Date().toISOString().slice(0, 10)
  const ti = weather.days.findIndex((d) => d.date === today)
  const days = weather.days.slice(Math.max(0, ti - 13), ti + 4)
  const W = 320
  const H = height
  const pad = { l: 26, r: 26, t: 10, b: 20 }
  const bw = (W - pad.l - pad.r) / days.length
  const maxRain = Math.max(10, ...days.map((d) => d.rain))
  const temps = days.map((d) => d.tmean)
  const tMin = Math.floor(Math.min(...temps) - 2)
  const tMax = Math.ceil(Math.max(...temps) + 2)
  const yR = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / maxRain)
  const yT = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - (v - tMin) / (tMax - tMin || 1))
  const line = days.map((d, i) => `${i ? 'L' : 'M'}${(pad.l + bw * (i + 0.5)).toFixed(1)} ${yT(d.tmean).toFixed(1)}`).join(' ')
  const fmt = (iso: string) => new Date(`${iso}T12:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })

  return (
    <figure>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Nederbörd senaste 14 dygnen ${Math.round(weather.rain14)} mm, medeltemperatur ${weather.t10.toFixed(1)} grader`}
      >
        {[0, 0.5, 1].map((k) => (
          <line key={k} x1={pad.l} x2={W - pad.r} y1={yR(maxRain * k)} y2={yR(maxRain * k)} stroke="#2d4600" strokeOpacity="0.08" />
        ))}
        {days.map((d, i) => {
          const h = H - pad.b - yR(d.rain)
          return (
            <rect
              key={d.date}
              x={pad.l + bw * i + bw * 0.18}
              y={yR(d.rain)}
              width={bw * 0.64}
              height={Math.max(d.rain > 0 ? 1.5 : 0, h)}
              rx={2}
              fill={d.forecast ? '#7aa7d9' : '#3b78c2'}
              fillOpacity={d.forecast ? 0.45 : 0.85}
            >
              <title>{`${fmt(d.date)}: ${d.rain.toFixed(1)} mm, ${d.tmean.toFixed(1)}°C`}</title>
            </rect>
          )
        })}
        <path d={line} fill="none" stroke="#e0662b" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {ti >= 0 && <line x1={pad.l + bw * Math.min(13, ti) + bw} x2={pad.l + bw * Math.min(13, ti) + bw} y1={pad.t} y2={H - pad.b} stroke="#2d4600" strokeOpacity="0.35" strokeDasharray="3 3" />}
        <text x={4} y={pad.t + 8} fontSize="9" fill="#3b78c2" fontWeight="700">
          {Math.round(maxRain)} mm
        </text>
        <text x={W - 4} y={pad.t + 8} fontSize="9" fill="#e0662b" fontWeight="700" textAnchor="end">
          {tMax}°
        </text>
        <text x={W - 4} y={H - pad.b} fontSize="9" fill="#e0662b" fontWeight="700" textAnchor="end">
          {tMin}°
        </text>
        <text x={pad.l} y={H - 5} fontSize="9" fill="#535b3f">
          {fmt(days[0].date)}
        </text>
        <text x={W - pad.r} y={H - 5} fontSize="9" fill="#535b3f" textAnchor="end">
          prognos →
        </text>
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-medium text-ink-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-[#3b78c2]" aria-hidden="true" /> Nederbörd
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded bg-[#e0662b]" aria-hidden="true" /> Medeltemperatur
        </span>
      </figcaption>
    </figure>
  )
}

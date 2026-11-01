import { useEffect, useRef, useState, type PointerEvent } from 'react'

function scale(values: number[], width: number, height: number, top: number, max = Math.max(...values)) {
  const x = (i: number) => (i / (values.length - 1)) * width
  const y = (v: number) => top + (1 - v / max) * (height - top)
  return { x, y, line: values.map((v, i) => `${i ? 'L' : 'M'}${x(i)} ${y(v)}`).join(' ') }
}

export function Sparkline({ values }: { values: number[] }) {
  const { line } = scale(values, 200, 40, 2, Math.max(...values) * 1.05)
  return (
    <svg className="spark" viewBox="0 0 200 40" preserveAspectRatio="none" aria-hidden="true">
      <path d={`${line} L200 40 L0 40 Z`} className="chart__area" />
      <path d={line} className="chart__line" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

const axisWidth = 56
const axisBottom = 24
const height = 280

// ponytail: hover tooltip only; add arrow-key stepping when charts drive decisions on keyboard.
export function AreaChart({ values, labels, format, label }: { values: number[]; labels: string[]; format: (v: number) => string; label: string }) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    if (box.current) observer.observe(box.current)
    return () => observer.disconnect()
  }, [])

  const plotWidth = Math.max(width - axisWidth, 1)
  const plotHeight = height - axisBottom
  const top = Math.ceil(Math.max(...values) / 10000) * 10000
  const { x, y, line } = scale(values, plotWidth, plotHeight, 8, top)
  const ticks = [0, 0.5, 1].map((f) => f * top)
  const step = Math.ceil(values.length / Math.max(Math.floor(plotWidth / 90), 2))

  const move = (e: PointerEvent<SVGSVGElement>) => {
    const left = e.currentTarget.getBoundingClientRect().left + axisWidth
    const i = Math.round(((e.clientX - left) / plotWidth) * (values.length - 1))
    setHover(Math.min(Math.max(i, 0), values.length - 1))
  }

  return (
    <div className="area-chart" ref={box}>
      <svg width={width} height={height} role="img" aria-label={label} onPointerMove={move} onPointerLeave={() => setHover(null)}>
        <g transform={`translate(${axisWidth} 0)`}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="chart__grid" x1={0} x2={plotWidth} y1={y(t)} y2={y(t)} />
              <text className="chart__tick" x={-8} y={y(t) + 4} textAnchor="end">{format(t)}</text>
            </g>
          ))}
          {labels.map((text, i) => i % step === 0 && (
            <text key={text} className="chart__tick" x={x(i)} y={height - 6} textAnchor={i === 0 ? 'start' : 'middle'}>{text}</text>
          ))}
          <path d={`${line} L${plotWidth} ${plotHeight} L0 ${plotHeight} Z`} className="chart__area" />
          <path d={line} className="chart__line" />
          {hover !== null && (
            <g>
              <line className="chart__cross" x1={x(hover)} x2={x(hover)} y1={8} y2={plotHeight} />
              <circle className="chart__dot" cx={x(hover)} cy={y(values[hover])} r={5} />
            </g>
          )}
        </g>
      </svg>
      {hover !== null && (
        <div className="chart__tip" style={{ left: Math.min(axisWidth + x(hover) + 12, width - 120), top: 8 }}>
          <span className="muted">{labels[hover]}</span>
          <strong>{format(values[hover])}</strong>
        </div>
      )}
    </div>
  )
}

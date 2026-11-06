import type { ReactNode } from 'react'
import { BookOpen, ChevronDown, Ellipsis, Plus, X } from 'lucide-react'
import { Count, Roll } from '../../kit'
import './dashy.css'

// Obsidian's own chrome and Dashy's blocks, drawn from docs/screens. The block
// markup keeps the plugin's proportions; the colors are sampled from the real
// captures. Obsidian's icon pack is Lucide, so these are its real glyphs.

/**
 * Obsidian as a full-bleed app page. A 4:5 feed film has no room for a desktop
 * window's shape (references/export.md), so the tab bar is the top of the frame.
 */
export function ObsidianApp({ tabs, children, className }: { tabs: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`dy-app${className ? ` ${className}` : ''}`}>
      {tabs}
      {children}
    </div>
  )
}

export function TabBar({ tabs, active, targets }: { tabs: string[]; active: number; targets?: string[] }) {
  return (
    <div className="dy-tabs">
      {tabs.map((t, i) => (
        <span key={t} className="dy-tab" data-active={i === active || undefined} data-target={targets?.[i]} data-cursor="pointer">
          <span className="dy-tab__name">{t}</span>
          <X size={12} strokeWidth={2} />
        </span>
      ))}
      <Plus className="dy-tabs__plus" size={15} strokeWidth={1.75} />
      <ChevronDown className="dy-tabs__end" size={15} strokeWidth={1.75} />
    </div>
  )
}

export function ViewHeader({ title }: { title: string }) {
  return (
    <div className="dy-header">
      <span className="dy-header__title"><Roll variant="fade">{title}</Roll></span>
      <span className="dy-header__end">
        <BookOpen size={15} strokeWidth={1.75} />
        <Ellipsis size={15} strokeWidth={1.75} />
      </span>
    </div>
  )
}

const spaced = (n: number) => Math.round(n).toLocaleString('en-US').replace(/,/g, ' ')

export function StatCard({ value, unit, label, compare, digits = 0 }: {
  value: number
  unit?: string
  label: string
  compare?: { text: string; was: string; tone: 'up' | 'down' | 'flat' }
  digits?: number
}) {
  return (
    <div className="dy-card">
      <div className="dy-card__value">
        <Count value={value} format={(n) => (digits ? n.toFixed(digits) : spaced(n))} duration={650} />
        {unit ? <span className="dy-card__unit">{unit}</span> : null}
      </div>
      {compare ? (
        <div className="dy-card__compare" data-tone={compare.tone}>
          <span className="dy-card__delta"><Roll variant="fade">{compare.text}</Roll></span>
          <span className="dy-card__was"><Roll variant="fade">{compare.was}</Roll></span>
        </div>
      ) : null}
      <div className="dy-card__label">{label}</div>
    </div>
  )
}

export function ProgressRow({ label, value, goal, fill }: { label: string; value: number; goal: number; fill: number }) {
  return (
    <div className="dy-progress">
      <div className="dy-progress__head">
        <span className="dy-progress__label">{label}</span>
        <span className="dy-progress__value">{value} / {goal}<b>{Math.round((value / goal) * 100)}%</b></span>
      </div>
      <div className="dy-progress__track"><div className="dy-progress__fill" style={{ width: `${fill * 100}%` }} /></div>
    </div>
  )
}

export const dateKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Weeks start on Sunday and today sits in the last column, as in the real grid. */
export function Heatmap({ title, today, weeks, color, selected, cellTarget, cell = 15, gap = 3, legend, status }: {
  title: string
  today: string
  weeks: number
  color: (key: string) => string | undefined
  selected?: string
  cellTarget?: string
  cell?: number
  gap?: number
  legend: ReactNode
  status?: ReactNode
}) {
  const end = new Date(`${today}T00:00:00`)
  const start = new Date(end)
  start.setDate(start.getDate() - end.getDay() - 7 * (weeks - 1))
  const columns: { key: string; date: Date }[][] = []
  for (let w = 0; w < weeks; w++) {
    const col: { key: string; date: Date }[] = []
    for (let d = 0; d < 7; d++) {
      const date = new Date(start)
      date.setDate(start.getDate() + w * 7 + d)
      if (date <= end) col.push({ key: dateKey(date), date })
    }
    columns.push(col)
  }
  const pitch = cell + gap
  let lastMonth = -1
  return (
    <div className="dy-hm" style={{ ['--c' as string]: `${cell}px`, ['--g' as string]: `${gap}px` }}>
      <div className="dy-block-title">{title}</div>
      <div>
      <div className="dy-hm__body">
        <div className="dy-hm__days">
          {['', 'Mon', '', 'Wed', '', 'Fri', ''].map((d, i) => <span key={i}>{d}</span>)}
        </div>
        <div className="dy-hm__scroll">
          <div className="dy-hm__months">
            {columns.map((col, w) => {
              const m = col[0]!.date.getMonth()
              const show = m !== lastMonth && w > 0
              lastMonth = m
              return show ? <span key={w} style={w === weeks - 1 ? { right: 0 } : { left: w * pitch }}>{MONTHS[m]}</span> : null
            })}
          </div>
          <div className="dy-hm__grid">
            {columns.map((col, w) => (
              <div key={w} className="dy-hm__col">
                {col.map(({ key }) => (
                  <span
                    key={key}
                    className="dy-hm__cell"
                    style={{ background: color(key) ?? undefined }}
                    data-today={key === today || undefined}
                    data-selected={key === selected || undefined}
                    data-target={key === selected || (cellTarget && key === cellTarget) ? 'cell' : undefined}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      {status}
      <div className="dy-hm__legend">{legend}</div>
      </div>
    </div>
  )
}

export function Swatch({ color, children }: { color: string; children: ReactNode }) {
  return <span className="dy-hm__leg"><i style={{ background: color }} />{children}</span>
}

/** The real chart block's bars: a goal line, gridlines, the day under each bar. */
export function Bars({ values, labels, goal, max, height = 118 }: { values: number[]; labels: string[]; goal: number; max: number; height?: number }) {
  return (
    <div className="dy-chart" style={{ height }}>
      <div className="dy-chart__line" style={{ bottom: `${(goal / max) * 100}%` }} data-goal />
      <div className="dy-chart__line" style={{ bottom: '100%' }} />
      <div className="dy-chart__line" style={{ bottom: 0 }} />
      <span className="dy-chart__y" style={{ bottom: '100%' }}>{spaced(max)}</span>
      <span className="dy-chart__y" style={{ bottom: `${(goal / max) * 100}%` }}>{spaced(goal)}</span>
      <span className="dy-chart__y" style={{ bottom: 0 }}>0</span>
      <div className="dy-chart__bars">
        {values.map((v, i) => (
          <div key={i} className="dy-chart__slot">
            <div className="dy-chart__bar" style={{ height: `${(v / max) * 100}%` }} />
            <span className="dy-chart__x"><Roll variant="fade">{labels[i]!}</Roll></span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** The real chart block's default: a thin line with a dot on each day. */
export function LineChart({ values, labels, min, max, height = 130 }: { values: number[]; labels: string[]; min: number; max: number; height?: number }) {
  const W = 400
  const x = (i: number) => (i / (values.length - 1)) * W
  const y = (v: number) => height - ((v - min) / (max - min)) * height
  return (
    <div className="dy-chart" style={{ height }}>
      {[max, (max + min) / 2, min].map((v) => (
        <span key={v}>
          <div className="dy-chart__line" style={{ bottom: `${((v - min) / (max - min)) * 100}%` }} />
          <span className="dy-chart__y" style={{ bottom: `${((v - min) / (max - min)) * 100}%` }}>{v}</span>
        </span>
      ))}
      <svg className="dy-line" viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" aria-hidden>
        <polyline points={values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke="#4e81ee" strokeWidth="1.75" vectorEffect="non-scaling-stroke" />
      </svg>
      {values.map((v, i) => <i key={i} className="dy-line__dot" style={{ left: `${(i / (values.length - 1)) * 100}%`, bottom: `${((v - min) / (max - min)) * 100}%` }} />)}
      <div className="dy-line__x">{labels.map((l) => <span key={l}>{l}</span>)}</div>
    </div>
  )
}

// The same invented habit data in every film: a stable hash, so the cards count
// exactly the cells the grid paints.
const hash = (s: string): number => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13; h = Math.imul(h, 3266489917); h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

// Friday, Oct 9, 2026. Sun 4 and Mon 5 off, Tue to Thu on, today still open.
// The same six days last week hold three gym days, so `compare` reads "was 3".
const GYM_FIXED: Record<string, boolean> = {
  '2026-09-27': false, '2026-09-28': false, '2026-09-29': false, '2026-09-30': true,
  '2026-10-01': true, '2026-10-02': true, '2026-10-03': true, '2026-10-04': false,
  '2026-10-05': false, '2026-10-06': true, '2026-10-07': true, '2026-10-08': true,
}
export const GYM_TODAY = '2026-10-09'
export const gymOn = (key: string): boolean =>
  key < GYM_TODAY && (GYM_FIXED[key] ?? hash(key) < 0.58)
export const gymTotal = (() => {
  let n = 0
  for (const d = new Date('2026-01-01T00:00:00'); dateKey(d) < GYM_TODAY; d.setDate(d.getDate() + 1)) if (gymOn(dateKey(d))) n++
  return n
})()
export const ORANGE = '#e9a23b'

// `color: green` from core/palette.ts at the plugin's three band strengths
const BANDS = ['#22c55e', '#64d68e', '#a7e8bf']
export const SLEEP_TODAY = '2026-10-09'
/** Sleep score by day; Oct 6 is the night the phone film taps. */
export const sleepScore = (key: string): number | undefined => {
  if (key === '2026-10-06') return 88
  if (key > SLEEP_TODAY) return undefined
  const h = hash(`s${key}`)
  return h < 0.08 ? undefined : Math.round(70 + h * 27)
}
export const sleepColor = (key: string): string | undefined => {
  const v = sleepScore(key)
  if (v === undefined) return undefined
  return v >= 90 ? BANDS[0] : v >= 80 ? BANDS[1] : BANDS[2]
}
export const SLEEP_BANDS = BANDS

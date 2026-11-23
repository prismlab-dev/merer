import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  Calendar, CalendarCheck, ClockAlert, CalendarDays, CalendarRange, ChevronRight, Clock, Target, Hash, Hourglass, Inbox, Link2, ListFilter,
  ListTree, Lock, LockOpen, Pencil, ChevronsUp, ChevronUp, ChevronDown, Equal, Menu, Plus, Repeat, Search, Tag, Trash2, User, Users, X, Zap, CircleDashed, CircleCheck, Timer, Play, Pause, RotateCcw, SkipForward, TrendingUp, Sparkles, House, Pyramid, ChevronsLeft, ChevronsRight, StickyNote, Pin, PinOff, Settings, EllipsisVertical, Ellipsis, SquaresUnite, Columns3, Rows3, Table2, type LucideIcon,
} from 'lucide-react'
import { Tip } from './controls'
import { type Person, type Priority, type Status, type When, fmtDay, fmtWhen, isDone, progressOf } from './lib'

const ICONS = {
  inbox: Inbox, today: CalendarCheck, upcoming: CalendarDays, filter: ListFilter, more: EllipsisVertical, dots: Ellipsis, bolt: Zap,
  calendar: Calendar, clock: Clock, window: CalendarRange, deadline: Target, late: ClockAlert, repeat: Repeat, duration: Hourglass,
  tag: Tag, link: Link2, plus: Plus, search: Search, x: X, trash: Trash2, edit: Pencil, menu: Menu, subtasks: ListTree,
  hash: Hash, user: User, users: Users, chevron: ChevronRight, lock: Lock, unlock: LockOpen, progress: CircleDashed, done: CircleCheck, prioHighest: ChevronsUp, prioHigh: ChevronUp, prioMedium: Equal, prioLow: ChevronDown,
  timer: Timer, play: Play, pause: Pause, reset: RotateCcw, skip: SkipForward, trend: TrendingUp, sparkle: Sparkles, home: House, panel: ChevronsLeft, panelOpen: ChevronsRight, note: StickyNote, pin: Pin, unpin: PinOff, settings: Settings, teamProject: SquaresUnite, board: Columns3, list: Rows3, table: Table2,
} satisfies Record<string, LucideIcon>
export type IconName = keyof typeof ICONS
export function Icon({ name, className = 'size-4' }: { name: IconName; className?: string }) {
  const C = ICONS[name]
  return <C className={className} strokeWidth={1.75} aria-hidden />
}

export function Logo() {
  return <Pyramid className="size-6 text-iris" strokeWidth={1.75} aria-hidden />
}

/** Inbox, team project (merged view sets `team`; inside a team pass inTeam) or plain project. */
export const projectIcon = (p: { id: string; team?: unknown }, inTeam = false): IconName =>
  p.id === 'inbox' ? 'inbox' : inTeam || p.team ? 'teamProject' : 'hash'

export const PALETTE = {
  iris: 'var(--color-iris)', lagoon: 'var(--color-lagoon)', azure: 'var(--color-azure)', coral: 'var(--color-coral)', saffron: 'var(--color-saffron)', orchid: 'var(--color-orchid)',
}
export const PROJECT_COLORS = ['#e58ad6', '#9b8cff', '#5cb8ff', '#3dd6c3', '#f7c04a', '#ff7b8a']
// ponytail: module-level map set by App each render; move to context if tags ever render outside App
let tagColors: Record<string, string> = {}
let projectTagColors: Record<string, Record<string, string>> = {}
export const setTagColors = (m: Record<string, string>, byProject: Record<string, Record<string, string>>) => { tagColors = m; projectTagColors = byProject }
/** Colour for a tag: the one picked by the user (a team project's tags use that team's colours on every page), else a stable palette hash. */
export const colorFor = (s: string, projectId?: string) => (projectTagColors[projectId ?? ''] ?? tagColors)[s] ?? PROJECT_COLORS[[...s].reduce((h, c) => h + c.charCodeAt(0), 0) % PROJECT_COLORS.length]
export const tint = (c: string, pct = 14) => `color-mix(in oklab, ${c} ${pct}%, transparent)`

// Jira-style: double chevron up = highest, down = lowest.
export const PRIORITY: Record<Priority, { color: string; label: string; icon: IconName }> = {
  1: { color: PALETTE.coral, label: 'Urgente', icon: 'prioHighest' },
  2: { color: PALETTE.saffron, label: 'Alta', icon: 'prioHigh' },
  3: { color: PALETTE.azure, label: 'Média', icon: 'prioMedium' },
  4: { color: 'rgb(from var(--color-white) r g b / .45)', label: 'Baixa', icon: 'prioLow' },
}
export const priorityOptions = ([1, 2, 3, 4] as Priority[]).map(p => ({ value: p, label: PRIORITY[p].label, icon: PRIORITY[p].icon, color: PRIORITY[p].color }))
const DONE = PALETTE.iris

/**
 * The checkbox slot. Its shape tells the status type:
 * circle = checklist, filling ring = progress, segmented ring = stages, dashed clock = waiting on another task.
 */
export function StatusGlyph({ status, priority, blocked, size = 20 }: { status: Status; priority: Priority; blocked: boolean; size?: number }) {
  const c = PRIORITY[priority].color
  const r = 8, C = 2 * Math.PI * r
  const done = isDone(status)
  const ring = (dash: string, offset: number, stroke: string, key?: number) => (
    <circle key={key} cx="10" cy="10" r={r} fill="none" stroke={stroke} strokeWidth={2} strokeDasharray={dash} strokeDashoffset={offset}
      transform="rotate(-90 10 10)" strokeLinecap="butt" style={{ transition: 'stroke-dasharray .35s cubic-bezier(.22,1,.36,1)' }} />
  )
  let body: ReactNode
  if (blocked) {
    body = <>
      <circle cx="10" cy="10" r={r} fill="none" stroke="rgb(from var(--color-white) r g b / .28)" strokeWidth={1.5} strokeDasharray="2.4 2.4" />
      <path d="M10 6.6V10l2.2 1.4" fill="none" stroke="rgb(from var(--color-white) r g b / .55)" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
    </>
  } else if (done) {
    body = <>
      <circle cx="10" cy="10" r={9} fill={DONE} />
      <path d="M6.3 10.2 8.8 12.6l4.9-5.1" fill="none" stroke="var(--color-on)" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
    </>
  } else if (status.kind === 'check') {
    body = <>
      <circle cx="10" cy="10" r={r} fill={c} fillOpacity={priority < 4 ? 0.1 : 0} stroke={c} strokeWidth={1.6} />
      <path className="opacity-0 group-hover/glyph:opacity-100 transition-opacity" d="M6.6 10.2 8.8 12.3l4.6-4.7" fill="none" stroke={c} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </>
  } else if (status.kind === 'progress' || status.kind === 'subtasks') {
    const v = progressOf(status)
    body = <>
      {ring(`${C} 0`, 0, 'rgb(from var(--color-white) r g b / .1)')}
      {ring(`${C * v} ${C}`, 0, status.kind === 'subtasks' || priority === 4 ? PALETTE.iris : c)}
    </>
  } else {
    const n = status.stages.length - 1 // first stage is "not started"
    const gap = 1.6, seg = C / n - gap
    body = Array.from({ length: n }, (_, i) =>
      ring(`${seg} ${C - seg}`, -(i * C) / n - gap / 2, i < status.current ? (priority === 4 ? PALETTE.iris : c) : 'rgb(from var(--color-white) r g b / .12)', i))
  }
  return <svg viewBox="0 0 20 20" width={size} height={size} className="shrink-0" aria-hidden>{body}</svg>
}

export function Avatar({ person, size = 'size-5', bare }: { person: Person; size?: string; bare?: boolean }) {
  const initials = person.name.split(' ').map(w => w[0]).slice(0, 2).join('')
  const hue = [...person.id].reduce((h, ch) => h + ch.charCodeAt(0) * 37, 0) % 360
  const face = person.photo ? (
    <img src={person.photo} alt="" referrerPolicy="no-referrer" className={`${size} shrink-0 rounded-full object-cover ring-2 ring-canvas`} />
  ) : (
    <span className={`${size} inline-grid shrink-0 place-items-center rounded-full text-[9px] font-semibold ring-2 ring-canvas`}
      style={{ background: `oklch(0.42 0.08 ${hue})`, color: `oklch(0.92 0.05 ${hue})` }}>
      {initials}
    </span>
  )
  return bare ? face : <Tip label={person.name}>{face}</Tip>
}

export function Meta({ icon, children, tone = 'muted', title, color }: { icon?: IconName; children: ReactNode; tone?: 'muted' | 'rose' | 'amber' | 'sky' | 'emerald'; title?: string; color?: string }) {
  const tones = {
    muted: 'text-ink-3', rose: 'text-coral', amber: 'text-saffron', sky: 'text-azure', emerald: 'text-lagoon',
  }
  const body = (
    <span className={`inline-flex min-w-0 max-w-full items-center gap-1 text-xs whitespace-nowrap tabular-nums ${tones[tone]}`}>
      {icon && <span className="shrink-0" style={{ color }}><Icon name={icon} className="size-3.5" /></span>}
      {/* flex, not truncate: icons inside (e.g. repeat) are display:block and would drop to their own line. */}
      <span className="flex min-w-0 items-center">{children}</span>
    </span>
  )
  return title ? <Tip label={title}>{body}</Tip> : body
}

/** "Amanhã ─•─ Quarta": a short rule with a dot, read as "até". */
export function DateRange({ from, to }: { from: string; to: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {fmtDay(from)}
      <span aria-hidden className="relative inline-block h-px w-3 bg-current opacity-60">
        <span className="absolute top-1/2 left-1/2 size-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-current" />
      </span>
      <span className="sr-only">até</span>
      {fmtDay(to)}
    </span>
  )
}
export const WhenLabel = ({ w }: { w: When }) => w.kind === 'window' ? <DateRange from={w.start} to={w.end} /> : <>{fmtWhen(w)}</>

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium tracking-wider text-white/40 uppercase">{label}</span>
        {hint && <span className="text-[11px] text-white/35 tabular-nums">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex flex-wrap gap-0.5 rounded-[10px] border border-white/[0.06] bg-white/[0.02] p-0.5">
      {options.map(o => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={`rounded-[8px] px-2.5 py-1 text-xs transition-colors ${o.value === value ? 'bg-white/[0.1] text-white' : 'text-white/50 hover:text-white/80'}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export const inputCls = 'w-full rounded-[10px] border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-iris/60'
export const btnPrimary = 'inline-flex items-center gap-1.5 rounded-full bg-iris px-4 py-1.5 text-sm font-medium text-on hover:brightness-110 disabled:opacity-40'
export const btnTool = 'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-ink-2 transition-colors hover:bg-white/[0.07] hover:text-white'
export const btnGhost = 'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-white/60 hover:bg-white/[0.06] hover:text-white'

export function Dialog({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer: ReactNode }) {
  // Portal so a transformed/clipped ancestor can't trap the fixed overlay.
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/60 px-3 pt-[16vh] backdrop-blur-[2px]"
      onMouseDown={e => e.target === e.currentTarget && onClose()} onKeyDown={e => e.key === 'Escape' && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className="rise w-full max-w-md rounded-2xl border border-white/[0.08] bg-surface shadow-[0_24px_50px_-24px_rgba(0,0,0,0.9)]">
        <header className="flex items-center justify-between px-5 pt-4">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>
          <button type="button" aria-label="Fechar" onClick={onClose} className="grid size-8 place-items-center rounded-full text-ink-2 hover:bg-white/[0.06] hover:text-white"><Icon name="x" /></button>
        </header>
        <div className="space-y-4 px-5 py-4">{children}</div>
        <footer className="flex justify-end gap-2 border-t border-white/[0.06] px-5 py-3">{footer}</footer>
      </div>
    </div>,
    document.body,
  )
}

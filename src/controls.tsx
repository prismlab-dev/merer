// Own replacements for native form controls. One floating layer (Popover) backs Select, DateField, TimeField and Tip.
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as KE, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { WEEKDAYS, addDays, fmtDay, parseISO, today } from './lib'
import { DateRange, Icon, PALETTE, type IconName } from './ui'

// ---------- floating layer ----------
function useAnchorRect(anchor: HTMLElement | null, open: boolean) {
  const [rect, setRect] = useState<DOMRect | null>(null)
  useLayoutEffect(() => {
    if (!open || !anchor) return
    const update = () => setRect(anchor.getBoundingClientRect())
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => { window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update) }
  }, [anchor, open])
  return rect
}

export function Popover({ anchor, open, onClose, children, width, minWidth }:
  { anchor: HTMLElement | null; open: boolean; onClose: () => void; children: ReactNode; width?: number; minWidth?: boolean }) {
  const rect = useAnchorRect(anchor, open)
  const panel = useRef<HTMLDivElement>(null)
  const [h, setH] = useState(0)
  // Measure after each render so flipping above the anchor tracks content changes; same-value setState is a no-op.
  useLayoutEffect(() => { if (open && panel.current) setH(panel.current.offsetHeight) }) // oxlint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => {
      const t = e.target as Node
      if (!panel.current?.contains(t) && !anchor?.contains(t)) onClose()
    }
    // Capture so the Escape doesn't also close the dialog underneath.
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); anchor?.focus() } }
    document.addEventListener('mousedown', down)
    window.addEventListener('keydown', key, true)
    return () => { document.removeEventListener('mousedown', down); window.removeEventListener('keydown', key, true) }
  }, [open, anchor, onClose])
  if (!open || !rect) return null
  const w = width ?? rect.width
  const below = window.innerHeight - rect.bottom
  const top = below < h + 12 && rect.top > below ? rect.top - h - 6 : rect.bottom + 6
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - Math.max(w, minWidth ? rect.width : 0) - 8))
  return createPortal(
    <div ref={panel} className="pop fixed z-[80] overflow-hidden rounded-xl border border-white/[0.1] bg-raised shadow-[0_20px_45px_-20px_rgba(0,0,0,0.85)]"
      style={{ top, left, width: minWidth ? undefined : w, minWidth: minWidth ? Math.max(w, rect.width) : undefined }}>
      {children}
    </div>,
    document.body,
  )
}

/** The closed state shared by every popover field. */
function Trigger({ open, onClick, children, icon, color, ariaLabel, compact, setRef, placeholder }:
  { open: boolean; onClick: () => void; children?: ReactNode; icon?: IconName; color?: string; ariaLabel: string; compact?: boolean; setRef: (el: HTMLButtonElement | null) => void; placeholder?: string }) {
  return (
    <button ref={setRef} type="button" aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={open} onClick={onClick}
      className={`flex min-w-0 items-center gap-2 rounded-[10px] border text-left text-sm transition-colors ${compact ? 'px-2.5 py-1.5' : 'w-full px-3 py-2'} ${open ? 'border-iris/60 bg-white/[0.05]' : 'border-white/[0.08] bg-white/[0.03] hover:border-white/20'}`}>
      {icon && <span style={{ color }} className={color ? '' : 'text-ink-3'}><Icon name={icon} className="size-4" /></span>}
      <span className={`min-w-0 flex-1 truncate ${children ? 'text-white' : 'text-white/35'}`}>{children ?? placeholder}</span>
      <svg viewBox="0 0 24 24" className={`size-3.5 shrink-0 text-ink-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2}><path d="m6 9 6 6 6-6" /></svg>
    </button>
  )
}

// ---------- Select (menu suspenso) ----------
export interface Opt<V> { value: V; label: string; avatar?: ReactNode; icon?: IconName; color?: string; swatch?: string; hint?: string }

/**
 * One menu for every choice. `multi` keeps it open and toggles values (onChange gets the toggled one);
 * `onCreate` offers "Criar …" when the search has no exact match, Enter included.
 */
export function Select<V extends string | number | null>({ value, multi, options, onChange, onCreate, createNoun = 'item', ariaLabel, placeholder = 'Selecionar', searchable, compact, icon, width, footer, emptyText = 'Nada encontrado' }: {
  value?: V; multi?: V[]; options: Opt<V>[]; onChange: (v: V) => void; onCreate?: (label: string) => void; createNoun?: string
  ariaLabel: string; placeholder?: string; searchable?: boolean; compact?: boolean; icon?: IconName; width?: number; emptyText?: string
  footer?: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null)
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0)
  const list = useRef<HTMLDivElement>(null)
  const search = searchable ?? (options.length > 8 || !!onCreate)
  const needle = q.trim().toLowerCase()
  const shown = needle ? options.filter(o => o.label.toLowerCase().includes(needle)) : options
  const canCreate = !!onCreate && !!needle && !options.some(o => o.label.toLowerCase() === needle)
  const total = shown.length + (canCreate ? 1 : 0)
  const isSel = (v: V) => (multi ? multi.includes(v) : v === value)
  const cur = multi ? undefined : options.find(o => o.value === value)
  const chosen = multi ? options.filter(o => multi.includes(o.value)) : []
  const close = () => { setOpen(false); setQ('') }
  const pick = (o: Opt<V>) => { onChange(o.value); if (multi) return; close(); anchor?.focus() }
  const create = () => { onCreate!(q.trim()); setQ(''); setHi(0); if (!multi) { close(); anchor?.focus() } }

  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-i="${hi}"]`)?.scrollIntoView({ block: 'nearest' }) }, [hi, open])

  const onKey = (e: KE) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(i => Math.min(total - 1, i + 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHi(i => Math.max(0, i - 1)) }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (canCreate && (hi === shown.length || !shown.length)) create()
      else if (shown[hi]) pick(shown[hi])
    }
  }
  const mark = (o: Opt<V>) => o.avatar ? o.avatar : o.swatch
    ? <span className="size-3.5 shrink-0 rounded-full ring-1 ring-white/15" style={{ background: o.swatch }} />
    : o.icon ? <span style={{ color: o.color }} className={o.color ? '' : 'text-ink-3'}><Icon name={o.icon} className="size-4" /></span> : null

  return (
    <>
      <Trigger open={open} setRef={setAnchor} onClick={() => { if (open) return close(); setHi(Math.max(0, options.findIndex(o => o.value === value))); setOpen(true) }} ariaLabel={ariaLabel} compact={compact}
        icon={chosen.length ? undefined : cur?.icon ?? (cur?.swatch ? undefined : icon)} color={cur?.color} placeholder={placeholder}>
        {cur && <span className="flex items-center gap-2">{cur.swatch && mark(cur)}{cur.label}</span>}
        {chosen.length > 0 && (
          <span className="flex flex-wrap gap-1">
            {chosen.map(o => (
              <span key={String(o.value)} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-white"
                style={{ background: `color-mix(in oklab, ${o.color ?? 'var(--color-white)'} 16%, transparent)` }}>
                {o.avatar ?? (o.icon && <span style={{ color: o.color }}><Icon name={o.icon} className="size-3" /></span>)}{o.label}
              </span>
            ))}
          </span>
        )}
      </Trigger>
      <Popover anchor={anchor} open={open} onClose={close} width={width} minWidth={!width}>
        <div onKeyDown={onKey} role="listbox" aria-multiselectable={!!multi} aria-label={ariaLabel} tabIndex={-1} ref={el => { if (el && !search) el.focus() }} className="outline-none">
          {search && (
            <label className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2 text-white/40">
              <Icon name="search" className="size-3.5" />
              <input autoFocus value={q} onChange={e => { setQ(e.target.value); setHi(0) }} placeholder={onCreate ? `Buscar ou criar ${createNoun}` : 'Buscar'} aria-label={`Buscar em ${ariaLabel}`}
                className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30" />
            </label>
          )}
          <div ref={list} className="max-h-64 overflow-y-auto p-1">
            {shown.map((o, i) => {
              const sel = isSel(o.value)
              return (
                <button key={String(o.value)} data-i={i} type="button" role="option" aria-selected={sel} onMouseEnter={() => setHi(i)} onClick={() => pick(o)}
                  className={`flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-1.5 text-left text-sm ${i === hi ? 'bg-white/[0.07]' : ''} ${sel ? 'text-white' : 'text-white/75'}`}>
                  {mark(o)}
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.hint && <span className="shrink-0 text-xs text-white/35 tabular-nums">{o.hint}</span>}
                  {sel && <svg viewBox="0 0 24 24" className="size-3.5 shrink-0 text-iris" fill="none" stroke="currentColor" strokeWidth={2.4}><path d="M20 6 9 17l-5-5" /></svg>}
                </button>
              )
            })}
            {canCreate && (
              <button type="button" data-i={shown.length} onMouseEnter={() => setHi(shown.length)} onClick={create}
                className={`flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-1.5 text-left text-sm text-white ${hi === shown.length || !shown.length ? 'bg-iris/15' : ''}`}>
                <span className="text-iris"><Icon name="plus" className="size-4" /></span>
                <span className="min-w-0 flex-1 truncate">Criar {createNoun} “{q.trim()}”</span>
                <kbd className="rounded border border-white/10 px-1.5 text-[10px] text-white/40">Enter</kbd>
              </button>
            )}
            {!total && <p className="px-2.5 py-3 text-sm text-white/35">{emptyText}</p>}
          </div>
          {footer && <div className="border-t border-white/[0.06] p-3">{footer(close)}</div>}
        </div>
      </Popover>
    </>
  )
}

// ---------- Color (Select + custom) ----------
export const COLOR_OPTIONS: { name: string; hex: string }[] = [
  { name: 'Iris', hex: '#9b8cff' }, { name: 'Lavanda', hex: '#c4b5fd' }, { name: 'Ameixa', hex: '#b06ff0' },
  { name: 'Orquídea', hex: '#e58ad6' }, { name: 'Magenta', hex: '#f472b6' }, { name: 'Coral', hex: '#ff7b8a' },
  { name: 'Tomate', hex: '#ff6b4a' }, { name: 'Tangerina', hex: '#ff9f43' }, { name: 'Açafrão', hex: '#f7c04a' },
  { name: 'Limão', hex: '#d4e157' }, { name: 'Oliva', hex: '#a3b86c' }, { name: 'Menta', hex: '#6ee7a8' },
  { name: 'Lagoa', hex: '#3dd6c3' }, { name: 'Ciano', hex: '#4dd0e1' }, { name: 'Azure', hex: '#5cb8ff' },
  { name: 'Cobalto', hex: '#6b8cff' }, { name: 'Areia', hex: '#d6c3a5' }, { name: 'Ardósia', hex: '#94a3b8' },
]

const hslHex = (h: number, s: number, l: number) => {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100)
  const f = (n: number) => { const k = (n + h / 30) % 12; return Math.round(255 * (l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0') }
  return `#${f(0)}${f(8)}${f(4)}`
}

export function ColorField({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const known = COLOR_OPTIONS.find(c => c.hex === value)
  const [hue, setHue] = useState(250)
  const [light, setLight] = useState(70)
  const [hex, setHex] = useState(value)
  const options: Opt<string>[] = [
    ...COLOR_OPTIONS.map(c => ({ value: c.hex, label: c.name, swatch: c.hex })),
    ...(known ? [] : [{ value, label: `Personalizada ${value}`, swatch: value }]),
  ]
  return (
    <Select value={value} options={options} onChange={onChange} ariaLabel="Cor do projeto" searchable={false} width={280}
      footer={close => (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-white/45">
            <span>Cor personalizada</span>
            <span className="size-4 rounded-full ring-1 ring-white/20" style={{ background: hex }} />
          </div>
          <Slider ariaLabel="Matiz" value={hue} min={0} max={360} onChange={v => { setHue(v); setHex(hslHex(v, 85, light)) }}
            track="linear-gradient(90deg,#f66,#fd6,#6f6,#6ff,#66f,#f6f,#f66)" thumb={hslHex(hue, 85, light)} />
          <Slider ariaLabel="Luminosidade" value={light} min={45} max={85} onChange={v => { setLight(v); setHex(hslHex(hue, 85, v)) }}
            track={`linear-gradient(90deg,${hslHex(hue, 85, 45)},${hslHex(hue, 85, 85)})`} thumb={hslHex(hue, 85, light)} />
          <div className="flex gap-2">
            <input value={hex} onChange={e => setHex(e.target.value)} aria-label="Hex" spellCheck={false}
              className="min-w-0 flex-1 rounded-[8px] border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-sm tabular-nums text-white outline-none focus:border-iris/60" />
            <button type="button" disabled={!/^#[0-9a-f]{6}$/i.test(hex)} onClick={() => { onChange(hex.toLowerCase()); close() }}
              className="rounded-full bg-iris px-3 text-sm font-medium text-on disabled:opacity-40">Usar</button>
          </div>
        </div>
      )} />
  )
}

// ---------- DateField (single day or range) ----------
/** A shortcut shown inside the calendar: one day, or `to` for a range. */
export interface DatePreset { label: string; icon?: IconName; at: string; to?: string }
type DateProps =
  | { mode?: 'single'; value: string | null; onChange: (d: string | null) => void; clearable?: boolean }
  | { mode: 'range'; value: [string, string]; onChange: (r: [string, string]) => void; clearable?: never }

export function DateField(p: DateProps & { ariaLabel: string; placeholder?: string; min?: string; marks?: { date: string; color: string; label: string }[]; compact?: boolean; presets?: DatePreset[]; icon?: IconName }) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null)
  const range = p.mode === 'range'
  const sel = range ? p.value[0] : p.value
  const [month, setMonth] = useState(() => (sel ?? today()).slice(0, 7))
  const [pending, setPending] = useState<string | null>(null) // range start awaiting its end
  const [hover, setHover] = useState<string | null>(null)
  const t = today()

  const first = parseISO(month + '-01')
  const gridStart = addDays(month + '-01', -first.getDay())
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  const shift = (n: number) => { const d = new Date(first); d.setMonth(d.getMonth() + n); setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`) }
  const [rs, re] = range ? (pending ? [pending, hover && hover >= pending ? hover : pending] : p.value) : [sel, sel]

  const choose = (d: string) => {
    if (p.min && d < p.min) return
    if (!range) { p.onChange(d); setOpen(false); return }
    if (!pending) { setPending(d); return }
    p.onChange(d < pending ? [d, pending] : [pending, d]); setPending(null); setOpen(false)
  }
  const label = range ? <DateRange from={p.value[0]} to={p.value[1]} /> : p.value ? parseISO(p.value).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }) : undefined
  const quick: DatePreset[] = p.presets ?? [{ label: 'Hoje', at: t }, { label: 'Amanhã', at: addDays(t, 1) }, { label: '+1 semana', at: addDays(t, 7) }]
  const apply = (q: DatePreset) => { if (range) p.onChange([q.at, q.to ?? q.at]); else p.onChange(q.at); setOpen(false); setPending(null) }

  return (
    <>
      <Trigger open={open} setRef={setAnchor} onClick={() => { setOpen(o => !o); setPending(null); setMonth((sel ?? t).slice(0, 7)) }}
        ariaLabel={p.ariaLabel} icon={p.icon ?? (range ? 'window' : 'calendar')} compact={p.compact} placeholder={p.placeholder ?? 'Escolher data'}>
        {label}
      </Trigger>
      <Popover anchor={anchor} open={open} onClose={() => { setOpen(false); setPending(null) }} width={288}>
        <div className="p-3" onMouseLeave={() => setHover(null)}>
          <div className="mb-2 flex items-center justify-between">
            <button type="button" aria-label="Mês anterior" onClick={() => shift(-1)} className="grid size-7 place-items-center rounded-full text-ink-2 hover:bg-white/[0.06] hover:text-white"><Icon name="chevron" className="size-4 rotate-180" /></button>
            <span className="text-sm font-medium capitalize">{first.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</span>
            <button type="button" aria-label="Próximo mês" onClick={() => shift(1)} className="grid size-7 place-items-center rounded-full text-ink-2 hover:bg-white/[0.06] hover:text-white"><Icon name="chevron" className="size-4" /></button>
          </div>
          <div className="grid grid-cols-7 text-center text-[11px] text-white/35">{WEEKDAYS.map(d => <span key={d} className="py-1">{d.slice(0, 1).toUpperCase()}</span>)}</div>
          <div className="grid grid-cols-7 gap-y-0.5" role="grid">
            {cells.map(d => {
              const inMonth = d.slice(0, 7) === month
              const inRange = !!rs && !!re && d >= rs && d <= re
              const edge = d === rs || d === re
              const off = !!p.min && d < p.min
              const mk = p.marks?.find(m => m.date === d)
              return (
                <button key={d} type="button" disabled={off} onClick={() => choose(d)} onMouseEnter={() => setHover(d)}
                  aria-label={fmtDay(d) + (mk ? `, ${mk.label}` : '')} aria-pressed={edge}
                  className={`relative h-8 text-sm tabular-nums disabled:opacity-25 ${inRange && range ? 'bg-iris/15' : ''} ${d === rs && range ? 'rounded-l-full' : ''} ${d === re && range ? 'rounded-r-full' : ''}`}>
                  <span className={`mx-auto grid size-8 place-items-center rounded-full ${edge ? 'bg-iris font-semibold text-on' : inMonth ? 'text-white/85 hover:bg-white/[0.08]' : 'text-white/25 hover:bg-white/[0.05]'} ${d === t && !edge ? 'ring-1 ring-lagoon/70 ring-inset' : ''}`}>
                    {parseISO(d).getDate()}
                  </span>
                  {mk && <span className="absolute bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full" style={{ background: mk.color }} />}
                </button>
              )
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-white/[0.06] pt-3">
            {quick.map(q => (
              <button key={q.label} type="button" onClick={() => apply(q)}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.05] py-1 pr-2.5 pl-2 text-xs text-white/75 transition-colors hover:bg-iris/15 hover:text-white">
                <span className="text-iris"><Icon name={q.icon ?? (q.to ? 'window' : 'calendar')} className="size-3.5" /></span>{q.label}
              </button>
            ))}
            {range && <span className="basis-full text-xs text-white/45">{pending ? 'Escolha o último dia' : 'Ou escolha o primeiro dia'}</span>}
            {p.marks?.length ? <span className="ml-auto flex items-center gap-1.5 text-[11px] text-white/40">{p.marks.map(m => <span key={m.label} className="flex items-center gap-1"><span className="size-1.5 rounded-full" style={{ background: m.color }} />{m.label}</span>)}</span> : null}
            {!range && p.clearable && p.value && <button type="button" onClick={() => { p.onChange(null); setOpen(false) }} className="ml-auto text-xs text-white/45 hover:text-coral">Limpar</button>}
          </div>
        </div>
      </Popover>
    </>
  )
}

// ---------- TimeField ----------
const toMin = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m }
const toHHMM = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

export function TimeField({ value, onChange, ariaLabel, relativeTo, compact }: { value: string; onChange: (v: string) => void; ariaLabel: string; relativeTo?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null)
  const [typed, setTyped] = useState('')
  const start = relativeTo ? toMin(relativeTo) + 15 : 0
  const slots = Array.from({ length: Math.floor((24 * 60 - start) / 15) }, (_, i) => toHHMM(start + i * 15))
  const dur = (s: string) => { const d = toMin(s) - toMin(relativeTo!); return d < 60 ? `${d}min` : `${Math.floor(d / 60)}h${d % 60 ? String(d % 60).padStart(2, '0') : ''}` }
  const commit = () => {
    const m = typed.trim().match(/^(\d{1,2})(?:[:h]?(\d{2}))?$/)
    if (m && Number(m[1]) < 24 && Number(m[2] ?? 0) < 60) { onChange(`${m[1].padStart(2, '0')}:${m[2] ?? '00'}`); setOpen(false) }
  }
  return (
    <>
      <Trigger open={open} setRef={setAnchor} onClick={() => { setOpen(o => !o); setTyped('') }} ariaLabel={ariaLabel} icon="clock" compact={compact}>
        <span className="tabular-nums">{value}</span>
      </Trigger>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} width={relativeTo ? 180 : 150}>
        <input autoFocus value={typed} onChange={e => setTyped(e.target.value)} onKeyDown={e => e.key === 'Enter' && commit()} placeholder="Digitar 14:30" aria-label={`Digitar ${ariaLabel}`}
          className="w-full border-b border-white/[0.06] bg-transparent px-3 py-2 text-sm tabular-nums text-white outline-none placeholder:text-white/30" />
        <div className="max-h-56 overflow-y-auto p-1" ref={el => el?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'center' })}>
          {slots.map(s => (
            <button key={s} type="button" role="option" aria-selected={s === value} onClick={() => { onChange(s); setOpen(false) }}
              className={`flex w-full items-center justify-between rounded-[8px] px-2.5 py-1.5 text-sm tabular-nums ${s === value ? 'bg-iris/15 text-white' : 'text-white/70 hover:bg-white/[0.06]'}`}>
              {s}{relativeTo && <span className="text-xs text-white/35">{dur(s)}</span>}
            </button>
          ))}
        </div>
      </Popover>
    </>
  )
}

// ---------- Slider (range) ----------
export function Slider({ value, onChange, min = 0, max = 100, step = 1, ariaLabel, color = PALETTE.iris, track, thumb, marks, format }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; ariaLabel: string
  color?: string; track?: string; thumb?: string; marks?: number[]; format?: (v: number) => string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const pct = ((value - min) / (max - min)) * 100
  const at = (x: number) => {
    const r = ref.current!.getBoundingClientRect()
    const raw = min + Math.min(1, Math.max(0, (x - r.left) / r.width)) * (max - min)
    onChange(Math.round(raw / step) * step)
  }
  const key = (e: KE) => {
    const d = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step, PageUp: step * 5, PageDown: -step * 5 }[e.key]
    if (d) { e.preventDefault(); onChange(Math.min(max, Math.max(min, value + d))) }
    if (e.key === 'Home') onChange(min)
    if (e.key === 'End') onChange(max)
  }
  return (
    <div ref={ref} role="slider" tabIndex={0} aria-label={ariaLabel} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-valuetext={format?.(value)}
      onKeyDown={key}
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); at(e.clientX) }}
      onPointerMove={e => e.currentTarget.hasPointerCapture(e.pointerId) && at(e.clientX)}
      className="group relative flex h-5 flex-1 cursor-pointer touch-none items-center rounded-full">
      <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: track ?? 'rgb(from var(--color-white) r g b / .08)' }}>
        {!track && <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />}
      </div>
      {marks?.map(m => <span key={m} className={`absolute size-1 -translate-x-1/2 rounded-full ${m <= value ? 'bg-on/50' : 'bg-white/20'}`} style={{ left: `${((m - min) / (max - min)) * 100}%` }} />)}
      <span className="absolute size-4 -translate-x-1/2 rounded-full border-2 border-on shadow-[0_0_0_1px_rgb(from var(--color-white) r g b / .25)] transition-transform group-active:scale-110"
        style={{ left: `${pct}%`, background: thumb ?? color }} />
    </div>
  )
}

// ---------- Check (box or switch) ----------
export function Check({ checked, onChange, label, variant = 'box', color = PALETTE.iris, children }:
  { checked: boolean; onChange: (v: boolean) => void; label: string; variant?: 'box' | 'switch'; color?: string; children?: ReactNode }) {
  return (
    <button type="button" role={variant === 'switch' ? 'switch' : 'checkbox'} aria-checked={checked} aria-label={children ? undefined : label} onClick={() => onChange(!checked)}
      className="group inline-flex min-w-0 items-center gap-2.5 text-left">
      {variant === 'switch'
        ? <span className="relative h-5 w-9 shrink-0 rounded-full transition-colors" style={{ background: checked ? color : 'rgb(from var(--color-white) r g b / .12)' }}>
            <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-[left] ${checked ? 'left-[18px]' : 'left-0.5'}`} />
          </span>
        : <span className="grid size-[18px] shrink-0 place-items-center rounded-[6px] border transition-colors"
            style={{ background: checked ? color : 'transparent', borderColor: checked ? color : 'rgb(from var(--color-white) r g b / .22)' }}>
            {checked && <svg viewBox="0 0 24 24" className="size-3 text-on" fill="none" stroke="currentColor" strokeWidth={3.2}><path d="M20 6 9 17l-5-5" /></svg>}
          </span>}
      {children}
    </button>
  )
}

// ---------- NumberField ----------
export function NumberField({ value, onChange, min = 0, max = 9999, step = 1, ariaLabel, suffix, placeholder }:
  { value: number | null; onChange: (v: number | null) => void; min?: number; max?: number; step?: number; ariaLabel: string; suffix?: string; placeholder?: string }) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n))
  const btn = 'grid w-8 place-items-center text-white/50 hover:bg-white/[0.06] hover:text-white disabled:opacity-30'
  return (
    <div className="inline-flex h-9 items-stretch overflow-hidden rounded-[10px] border border-white/[0.08] bg-white/[0.03] focus-within:border-iris/60">
      <button type="button" aria-label="Diminuir" className={btn} disabled={(value ?? min) <= min} onClick={() => onChange(clamp((value ?? min) - step))}>−</button>
      <label className="flex items-center gap-1 border-x border-white/[0.06] px-2">
        <input inputMode="numeric" aria-label={ariaLabel} value={value ?? ''} placeholder={placeholder}
          onChange={e => { const v = e.target.value.replace(/\D/g, ''); onChange(v === '' ? null : clamp(Number(v))) }}
          onKeyDown={e => { if (e.key === 'ArrowUp') onChange(clamp((value ?? min) + step)); if (e.key === 'ArrowDown') onChange(clamp((value ?? min) - step)) }}
          className="w-10 bg-transparent text-center text-sm tabular-nums text-white outline-none placeholder:text-white/30" />
        {suffix && <span className="text-xs text-white/40">{suffix}</span>}
      </label>
      <button type="button" aria-label="Aumentar" className={btn} disabled={(value ?? min) >= max} onClick={() => onChange(clamp((value ?? min) + step))}>+</button>
    </div>
  )
}

// ---------- Tip (tooltip) ----------
export function Tip({ label, children, className = '' }: { label: ReactNode; children: ReactNode; className?: string }) {
  const [el, setEl] = useState<HTMLSpanElement | null>(null)
  const [show, setShow] = useState(false)
  const timer = useRef<number>(0)
  const rect = useAnchorRect(el, show)
  const on = () => { clearTimeout(timer.current); timer.current = window.setTimeout(() => setShow(true), 350) }
  const off = () => { clearTimeout(timer.current); setShow(false) }
  useEffect(() => () => clearTimeout(timer.current), [])
  return (
    <span ref={setEl} className={`inline-flex ${className}`} onMouseEnter={on} onMouseLeave={off} onFocus={on} onBlur={off} onMouseDown={off}>
      {children}
      {show && rect && createPortal(
        <span role="tooltip" className="fade pointer-events-none fixed z-[90] max-w-64 rounded-[8px] border border-white/[0.1] px-2 py-1 text-xs leading-snug text-white shadow-[0_10px_30px_-12px_rgba(0,0,0,.9)]"
          style={{ left: Math.min(window.innerWidth - 136, Math.max(136, rect.left + rect.width / 2)), top: rect.top > 40 ? rect.top - 6 : rect.bottom + 6, transform: `translate(-50%, ${rect.top > 40 ? '-100%' : '0'})`, background: `color-mix(in oklab, ${PALETTE.iris} 10%, var(--color-raised))` }}>
          {label}
        </span>,
        document.body,
      )}
    </span>
  )
}


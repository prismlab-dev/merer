import { createContext, useContext, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  type Automation, type Priority, type Task, IN_DAYS, projectMembers, addDays, iso, blockers, diffDays, fmtDay, fmtDuration, isDone, moveWhen, parseISO, progressOf, span, today, uid, WEEKDAYS,
} from './lib'
import { QuickAdd, QuickAddModal, SortableTask, TaskList, TaskRow, type Ctx } from './tasks'
import { Board, Drop, Kanban, KanbanCol, Sortable, useDrag, useRow } from './sortable'
import { Check, DateField, Popover, Select, Tip } from './controls'
import { Avatar, Dialog, Field, Icon, btnGhost, PALETTE, projectIcon, priorityOptions, btnPrimary, colorFor, inputCls, tint, type IconName } from './ui'

export type TeamTab = 'tasks' | 'projects' | 'filters' | 'tags' | 'automations' | 'members'
// `team` scopes a project/tag/filter/search page to that team's data.
export type View = (
  | { kind: 'home' } | { kind: 'today' } | { kind: 'upcoming' } | { kind: 'filters' } | { kind: 'tags' } | { kind: 'automations' } | { kind: 'projects' } | { kind: 'teams' } | { kind: 'notes'; focus?: string } | { kind: 'pomodoro' }
  | { kind: 'project'; id: string } | { kind: 'tag'; tag: string } | { kind: 'filter'; id: FilterId } | { kind: 'search'; q: string } | { kind: 'team'; id: string; tab?: TeamTab }
) & { team?: string }

export type FilterId = 'blocked' | 'moving' | 'deadline' | 'recurring' | 'done'
export const FILTERS: Record<FilterId, { label: string; icon: IconName; color: string; test: (t: Task, all: Task[]) => boolean }> = {
  moving: { label: 'Em andamento', icon: 'progress', color: PALETTE.iris, test: t => !isDone(t.status) && progressOf(t.status) > 0 },
  blocked: { label: 'Bloqueadas', icon: 'clock', color: PALETTE.saffron, test: (t, all) => !isDone(t.status) && blockers(t, all).length > 0 },
  deadline: { label: 'Prazo nos próximos 7 dias', icon: 'deadline', color: PALETTE.coral, test: t => !isDone(t.status) && !!t.deadline && diffDays(today(), t.deadline) <= 7 },
  recurring: { label: 'Recorrentes', icon: 'repeat', color: PALETTE.azure, test: t => !!t.recurrence },
  done: { label: 'Concluídas', icon: 'done', color: PALETTE.lagoon, test: t => isDone(t.status) },
}

const byTime = (a: Task, b: Task) => {
  const k = (t: Task) => (t.when ? span(t.when)[0] + (t.when.kind === 'time' ? t.when.time : t.when.kind === 'slot' ? t.when.from : '99') : '9') + (5 - t.priority)
  return k(a) < k(b) ? -1 : 1
}
const open = (ts: Task[]) => ts.filter(t => !isDone(t.status))

// App mounts two slots: `head` above the page card (title sits on the backdrop) and `bar`, the sticky page bar that holds the toolbar.
// false = the page is embedded under another header (team tabs): keep only its actions.
export const HeadSlot = createContext<{ head: HTMLElement; bar: HTMLElement } | null | false>(null)

// "Team · count" subtitle with room around the dot.
const withTeam = (team: string | undefined, rest: string) => team
  ? <span className="inline-flex items-center gap-2">{team}<span aria-hidden className="text-white/25">·</span>{rest}</span>
  : rest

export function Header({ title, sub, icon, color, children }: { title: ReactNode; sub?: ReactNode; icon?: IconName; color?: string; children?: ReactNode }) {
  const slot = useContext(HeadSlot)
  if (slot === false) return children ? <div role="toolbar" aria-label="Ações da página" className="order-last mt-4 flex flex-wrap items-center justify-end gap-1">{children}</div> : null
  const head = (
    <header className="mb-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-1 sm:mb-5">
      <div className="min-w-0">
        <h1 className="flex items-start gap-2.5 text-[30px] leading-tight font-semibold tracking-[-0.025em] sm:text-[34px]">
          {icon && color && <span className="page-glyph mt-1 grid size-8 shrink-0 place-items-center rounded-[10px]" style={{ '--c': color } as CSSProperties}><Icon name={icon} className="size-[18px]" /></span>}
          <span className="min-w-0 break-words">{title}</span>
        </h1>
        {sub && <div className="mt-1 text-sm text-ink-2 tabular-nums">{sub}</div>}
      </div>
    </header>
  )
  const tools = children && <div role="toolbar" aria-label="Ações da página" className="flex items-center gap-0.5">{children}</div>
  return slot ? <>{createPortal(head, slot.head)}{tools && createPortal(tools, slot.bar)}</> : <>{head}{tools}</>
}

const menuItem = 'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm text-white/75 hover:bg-white/[0.06] hover:text-white'
export const MenuLabel = ({ children }: { children: ReactNode }) => <div className="px-2.5 pt-2 pb-1 text-xs text-white/35">{children}</div>
export const MenuSep = () => <div className="my-1 h-px bg-white/[0.08]" />
// One row of a toolbar menu: a plain action, or a checkbox row when `checked` is given.
export function MenuItem({ icon, checked, danger, onClick, children }: { icon?: ReactNode; checked?: boolean; danger?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" role={checked === undefined ? 'menuitem' : 'menuitemcheckbox'} aria-checked={checked} onClick={onClick} className={`${menuItem} ${danger ? 'hover:!text-coral' : ''}`}>
      {icon}<span className="min-w-0 flex-1 truncate">{children}</span>
      {checked && <Icon name="done" className="size-4 shrink-0 text-iris" />}
    </button>
  )
}

/** Icon-only toolbar button that opens a menu. `active` dots it (a filter is on). Picking an item closes the menu unless `stay`. */
export function ToolMenu({ icon, label, active, stay, children }: { icon: IconName; label: string; active?: boolean; stay?: boolean; children: ReactNode }) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null)
  const [on, setOn] = useState(false)
  return (
    <>
      <button ref={setAnchor} type="button" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={on} onClick={() => setOn(v => !v)}
        className={`relative grid size-8 place-items-center rounded-[10px] transition-colors hover:bg-white/[0.07] hover:text-white ${on ? 'bg-white/[0.07] text-white' : active ? 'text-iris' : 'text-ink-2'}`}>
        <Icon name={icon} className="size-[17px]" />
        {active && <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-iris ring-2 ring-surface" />}
      </button>
      <Popover anchor={anchor} open={on} onClose={() => setOn(false)} width={232}>
        <div role="menu" aria-label={label} className="max-h-[60vh] overflow-y-auto p-1" onClick={e => { if (!stay && (e.target as HTMLElement).closest('[role^=menuitem]')) setOn(false) }}>{children}</div>
      </Popover>
    </>
  )
}

export function Group({ title, count, tone, children }: { title: string; count?: number; tone?: string; children: ReactNode }) {
  return (
    <section className="[section+&]:mt-10">
      <h2 className={`flex items-baseline gap-2 border-b border-white/[0.08] pb-2 text-sm font-semibold ${tone ?? 'text-white/85'}`}>
        {title}{count !== undefined && <span className="text-xs font-normal text-white/35 tabular-nums">{count}</span>}
      </h2>
      {children}
    </section>
  )
}

export function TodayView({ ctx }: { ctx: Ctx }) {
  const t = today()
  const roots = open(ctx.state.tasks.filter(x => !x.parentId))
  const overdue = roots.filter(x => (x.when && span(x.when)[1] < t) || (x.deadline && x.deadline < t)).sort(byTime)
  const late = new Set(overdue.map(x => x.id))
  const scheduled = roots.filter(x => !late.has(x.id) && x.when && x.when.kind !== 'window' && span(x.when)[0] === t).sort(byTime)
  const windows = roots.filter(x => !late.has(x.id) && x.when?.kind === 'window' && span(x.when)[0] <= t).sort(byTime)
  const due = roots.filter(x => !late.has(x.id) && x.deadline === t && !scheduled.includes(x) && !windows.includes(x))
  const minutes = [...scheduled, ...overdue].reduce((s, x) => s + (x.durationMin ?? 0), 0)
  return (
    <>
      <Header title="Hoje" icon="today" color={PALETTE.lagoon} sub={`${scheduled.length + overdue.length} tarefas${minutes ? ` · ${fmtDuration(minutes)} planejadas` : ''}`} />
      {overdue.length > 0 && <Group title="Atrasadas" count={overdue.length} tone="text-coral"><TaskList tasks={overdue} ctx={ctx} showProject /></Group>}
      <Group title="Agendadas para hoje" count={scheduled.length + due.length}>
        <TaskList tasks={[...scheduled, ...due]} ctx={ctx} showProject />
        <QuickAdd ctx={ctx} date={t} />
      </Group>
      {windows.length > 0 && (
        <Group title="Janelas abertas" count={windows.length} tone="text-azure">
          <p className="pt-2 text-xs text-white/40">Cabem em qualquer dia até o fim da janela.</p>
          <TaskList tasks={windows} ctx={ctx} showProject />
        </Group>
      )}
    </>
  )
}

const DAYS = 14
const longDay = (iso: string) => parseISO(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
function Day({ ctx, date, isToday, count, children }: { ctx: Ctx; date: string; isToday: boolean; count: number; children?: ReactNode }) {
  const [adding, setAdding] = useState(false)
  return (
    <section className="mb-5">
      <button type="button" onClick={() => setAdding(true)} aria-label={`Adicionar tarefa em ${longDay(date)}`}
        className={`group flex w-full items-center gap-2 border-b border-white/[0.08] pb-2 text-left text-sm font-semibold ${isToday ? 'text-white' : count ? 'text-white/85' : 'text-white/40 hover:text-white/70'}`}>
        {longDay(date)}
        {count > 0 && <span className="text-xs font-normal text-white/35 tabular-nums">{count}</span>}
        <span className="ml-auto grid size-5 place-items-center rounded-full text-iris opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"><Icon name="plus" className="size-3.5" /></span>
      </button>
      {children}
      {adding && <QuickAddModal onClose={() => setAdding(false)}><QuickAdd ctx={ctx} date={date} autoFocus onDone={() => setAdding(false)} /></QuickAddModal>}
    </section>
  )
}

type Span = 'week' | 'month' | 'custom'
const weekOf = (d: string): [string, string] => { const s = addDays(d, -((parseISO(d).getDay() + 6) % 7)); return [s, addDays(s, 6)] }
const monthOf = (d: string): [string, string] => { const x = parseISO(d); return [iso(new Date(x.getFullYear(), x.getMonth(), 1)), iso(new Date(x.getFullYear(), x.getMonth() + 1, 0))] }
const SPANS: [Span, string][] = [['week', 'Semana'], ['month', 'Mês'], ['custom', 'Personalizado']]

export function UpcomingView({ ctx }: { ctx: Ctx }) {
  const t = today()
  const [mode, setMode] = useState<Span>('week')
  const [range, setRange] = useState<[string, string]>(() => weekOf(t))
  const days = Array.from({ length: diffDays(range[0], range[1]) + 1 }, (_, i) => addDays(range[0], i))
  // Subtasks of a 'subtasks' parent ride under it, unless dated on another day — then they stand alone on theirs.
  const apart = (x: Task) => { const p = ctx.state.tasks.find(y => y.id === x.parentId); return p?.status.kind === 'subtasks' && (!p.when || span(p.when)[0] !== span(x.when!)[0]) }
  const roots = open(ctx.state.tasks.filter(x => x.when && (!x.parentId || apart(x))))
  const pick = (m: Span) => { setMode(m); if (m !== 'custom') setRange(m === 'week' ? weekOf(t) : monthOf(t)) }
  const step = (n: number) => setRange(([a, b]) => {
    if (mode === 'week') return weekOf(addDays(a, 7 * n))
    if (mode === 'month') { const x = parseISO(a); return monthOf(iso(new Date(x.getFullYear(), x.getMonth() + n, 1))) }
    const len = diffDays(a, b) + 1
    return [addDays(a, len * n), addDays(b, len * n)]
  })
  const onToday = t >= range[0] && t <= range[1]
  const label = mode === 'month' ? parseISO(range[0]).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : `${fmtDay(range[0])} até ${fmtDay(range[1])}`
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null)
  const [menu, setMenu] = useState(false)
  const [board, setBoard] = useState(() => { try { return localStorage.getItem('upcoming-board') === '1' } catch { return false } })
  const toggleBoard = () => setBoard(b => { try { localStorage.setItem('upcoming-board', b ? '0' : '1') } catch { /* private mode */ } return !b })
  const goToday = () => setRange(mode === 'month' ? monthOf(t) : mode === 'week' ? weekOf(t) : [t, addDays(t, diffDays(range[0], range[1]))])
  const nav = 'grid size-7 place-items-center rounded-full text-white/55 hover:bg-white/[0.07] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-iris'
  const item = 'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-white/75 hover:bg-white/[0.06] hover:text-white disabled:pointer-events-none disabled:opacity-30'
  const control = (
    <span className="mt-1.5 inline-flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.03] p-0.5">
        <button type="button" aria-label="Período anterior" onClick={() => step(-1)} className={nav}><Icon name="chevron" className="size-3.5 rotate-180" /></button>
        <button ref={setAnchor} type="button" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(m => !m)}
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm ${menu ? 'bg-white/[0.07] text-white' : 'text-white/80 hover:text-white'}`}>
          <span className="inline-block first-letter:uppercase">{label}</span>
          <svg viewBox="0 0 24 24" className={`size-3 text-ink-3 transition-transform ${menu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2}><path d="m6 9 6 6 6-6" /></svg>
        </button>
        <button type="button" aria-label="Próximo período" onClick={() => step(1)} className={nav}><Icon name="chevron" className="size-3.5" /></button>
      </span>
      {mode === 'custom' && <DateField mode="range" compact ariaLabel="Intervalo" value={range} onChange={setRange} />}
      <Popover anchor={anchor} open={menu} onClose={() => setMenu(false)} width={200}>
        <div role="menu" aria-label="Período" className="p-1">
          <button type="button" role="menuitem" disabled={onToday} onClick={() => { goToday(); setMenu(false) }} className={item}>
            <Icon name="today" className="size-4 text-lagoon" />Ir para hoje
          </button>
          <div className="my-1 h-px bg-white/[0.08]" />
          {SPANS.map(([m, l]) => (
            <button key={m} type="button" role="menuitemradio" aria-checked={mode === m} onClick={() => { pick(m); setMenu(false) }} className={item}>
              <span className="flex-1">{l}</span>
              {mode === m && <Icon name="done" className="size-4 text-iris" />}
            </button>
          ))}
        </div>
      </Popover>
    </span>
  )
  return (
    <>
      <Header title="Em breve" icon="upcoming" color={PALETTE.iris} sub={control}>
        <button type="button" aria-pressed={board} aria-label={board ? 'Ver em lista' : 'Ver em colunas'} title={board ? 'Ver em lista' : 'Ver em colunas'} onClick={toggleBoard}
          className="grid size-8 place-items-center rounded-[10px] text-ink-2 transition-colors hover:bg-white/[0.07] hover:text-white">
          <Icon name={board ? 'list' : 'board'} className="size-[17px]" />
        </button>
      </Header>
      {(() => {
        const dayList = (d: string) => roots.filter(x => x.when!.kind !== 'window' ? span(x.when!)[0] === d : span(x.when!)[0] === d || (d === t && span(x.when!)[0] < t)).sort(byTime)
        // Past days fold into one "Atrasadas" lane that's always shown; windows still running sit on today instead.
        const late = roots.filter(x => x.when!.kind !== 'window' && span(x.when!)[0] < t).sort(byTime)
        const shown = days.filter(d => d >= t).map(d => [d, dayList(d)] as const)
        const moveTo = (id: string, d: string) => {
          if (d === 'late') return
          const x = ctx.state.tasks.find(x => x.id === id)
          if (x?.when && span(x.when)[0] !== d) ctx.dispatch({ type: 'update', id, patch: { when: moveWhen(x.when, d) } })
        }
        // Same lanes as a project's board view, one per day; order inside a day stays by time.
        if (board) return (
          <Kanban cols={Object.fromEntries([['late', late.map(x => x.id)], ...shown.map(([d, l]) => [d, l.map(x => x.id)])])} onColDrop={() => {}} onDrop={(id, d) => moveTo(id, d)}
            overlay={id => { const x = roots.find(r => r.id === id); return x && <div className="float cursor-grabbing overflow-hidden rounded-2xl py-0.5 rotate-[1.5deg] shadow-[0_24px_48px_-18px_rgba(0,0,0,.95)] ring-1 ring-iris/40"><TaskRow task={x} ctx={ctx} showProject /></div> }}>
            {(cols, over) => (
            <div className="board -mx-3 flex min-h-[60vh] flex-1 snap-x items-stretch gap-4 overflow-x-auto px-3 pb-4 scroll-px-3 sm:-mx-5 sm:px-5 sm:scroll-px-5 lg:-mr-9 lg:-ml-8 lg:pr-9 lg:pl-8 lg:scroll-pl-8">
              {Object.keys(cols).map(d => {
                const col = cols[d].map(x => roots.find(r => r.id === x)!).filter(Boolean)
                const hot = over === d
                return (
                  <div key={d} className={`group/col flex w-[300px] shrink-0 snap-start flex-col transition-opacity duration-200 ${over && !hot ? 'opacity-45' : ''}`}>
                    <Drop id={d} active={hot} fill>
                      <h2 className={`flex items-center gap-2 border-b py-2 text-sm font-semibold transition-[color,border-color,box-shadow] ${hot ? 'border-iris text-white shadow-[inset_0_-2px_0_var(--color-iris)]' : 'border-white/[0.08]'} ${d === 'late' ? 'text-coral' : d === t ? 'text-white' : col.length ? 'text-white/85' : 'text-white/50'}`}>
                        <span className="min-w-0 flex-1 truncate first-letter:uppercase">{d === 'late' ? 'Atrasadas' : longDay(d)}</span>
                        <span className="text-xs font-normal text-white/35 tabular-nums">{col.length}</span>
                      </h2>
                      <KanbanCol id={d} ids={cols[d]}>
                        {col.length > 0 && <div className="space-y-1 pt-3">{col.map(x => <SortableTask key={x.id} task={x} ctx={ctx} showProject card />)}</div>}
                      </KanbanCol>
                      {d !== 'late' && <div className="transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/col:opacity-100 [@media(hover:hover)]:focus-within:opacity-100">
                        <QuickAdd ctx={ctx} date={d} />
                      </div>}
                    </Drop>
                  </div>
                )
              })}
            </div>
            )}
          </Kanban>
        )
        return (
          <Board onDrop={moveTo}>
            <section className="mb-5">
              <h2 className="flex items-center gap-2 border-b border-white/[0.08] pb-2 text-sm font-semibold text-coral">
                Atrasadas{late.length > 0 && <span className="text-xs font-normal text-white/35 tabular-nums">{late.length}</span>}
              </h2>
              {late.length > 0 ? <TaskList tasks={late} ctx={ctx} showProject draggable /> : <p className="pt-2 text-xs text-white/40">Nada atrasado.</p>}
            </section>
            {shown.map(([d, list]) => (
              <Drop key={d} id={d}>
                <Day ctx={ctx} date={d} isToday={d === t} count={list.length}>
                  {list.length > 0 && <TaskList tasks={list} ctx={ctx} showProject draggable />}
                </Day>
              </Drop>
            ))}
          </Board>
        )
      })()}
    </>
  )
}

export function UpcomingWindows({ ctx }: { ctx: Ctx }) {
  const t = today()
  const days = Array.from({ length: DAYS }, (_, i) => addDays(t, i))
  const windows = open(ctx.state.tasks.filter(x => !x.parentId && x.when?.kind === 'window' && span(x.when)[1] >= t && span(x.when)[0] <= days[DAYS - 1]))
  return (
    <>
      <h2 className="mb-3 text-sm font-semibold text-white/85">Janelas</h2>
      {windows.length > 0 && (
        <section className="overflow-x-auto">
          <div className="min-w-[560px]">
            <div className="grid gap-px text-center text-[11px] text-white/40 tabular-nums" style={{ gridTemplateColumns: `180px repeat(${DAYS}, 1fr)` }}>
              <span />
              {days.map(d => {
                const dd = parseISO(d)
                return <span key={d} className={d === t ? 'text-white' : dd.getDay() % 6 === 0 ? 'text-white/25' : ''}>{WEEKDAYS[dd.getDay()].slice(0, 3)}<br />{dd.getDate()}</span>
              })}
            </div>
            {windows.map(w => {
              const [s, e] = span(w.when!)
              const a = Math.max(0, diffDays(t, s)), b = Math.min(DAYS - 1, diffDays(t, e))
              const dl = w.deadline ? diffDays(t, w.deadline) : -1
              const c = ctx.state.projects.find(p => p.id === w.projectId)?.color ?? PALETTE.azure
              return (
                <button key={w.id} type="button" onClick={() => ctx.open(w.id)} className="mt-1.5 grid w-full items-center gap-px text-left hover:bg-white/[0.02]"
                  style={{ gridTemplateColumns: `180px repeat(${DAYS}, 1fr)` }}>
                  <span className="truncate pr-3 text-xs text-white/75">{w.title}</span>
                  <span className="relative h-5 rounded-full" style={{ gridColumn: `${a + 2} / ${b + 3}`, background: tint(c, 24), boxShadow: `inset 0 0 0 1px ${tint(c, 55)}` }}>
                    {w.status.kind === 'progress' && <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${w.status.value}%`, background: tint(c, 45) }} />}
                  </span>
                  {dl >= 0 && dl < DAYS && <span className="justify-self-center text-coral" style={{ gridColumn: dl + 2, gridRow: 1 }}><Tip label={`Prazo ${fmtDay(w.deadline!)}`}><Icon name="deadline" className="size-3.5" /></Tip></span>}
                </button>
              )
            })}
          </div>
        </section>
      )}
      {windows.length === 0 && <p className="text-xs text-white/40">Nenhuma janela nos próximos {DAYS} dias.</p>}
    </>
  )
}

// Looks like the heading until hovered/focused; Enter or blur saves, Esc or an empty name reverts.
// A section that drags by its header; the "none" column stays put.
function DragSection({ id, as: Tag = 'div', className, children }: { id: string; as?: 'div' | 'section'; className?: string; children: (handle: object) => ReactNode }) {
  const { ref, style, handle, dragging } = useDrag('sec:' + id)
  return <Tag ref={ref} style={style} className={`${className} ${dragging ? 'opacity-80' : ''}`}>{children(id === 'none' ? {} : { ...handle, className: undefined, style: { cursor: 'grab' } })}</Tag>
}

// Keeps typing/selecting in the name input from starting a section drag (Space would pick it up).
const Inert = ({ children }: { children: ReactNode }) => <span onPointerDown={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>{children}</span>

export function NameField({ value, onSave, label = 'Nome do projeto' }: { value: string; onSave: (v: string) => void; label?: string }) {
  const [v, setV] = useState(value)
  const commit = () => { const n = v.trim(); if (n && n !== value) onSave(n); else setV(value) }
  return (
    // An invisible copy of the text sizes the cell and the input fills it; always one line, long names scroll inside.
    <span className="-mx-1.5 inline-grid max-w-full grid-cols-[minmax(0,auto)] align-top">
      <span aria-hidden className="invisible col-start-1 row-start-1 overflow-hidden pr-5 pl-1.5 whitespace-pre">{v || ' '}</span>
      <input value={v} aria-label={label} spellCheck={false}
        onChange={e => setV(e.target.value)} onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setV(value); requestAnimationFrame(() => (e.target as HTMLInputElement).blur()) } }}
        className="col-start-1 row-start-1 w-full min-w-0 truncate rounded-[10px] bg-transparent px-1.5 outline-none transition-colors hover:bg-white/[0.04] focus:bg-white/[0.06] focus:shadow-[inset_0_0_0_1px_rgb(from_var(--color-iris)_r_g_b/.5)]" />
    </span>
  )
}

export function ProjectView({ ctx, id, onDeleted, onEdit, people, team }: { ctx: Ctx; id: string; onDeleted: () => void; onEdit: () => void; people?: ReactNode; team?: string }) {
  const [showDone, setShowDone] = useState(false)
  const [who, setWho] = useState<string[]>([]) // '' = no assignee
  const [newName, setNewName] = useState<string | null>(null) // null = dialog closed
  const [del, setDel] = useState<{ id: string; name: string } | null>(null)
  const p = ctx.state.projects.find(x => x.id === id)
  if (!p) return null
  const roots = ctx.state.tasks.filter(x => x.projectId === id && !x.parentId)
  const done = roots.filter(x => isDone(x.status))
  const list = (showDone ? roots : open(roots)).filter(t => !who.length || who.some(w => w ? t.assignees.includes(w) : !t.assignees.length))
  const sections = p.sections ?? []
  const loose = list.filter(t => !sections.some(s => s.id === t.section))
  const saveSections = (sections: { id: string; name: string }[]) => ctx.dispatch({ type: 'saveProject', project: { ...p, sections } })
  // Section drags carry a "sec:" id; dropping on another section takes its place ("none" = the front).
  const moveSection = (from: string, to: string | null) => {
    const next = sections.filter(x => x.id !== from), i = to ? sections.findIndex(x => x.id === to) : 0
    if (from !== to && i >= 0) saveSections([...next.slice(0, i), sections.find(x => x.id === from)!, ...next.slice(i)])
  }
  const pick = (w: string) => setWho(ws => ws.includes(w) ? ws.filter(x => x !== w) : [...ws, w])
  return (
    <>
      <Header title={p.id === 'inbox' ? p.name : <NameField key={p.name} value={p.name} onSave={name => ctx.dispatch({ type: 'saveProject', project: { ...p, name } })} />} icon={projectIcon(p, ctx.state.people.length > 0)} color={p.color} sub={withTeam(team, `${roots.length - done.length} tarefa${roots.length - done.length === 1 ? '' : 's'}`)}>
        <ToolMenu icon="filter" label="Filtros" active={showDone || who.length > 0} stay>
          <MenuItem checked={showDone} onClick={() => setShowDone(v => !v)}>Mostrar concluídas</MenuItem>
          {ctx.state.people.length > 0 && <>
            <MenuSep /><MenuLabel>Responsável</MenuLabel>
            {ctx.state.people.map(x => <MenuItem key={x.id} icon={<Avatar person={x} size="size-5" bare />} checked={who.includes(x.id)} onClick={() => pick(x.id)}>{x.name}</MenuItem>)}
            <MenuItem icon={<span className="size-5" />} checked={who.includes('')} onClick={() => pick('')}>Sem responsável</MenuItem>
          </>}
          {(showDone || who.length > 0) && <><MenuSep /><MenuItem onClick={() => { setShowDone(false); setWho([]) }}>Limpar filtros</MenuItem></>}
        </ToolMenu>
        <button type="button" aria-pressed={!!p.board} aria-label={p.board ? 'Ver em lista' : 'Ver em colunas'} title={p.board ? 'Ver em lista' : 'Ver em colunas'}
          onClick={() => ctx.dispatch({ type: 'saveProject', project: { ...p, board: !p.board } })}
          className="grid size-8 place-items-center rounded-[10px] text-ink-2 transition-colors hover:bg-white/[0.07] hover:text-white">
          <Icon name={p.board ? 'list' : 'board'} className="size-[17px]" />
        </button>
        {(p.id !== 'inbox' || people) && <ToolMenu icon="more" label="Mais ações">
          {p.id !== 'inbox' && <MenuItem icon={<Icon name="edit" className="size-4 text-ink-3" />} onClick={onEdit}>Editar projeto</MenuItem>}
          {p.id !== 'inbox' && <MenuItem danger icon={<Icon name="trash" className="size-4 text-ink-3" />} onClick={() => confirm(`Excluir o projeto “${p.name}” e suas ${roots.length} tarefas?`) && (ctx.dispatch({ type: 'removeProject', id }), onDeleted())}>Excluir projeto</MenuItem>}
          {people}
        </ToolMenu>}
      </Header>
      {p.board ? (
        // Columns: "Sem seção" (while it has tasks) then each section. Cards make room live while one is held.
        <Kanban cols={Object.fromEntries([...(loose.length || !sections.length ? [['none', loose]] as const : []), ...sections.map(x => [x.id, list.filter(t => t.section === x.id)] as const)].map(([k, ts]) => [k, ts.map(t => t.id)]))}
          onColDrop={(sid, col) => moveSection(sid, col === 'none' ? null : col)}
          onDrop={(tid, col, ids) => {
            const section = col === 'none' ? null : col
            if ((list.find(t => t.id === tid)?.section ?? null) !== section) ctx.dispatch({ type: 'update', id: tid, patch: { section } })
            // Global reorder moves into the target's slot: going down, land after the card above; going up, before the card below.
            const g = (x: string) => ctx.state.tasks.findIndex(t => t.id === x), k = ids.indexOf(tid), prev = ids[k - 1], next = ids[k + 1]
            if (prev && g(tid) < g(prev)) ctx.dispatch({ type: 'reorder', list: 'tasks', from: tid, to: prev })
            else if (next && g(tid) > g(next)) ctx.dispatch({ type: 'reorder', list: 'tasks', from: tid, to: next })
          }}
          overlay={tid => { const t = list.find(x => x.id === tid); return t && <div className="float cursor-grabbing overflow-hidden rounded-2xl py-0.5 rotate-[1.5deg] shadow-[0_24px_48px_-18px_rgba(0,0,0,.95)] ring-1 ring-iris/40"><TaskRow task={t} ctx={ctx} /></div> }}>
          {(cols, over) => (
          <div className="board -mx-3 flex min-h-[60vh] flex-1 snap-x items-stretch gap-4 overflow-x-auto px-3 pb-4 scroll-px-3 sm:-mx-5 sm:px-5 sm:scroll-px-5 lg:-mr-9 lg:-ml-8 lg:pr-9 lg:pl-8 lg:scroll-pl-8">
            {Object.keys(cols).map(k => {
              const s = k === 'none' ? { id: 'none', name: 'Sem seção' } : sections.find(x => x.id === k)!
              const col = cols[k].map(x => list.find(t => t.id === x)!).filter(Boolean)
              const hot = over === k
              return (
                <DragSection key={s.id} id={s.id} className={`group/col flex w-[300px] shrink-0 snap-start flex-col transition-opacity duration-200 ${over && !hot ? 'opacity-45' : ''}`}>{handle => <>
                  <Drop id={s.id} active={hot} fill>
                    <h2 {...handle} className={`flex items-center gap-2 border-b py-2 text-sm font-semibold transition-[color,border-color,box-shadow] ${hot ? 'border-iris text-white shadow-[inset_0_-2px_0_var(--color-iris)]' : 'border-white/[0.08] text-white/85'}`}>
                      <span className="min-w-0 flex-1">{s.id === 'none' ? <span className="text-white/50">{s.name}</span>
                        : <Inert><NameField key={s.name} value={s.name} label="Nome da seção" onSave={name => saveSections(sections.map(x => x.id === s.id ? { ...x, name } : x))} /></Inert>}</span>
                      <span className="text-xs font-normal text-white/35 tabular-nums">{col.length}</span>
                      {s.id !== 'none' && <button type="button" aria-label={`Excluir seção ${s.name}`} title="Excluir seção" onClick={() => setDel(s)}
                        className="rounded-md p-1 text-white/30 hover:bg-white/[0.06] hover:text-white/70 focus-visible:outline-2"><Icon name="trash" className="size-4" /></button>}
                    </h2>
                    <KanbanCol id={s.id} ids={cols[k]}>
                      {col.length > 0 && <div className="space-y-1 pt-3">{col.map(t => <SortableTask key={t.id} task={t} ctx={ctx} card />)}</div>}
                    </KanbanCol>
                    {/* Hover-only on pointer devices; stays visible while typing and on touch screens. */}
                    <div className="transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/col:opacity-100 [@media(hover:hover)]:focus-within:opacity-100">
                      <QuickAdd ctx={ctx} projectId={id} section={s.id === 'none' ? undefined : s.id} />
                    </div>
                  </Drop>
                </>}</DragSection>
              )
            })}
            <button type="button" onClick={() => setNewName('')} aria-label="Adicionar seção" title="Adicionar seção"
              className="mt-1 grid size-9 shrink-0 place-items-center self-start rounded-full border border-dashed border-white/[0.15] text-white/40 hover:border-white/30 hover:text-white/75">
              <Icon name="plus" className="size-4" />
            </button>
          </div>
          )}
        </Kanban>
      ) : <>
      {/* One sortable across all sections: dropping on a task takes its place and its section; on an empty section's slot, just the section. */}
      <Sortable ids={[...loose, ...sections.flatMap(s => list.filter(t => t.section === s.id))].map(t => t.id)} onMove={(from, to) => {
        const target = list.find(t => t.id === to)
        if (from.startsWith('sec:')) return moveSection(from.slice(4), target ? target.section ?? null : to.replace(/^(drop|sec):/, ''))
        const section = target ? (sections.some(s => s.id === target.section) ? target.section! : null) : to.slice(5)
        if ((list.find(t => t.id === from)?.section ?? null) !== section) ctx.dispatch({ type: 'update', id: from, patch: { section } })
        if (target) ctx.dispatch({ type: 'reorder', list: 'tasks', from, to })
      }}>
      {/* The section-less area only shows while it has tasks (or there are no sections at all). */}
      {(loose.length > 0 || !sections.length) && <>
        <div>{loose.map(t => <SortableTask key={t.id} task={t} ctx={ctx} />)}</div>
        <QuickAdd ctx={ctx} projectId={id} />
      </>}
      {sections.map(s => (
        <DragSection key={s.id} id={s.id} as="section" className="mt-10 first:mt-0">{handle => <>
          <h2 {...handle} className="flex items-center gap-2 border-b border-white/[0.08] pb-2 text-sm font-semibold text-white/85">
            <span className="min-w-0 flex-1"><Inert><NameField key={s.name} value={s.name} label="Nome da seção" onSave={name => saveSections(sections.map(x => x.id === s.id ? { ...x, name } : x))} /></Inert></span>
            <span className="text-xs font-normal text-white/35 tabular-nums">{list.filter(t => t.section === s.id).length}</span>
            <button type="button" aria-label={`Excluir seção ${s.name}`} title="Excluir seção (as tarefas ficam no projeto)" onClick={() => setDel(s)}
              className="rounded-md p-1 text-white/30 hover:bg-white/[0.06] hover:text-white/70 focus-visible:outline-2"><Icon name="trash" className="size-4" /></button>
          </h2>
          {list.some(t => t.section === s.id)
            ? <div>{list.filter(t => t.section === s.id).map(t => <SortableTask key={t.id} task={t} ctx={ctx} />)}</div>
            : <Drop id={'drop:' + s.id}><p className="py-3 text-sm text-white/30">Arraste tarefas para cá</p></Drop>}
          <QuickAdd ctx={ctx} projectId={id} section={s.id} />
        </>}</DragSection>
      ))}
      </Sortable>
      <div className="mt-8 flex items-center gap-3 before:h-px before:flex-1 before:bg-white/[0.08] after:h-px after:flex-1 after:bg-white/[0.08]">
        <button type="button" onClick={() => setNewName('')} aria-label="Adicionar seção" title="Adicionar seção"
          className="grid size-8 place-items-center rounded-full border border-dashed border-white/[0.15] text-white/40 hover:border-white/30 hover:text-white/75">
          <Icon name="plus" className="size-4" />
        </button>
      </div>
      </>}
      {newName !== null && <Dialog title="Nova seção" onClose={() => setNewName(null)} footer={<>
        <button type="button" className={btnGhost} onClick={() => setNewName(null)}>Cancelar</button>
        <button type="submit" form="new-section" className={btnPrimary} disabled={!newName.trim()}>Criar seção</button>
      </>}>
        <form id="new-section" onSubmit={e => { e.preventDefault(); if (newName.trim()) { saveSections([...sections, { id: uid(), name: newName.trim() }]); setNewName(null) } }}>
          <input autoFocus value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ex.: Em andamento, Ideias, Revisão" aria-label="Nome da seção" className={inputCls} />
        </form>
      </Dialog>}
      {del && <Dialog title="Excluir seção" onClose={() => setDel(null)} footer={<>
        <button type="button" className={btnGhost} onClick={() => setDel(null)}>Cancelar</button>
        <button type="button" autoFocus className={`${btnPrimary} !bg-coral`} onClick={() => { saveSections(sections.filter(x => x.id !== del.id)); setDel(null) }}>Excluir seção</button>
      </>}>
        <p className="text-sm text-white/70">“{del.name}” será removida. As tarefas dela continuam no projeto, sem seção.</p>
      </Dialog>}
    </>
  )
}

export function ListView({ ctx, title, tasks, icon, color, team, onDelete, onEdit }: { ctx: Ctx; title: ReactNode; tasks: Task[]; icon?: IconName; color?: string; team?: string; onDelete?: () => void; onEdit?: () => void }) {
  return (
    <>
      <Header title={title} icon={icon} color={color} sub={withTeam(team, `${tasks.length} tarefas`)}>
        {(onEdit || onDelete) && <ToolMenu icon="more" label="Mais ações">
          {onEdit && <MenuItem icon={<Icon name="edit" className="size-4 text-ink-3" />} onClick={onEdit}>Editar</MenuItem>}
          {onDelete && <MenuItem danger icon={<Icon name="trash" className="size-4 text-ink-3" />} onClick={onDelete}>Excluir</MenuItem>}
        </ToolMenu>}
      </Header>
      <TaskList tasks={tasks.sort(byTime)} ctx={ctx} showProject empty="Nada por aqui." />
    </>
  )
}

const linkRow = (label: string, count: number, onClick: () => void, icon: IconName | ReactNode, color: string, extra?: ReactNode) => (
  <button key={label} type="button" onClick={onClick} className="flex w-full items-center gap-3 border-b border-white/[0.06] py-2.5 text-left text-sm hover:bg-white/[0.015]">
    <span style={{ color }}>{typeof icon === 'string' ? <Icon name={icon as IconName} /> : icon}</span>
    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-white/85">{label}{extra}</span>
    <span className="text-xs text-white/35 tabular-nums">{count}</span>
  </button>
)

/** Saved views: the built-in filters, plus one per person inside a team. */
export function FiltersView({ ctx, go }: { ctx: Ctx; go: (v: View) => void }) {
  const all = ctx.state.tasks
  return (
    <>
      <Header title="Visualizações" icon="filter" color={PALETTE.coral} />
      <div className="grid gap-x-8 md:grid-cols-2 md:[&>section]:mt-0!">
      <Group title="Filtros">{(Object.keys(FILTERS) as FilterId[]).map(id => linkRow(FILTERS[id].label, all.filter(t => FILTERS[id].test(t, all)).length, () => go({ kind: 'filter', id }), FILTERS[id].icon, FILTERS[id].color))}</Group>
      {ctx.state.people.length > 0 && <Group title="Pessoas">{ctx.state.people.map(p => linkRow(p.name, open(all).filter(t => t.assignees.includes(p.id)).length, () => go({ kind: 'search', q: '+' + p.id }), <Avatar person={p} size="size-4" bare />, PALETTE.orchid))}</Group>}
      </div>
    </>
  )
}

// Small chip naming the team a tag comes from, in that team's colour.
const teamChip = (t: { id: string; name: string; color: string }) => (
  <span key={t.id} title={`Etiqueta do time ${t.name}`} className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] leading-4"
    style={{ background: tint(t.color, 14), color: t.color }}>
    <Icon name="users" className="size-3" />{t.name}
  </span>
)

export function TagsView({ ctx, go, onNew, teams = [] }: { ctx: Ctx; go: (v: View) => void; onNew: () => void; teams?: { id: string; name: string; color: string; data: { tasks: Task[]; tagColors?: Record<string, string> } }[] }) {
  const teamsOf = (tag: string) => teams.filter(tm => tm.data.tasks.some(t => t.tags.includes(tag)) || tag in (tm.data.tagColors ?? {}))
  const all = ctx.state.tasks
  // Tags created here have no task yet; they live on as a colour entry.
  const tags = [...new Set([...all.flatMap(t => t.tags), ...Object.keys(ctx.state.tagColors ?? {})])].sort()
  return (
    <>
      <Header title="Etiquetas" icon="tag" color={PALETTE.saffron} sub={`${tags.length} etiqueta${tags.length === 1 ? '' : 's'}`}>
        <button type="button" className={btnPrimary} onClick={onNew}><Icon name="plus" className="size-3.5" />Nova etiqueta</button>
      </Header>
      {tags.length ? tags.map(tag => linkRow(tag, open(all).filter(t => t.tags.includes(tag)).length, () => go({ kind: 'tag', tag }), 'tag', colorFor(tag), teamsOf(tag).map(teamChip)))
        : <p className="py-6 text-sm text-white/45">Nenhuma etiqueta ainda. Crie uma ou escreva <kbd className="rounded-[5px] border border-white/10 px-1.5 text-white/70">#nome</kbd> ao criar uma tarefa para etiquetá-la.</p>}
    </>
  )
}

export function ProjectsView({ ctx, go, onNew }: { ctx: Ctx; go: (v: View) => void; onNew: () => void }) {
  const all = ctx.state.tasks.filter(t => !t.parentId)
  const projects = ctx.state.projects.filter(p => p.id !== 'inbox')
  return (
    <>
      <Header title="Meus projetos" icon="hash" color={PALETTE.iris} sub={`${projects.length} projeto${projects.length === 1 ? '' : 's'}`}>
        <button type="button" className={btnPrimary} onClick={onNew}><Icon name="plus" className="size-3.5" />Novo projeto</button>
      </Header>
      {projects.length === 0 && <p className="py-10 text-sm text-white/45">Nenhum projeto ainda. Crie um para agrupar suas tarefas.</p>}
      <Sortable ids={projects.map(p => p.id)} onMove={(from, to) => ctx.dispatch({ type: 'reorder', list: 'projects', from, to })}>
      {projects.map(p => {
        const mine = all.filter(t => t.projectId === p.id)
        const done = mine.filter(t => isDone(t.status)).length
        const pct = mine.length ? Math.round(done / mine.length * 100) : 0
        return (
          <ProjectRow key={p.id} id={p.id} onClick={() => go({ kind: 'project', id: p.id })}>
            <span style={{ color: p.color }}><Icon name={projectIcon(p, ctx.state.people.length > 0)} /></span>
            <span className="flex-1 truncate text-white/85">{p.name}</span>
            {ctx.state.people.length > 0 && <span className="hidden -space-x-1.5 sm:flex">{ctx.state.people.filter(x => projectMembers(p, ctx.state.people.map(y => y.id)).includes(x.id)).map(x => <Avatar key={x.id} person={x} />)}</span>}
            <span className="hidden h-1 w-24 overflow-hidden rounded-full bg-white/[0.06] sm:block"><span className="block h-full rounded-full" style={{ width: `${pct}%`, background: p.color }} /></span>
            <span className="w-24 text-right text-xs text-white/35 tabular-nums">{mine.length - done} aberta{mine.length - done === 1 ? '' : 's'}</span>
          </ProjectRow>
        )
      })}
      </Sortable>
    </>
  )
}

function ProjectRow({ id, onClick, children }: { id: string; onClick: () => void; children: ReactNode }) {
  const { ref, style, handle, dragging } = useRow(id)
  return (
    <button ref={ref} style={style} {...handle} type="button" onClick={onClick}
      className={`flex w-full items-center gap-3 border-b border-white/[0.06] py-3 text-left text-sm hover:bg-white/[0.015] ${dragging ? 'rounded-xl bg-raised px-2 shadow-[0_16px_40px_-16px_rgba(0,0,0,.9)]' : ''}`}>
      {children}
    </button>
  )
}

export function AutomationsView({ ctx }: { ctx: Ctx }) {
  const { state, dispatch } = ctx
  const [editing, setEditing] = useState<Automation | null>(null)
  const describe = (a: Automation) => {
    const tr = a.trigger
    const src = tr.kind === 'task' ? `“${state.tasks.find(t => t.id === tr.taskId)?.title ?? 'tarefa removida'}” for concluída`
      : tr.kind === 'tag' ? `qualquer tarefa com a etiqueta ${tr.tag} for concluída`
      : `qualquer tarefa de ${state.projects.find(p => p.id === tr.projectId)?.name} for concluída`
    const when = a.action.inDays === null ? 'sem data' : a.action.inDays === 0 ? 'para o mesmo dia' : `para ${a.action.inDays} dia${a.action.inDays > 1 ? 's' : ''} depois`
    return { src, dst: `criar “${a.action.title}” em ${state.projects.find(p => p.id === a.action.projectId)?.name}, ${when}` }
  }
  const blank = (): Automation => ({
    id: uid(), name: '', enabled: true, runs: 0, trigger: { kind: 'task', taskId: state.tasks.find(t => !isDone(t.status))?.id ?? '' },
    action: { title: '', projectId: 'inbox', inDays: 1, priority: 4, tags: [] },
  })
  return (
    <>
      <Header title="Automações" icon="bolt" color={PALETTE.saffron} sub="Regras que rodam quando uma tarefa é concluída.">
        <button type="button" className={btnPrimary} onClick={() => setEditing(blank())}><Icon name="plus" className="size-3.5" />Nova automação</button>
      </Header>
      {editing && <AutomationForm a={editing} ctx={ctx} onCancel={() => setEditing(null)} onSave={a => { dispatch({ type: 'saveAutomation', automation: a }); setEditing(null) }} />}
      {state.automations.length === 0 && !editing && <p className="text-sm text-white/40">Nenhuma automação. Crie uma para gerar tarefas de acompanhamento sozinhas.</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {state.automations.map(a => {
          const { src, dst } = describe(a)
          return (
            <article key={a.id} className={`flex flex-col justify-between rounded-2xl border border-white/[0.06] bg-surface p-4 ${a.enabled ? '' : 'opacity-55'}`}>
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-[10px] ${a.enabled ? 'bg-saffron/10 text-saffron' : 'bg-white/[0.04] text-ink-3'}`}><Icon name="bolt" /></span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold">{a.name || 'Sem nome'}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-white/60">Quando {src}, {dst}.</p>
                  <p className="mt-1.5 text-xs text-white/35 tabular-nums">{a.runs ? `Rodou ${a.runs}×` : 'Ainda não rodou'}</p>
                </div>
                <Check variant="switch" color={PALETTE.lagoon} label="Ativa" checked={a.enabled} onChange={enabled => dispatch({ type: 'saveAutomation', automation: { ...a, enabled } })}>
                  <span className="text-xs text-white/50">{a.enabled ? 'Ativa' : 'Pausada'}</span>
                </Check>
              </div>
              <div className="mt-3 flex justify-end gap-3 text-xs">
                <button className="text-white/50 hover:text-white" onClick={() => setEditing(a)}>Editar</button>
                <button className="text-white/50 hover:text-coral" onClick={() => dispatch({ type: 'removeAutomation', id: a.id })}>Excluir</button>
              </div>
            </article>
          )
        })}
      </div>
    </>
  )
}

function AutomationForm({ a, ctx, onSave, onCancel }: { a: Automation; ctx: Ctx; onSave: (a: Automation) => void; onCancel: () => void }) {
  const [d, setD] = useState(a)
  const { state } = ctx
  const tags = [...new Set(state.tasks.flatMap(t => t.tags))].sort()
  const act = (p: Partial<Automation['action']>) => setD({ ...d, action: { ...d.action, ...p } })
  const projectOf = (id: string) => state.projects.find(p => p.id === id)
  const projectOpts = state.projects.map(p => ({ value: p.id, label: p.name, icon: projectIcon(p, state.people.length > 0), color: p.color }))
  const valid = d.action.title.trim() && (d.trigger.kind !== 'task' || d.trigger.taskId)
  return (
    <div className="rise mb-6 space-y-4 rounded-2xl border border-white/[0.1] bg-surface p-5">
      <Field label="Nome"><input className={inputCls} value={d.name} placeholder="Ex.: Depois da revisão" onChange={e => setD({ ...d, name: e.target.value })} /></Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Quando">
          <Select<Automation['trigger']['kind']> ariaLabel="Gatilho" value={d.trigger.kind} onChange={k =>
            setD({ ...d, trigger: k === 'task' ? { kind: 'task', taskId: state.tasks[0]?.id ?? '' } : k === 'tag' ? { kind: 'tag', tag: tags[0] ?? '' } : { kind: 'project', projectId: state.projects[0].id } })}
            options={[
              { value: 'task', label: 'Uma tarefa específica for concluída', icon: 'done', color: PALETTE.lagoon },
              { value: 'tag', label: 'Qualquer tarefa com etiqueta for concluída', icon: 'tag', color: PALETTE.orchid },
              { value: 'project', label: 'Qualquer tarefa do projeto for concluída', icon: 'hash', color: PALETTE.azure },
            ]} />
          {d.trigger.kind === 'task' && <Select<string> ariaLabel="Tarefa" searchable value={d.trigger.taskId} onChange={taskId => setD({ ...d, trigger: { kind: 'task', taskId } })}
            options={state.tasks.map(t => { const p = projectOf(t.projectId); return { value: t.id, label: t.title, icon: 'hash' as const, color: p?.color, hint: p?.name } })} />}
          {d.trigger.kind === 'tag' && <Select<string> ariaLabel="Etiqueta" searchable value={d.trigger.tag} onChange={tag => setD({ ...d, trigger: { kind: 'tag', tag } })}
            options={tags.map(t => ({ value: t, label: t, icon: 'tag' as const, color: colorFor(t) }))} />}
          {d.trigger.kind === 'project' && <Select<string> ariaLabel="Projeto" searchable value={d.trigger.projectId} onChange={projectId => setD({ ...d, trigger: { kind: 'project', projectId } })}
            options={projectOpts} />}
        </Field>
        <Field label="Então criar">
          <input className={inputCls} value={d.action.title} placeholder="Título da nova tarefa" onChange={e => act({ title: e.target.value })} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Select<string> ariaLabel="Projeto da nova tarefa" searchable value={d.action.projectId} onChange={projectId => act({ projectId })} options={projectOpts} />
            <Select<number | null> ariaLabel="Data" icon="calendar" value={d.action.inDays} onChange={inDays => act({ inDays })}
              options={IN_DAYS.map(([v, l]) => ({ value: v, label: l }))} />
            <Select<Priority> ariaLabel="Prioridade" value={d.action.priority} onChange={priority => act({ priority })}
              options={priorityOptions} />
          </div>
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="rounded-full px-3 py-1.5 text-sm text-white/60 hover:text-white" onClick={onCancel}>Cancelar</button>
        <button type="button" className={btnPrimary} disabled={!valid} onClick={() => onSave({ ...d, name: d.name.trim() || d.action.title })}>Salvar automação</button>
      </div>
    </div>
  )
}

import { createContext, useContext, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  type Automation, type Priority, type Task, IN_DAYS, addDays, iso, blockers, diffDays, fmtDay, fmtDuration, isDone, moveWhen, parseISO, progressOf, span, today, uid, WEEKDAYS,
} from './lib'
import { QuickAdd, QuickAddModal, TaskList, type Ctx } from './tasks'
import { Board, Drop, Sortable, useRow } from './sortable'
import { Check, DateField, Popover, Select, Tip } from './controls'
import { Field, Icon, PALETTE, priorityOptions, btnPrimary, btnTool, colorFor, inputCls, tint, type IconName } from './ui'

export type View =
  | { kind: 'home' } | { kind: 'today' } | { kind: 'upcoming' } | { kind: 'filters' } | { kind: 'automations' } | { kind: 'projects' } | { kind: 'notes'; focus?: string } | { kind: 'pomodoro' }
  | { kind: 'project'; id: string } | { kind: 'tag'; tag: string } | { kind: 'filter'; id: FilterId } | { kind: 'search'; q: string }

export type FilterId = 'blocked' | 'moving' | 'delegated' | 'deadline' | 'recurring' | 'done'
export const FILTERS: Record<FilterId, { label: string; icon: IconName; color: string; test: (t: Task, all: Task[]) => boolean }> = {
  moving: { label: 'Em andamento', icon: 'progress', color: PALETTE.iris, test: t => !isDone(t.status) && progressOf(t.status) > 0 },
  blocked: { label: 'Bloqueadas', icon: 'clock', color: PALETTE.saffron, test: (t, all) => !isDone(t.status) && blockers(t, all).length > 0 },
  delegated: { label: 'Delegadas', icon: 'users', color: PALETTE.orchid, test: t => !isDone(t.status) && t.assignees.some(a => a !== 'me') },
  deadline: { label: 'Prazo nos próximos 7 dias', icon: 'deadline', color: PALETTE.coral, test: t => !isDone(t.status) && !!t.deadline && diffDays(today(), t.deadline) <= 7 },
  recurring: { label: 'Recorrentes', icon: 'repeat', color: PALETTE.azure, test: t => !!t.recurrence },
  done: { label: 'Concluídas', icon: 'done', color: PALETTE.lagoon, test: t => isDone(t.status) },
}

const byTime = (a: Task, b: Task) => {
  const k = (t: Task) => (t.when ? span(t.when)[0] + (t.when.kind === 'time' ? t.when.time : t.when.kind === 'slot' ? t.when.from : '99') : '9') + (5 - t.priority)
  return k(a) < k(b) ? -1 : 1
}
const open = (ts: Task[]) => ts.filter(t => !isDone(t.status))

// App mounts a slot above the page card; Header portals into it so the title sits on the backdrop.
export const HeadSlot = createContext<HTMLElement | null>(null)

export function Header({ title, sub, icon, color, children }: { title: string; sub?: ReactNode; icon?: IconName; color?: string; children?: ReactNode }) {
  const slot = useContext(HeadSlot)
  const head = (
    <header className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-1 sm:mb-5">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2.5 text-[30px] leading-tight font-semibold tracking-[-0.025em] sm:text-[34px]">
          {icon && color && <span className="grid size-8 shrink-0 place-items-center rounded-[10px]" style={{ background: tint(color, 18), color }}><Icon name={icon} className="size-[18px]" /></span>}
          <span className="truncate">{title}</span>
        </h1>
        {sub && <div className="mt-1 text-sm text-ink-2 tabular-nums">{sub}</div>}
      </div>
      {children && <div role="toolbar" aria-label="Ações da página" className="float flex items-center gap-0.5 rounded-full p-1">{children}</div>}
    </header>
  )
  return slot ? createPortal(head, slot) : head
}

function Group({ title, count, tone, children }: { title: string; count?: number; tone?: string; children: ReactNode }) {
  return (
    <section>
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
function EmptyDay({ ctx, date, isToday }: { ctx: Ctx; date: string; isToday: boolean }) {
  const [adding, setAdding] = useState(false)
  return (
    <section className="mb-5">
      <button type="button" onClick={() => setAdding(true)} aria-label={`Adicionar tarefa em ${longDay(date)}`}
        className={`group flex w-full items-center gap-2 border-b border-white/[0.08] pb-2 text-left text-sm font-semibold ${isToday ? 'text-white' : 'text-white/40 hover:text-white/70'}`}>
        {longDay(date)}
        <span className="text-xs font-normal text-white/25">livre</span>
        <span className="ml-auto grid size-5 place-items-center rounded-full text-iris opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"><Icon name="plus" className="size-3.5" /></span>
      </button>
      {adding && <QuickAddModal onClose={() => setAdding(false)}><QuickAdd ctx={ctx} date={date} autoFocus onDone={() => setAdding(false)} /></QuickAddModal>}
    </section>
  )
}

type Span = 'week' | 'month' | 'custom'
const weekOf = (d: string): [string, string] => { const s = addDays(d, -parseISO(d).getDay()); return [s, addDays(s, 6)] }
const monthOf = (d: string): [string, string] => { const x = parseISO(d); return [iso(new Date(x.getFullYear(), x.getMonth(), 1)), iso(new Date(x.getFullYear(), x.getMonth() + 1, 0))] }
const SPANS: [Span, string][] = [['week', 'Semana'], ['month', 'Mês'], ['custom', 'Personalizado']]

export function UpcomingView({ ctx }: { ctx: Ctx }) {
  const t = today()
  const [mode, setMode] = useState<Span>('week')
  const [range, setRange] = useState<[string, string]>(() => weekOf(t))
  const days = Array.from({ length: diffDays(range[0], range[1]) + 1 }, (_, i) => addDays(range[0], i))
  const roots = open(ctx.state.tasks.filter(x => !x.parentId && x.when))
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
      <Header title="Em breve" icon="upcoming" color={PALETTE.iris} sub={control} />
      <Board onDrop={(id, d) => {
        const x = ctx.state.tasks.find(x => x.id === id)
        if (x?.when && span(x.when)[0] !== d) ctx.dispatch({ type: 'update', id, patch: { when: moveWhen(x.when, d) } })
      }}>
      {days.map(d => {
        const list = roots.filter(x => x.when!.kind !== 'window' ? span(x.when!)[0] === d : span(x.when!)[0] === d || (d === t && span(x.when!)[0] < t)).sort(byTime)
        return (
          <Drop key={d} id={d}>{list.length === 0 ? (
            <EmptyDay ctx={ctx} date={d} isToday={d === t} />
          ) :
          <Group title={longDay(d)} tone={d === t ? 'text-white' : undefined} count={list.length}>
            <TaskList tasks={list} ctx={ctx} showProject draggable />
            <QuickAdd ctx={ctx} date={d} />
          </Group>}</Drop>
        )
      })}
      </Board>
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

export function ProjectView({ ctx, id, onDeleted, onEdit }: { ctx: Ctx; id: string; onDeleted: () => void; onEdit: () => void }) {
  const [showDone, setShowDone] = useState(false)
  const p = ctx.state.projects.find(x => x.id === id)
  if (!p) return null
  const roots = ctx.state.tasks.filter(x => x.projectId === id && !x.parentId)
  const done = roots.filter(x => isDone(x.status))
  const list = showDone ? roots : open(roots)
  return (
    <>
      <Header title={p.name} icon={p.id === 'inbox' ? 'inbox' : 'hash'} color={p.color} sub={`${roots.length - done.length} tarefas`}>
        <button type="button" onClick={() => setShowDone(v => !v)} className={btnTool}>{showDone ? 'Ocultar concluídas' : 'Mostrar concluídas'}</button>
        {p.id !== 'inbox' && <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 text-sm text-white/50 hover:text-white"><Icon name="edit" className="size-3.5" />Editar</button>}
        {p.id !== 'inbox' && <button type="button" onClick={() => confirm(`Excluir o projeto “${p.name}” e suas ${roots.length} tarefas?`) && (ctx.dispatch({ type: 'removeProject', id }), onDeleted())} className={`${btnTool} hover:text-coral`}><Icon name="trash" className="size-3.5" />Excluir</button>}
      </Header>
      <TaskList tasks={list} ctx={ctx} sortable />
      <QuickAdd ctx={ctx} projectId={id} />
    </>
  )
}

export function ListView({ ctx, title, tasks, icon, color, onDelete, onEdit }: { ctx: Ctx; title: string; tasks: Task[]; icon?: IconName; color?: string; onDelete?: () => void; onEdit?: () => void }) {
  return (
    <>
      <Header title={title} icon={icon} color={color} sub={`${tasks.length} tarefas`}>
        {onEdit && <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 text-sm text-white/50 hover:text-white"><Icon name="edit" className="size-3.5" />Editar</button>}
        {onDelete && <button type="button" onClick={onDelete} className={`${btnTool} hover:text-coral`}><Icon name="trash" className="size-3.5" />Excluir</button>}
      </Header>
      <TaskList tasks={tasks.sort(byTime)} ctx={ctx} showProject empty="Nada por aqui." />
    </>
  )
}

export function FiltersView({ ctx, go }: { ctx: Ctx; go: (v: View) => void }) {
  const all = ctx.state.tasks
  const tags = [...new Set(all.flatMap(t => t.tags))].sort()
  const row = (label: string, count: number, onClick: () => void, icon: IconName, color: string) => (
    <button key={label} type="button" onClick={onClick} className="flex w-full items-center gap-3 border-b border-white/[0.06] py-2.5 text-left text-sm hover:bg-white/[0.015]">
      <span style={{ color }}><Icon name={icon} /></span>
      <span className="flex-1 text-white/85">{label}</span>
      <span className="text-xs text-white/35 tabular-nums">{count}</span>
    </button>
  )
  return (
    <>
      <Header title="Filtros e etiquetas" icon="filter" color={PALETTE.coral} />
      <div className="grid gap-x-8 md:grid-cols-2 xl:grid-cols-3">
      <Group title="Filtros">{(Object.keys(FILTERS) as FilterId[]).map(id => row(FILTERS[id].label, all.filter(t => FILTERS[id].test(t, all)).length, () => go({ kind: 'filter', id }), FILTERS[id].icon, FILTERS[id].color))}</Group>
      <Group title="Etiquetas">{tags.map(tag => row(tag, open(all).filter(t => t.tags.includes(tag)).length, () => go({ kind: 'tag', tag }), 'tag', colorFor(tag)))}</Group>
      <Group title="Pessoas">{ctx.state.people.map(p => row(p.name, open(all).filter(t => t.assignees.includes(p.id)).length, () => go({ kind: 'search', q: '+' + p.id }), 'user', PALETTE.orchid))}</Group>
      </div>
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
            <span style={{ color: p.color }}><Icon name="hash" /></span>
            <span className="flex-1 truncate text-white/85">{p.name}</span>
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
  const projectOpts = state.projects.map(p => ({ value: p.id, label: p.name, icon: (p.id === 'inbox' ? 'inbox' : 'hash') as IconName, color: p.color }))
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

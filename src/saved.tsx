// A saved view's page: its tasks, plus the dialog that sets its rules.
import { useRef, useState, type PointerEvent as PE, type ReactNode } from 'react'
import {
  type Priority, type SavedView, type Task, type ViewDue, type ViewGroup, type ViewSort, type ViewStatus,
  WEEKDAYS, addDays, blankView, dateBucket, fmtDay, isDone, moveWhen, onDay, parseISO, projections, tableDays, today, uid, viewGroup, viewTasks,
} from './lib'
import { ColorField, Select, type Opt } from './controls'
import { Drop, Kanban, KanbanCol } from './sortable'
import { GlyphButton, QuickAdd, TagChip, SortableTask, TaskList, TaskRow, type Ctx } from './tasks'
import { Avatar, Dialog, Field, Icon, PRIORITY, Segmented, btnGhost, btnPrimary, colorFor, inputCls, tint, priorityOptions, projectIcon } from './ui'
import { DUE, GROUP, SORT, STATUS, viewColor, viewWords } from './viewText'
import { Ghost, GhostToggle, Group, Header, MenuItem, NameField, ToolMenu, type View } from './views'

type DayCol = [id: string, title: string, has: (t: Task) => boolean]
interface Col { id: string; title: string; mark?: ReactNode; tasks: Task[] }

const ANY = '*'
const flip = <T,>(list: T[], x: T | typeof ANY) => x === ANY ? [] : list.includes(x) ? list.filter(y => y !== x) : [...list, x]
const opts = <K extends string>(m: Record<K, string>, skip: K[] = []): Opt<K>[] =>
  (Object.keys(m) as K[]).filter(k => !skip.includes(k)).map(k => ({ value: k, label: m[k][0].toUpperCase() + m[k].slice(1) }))

const DATES: [string, string][] = [['late', 'Antes de hoje'], ['today', 'Hoje'], ['tomorrow', 'Amanhã'], ['week', 'Próximos 7 dias'], ['later', 'Mais tarde'], ['none', 'Sem data']]

/** Columns (or list groups) of a view. A task with two people or tags shows up under both. */
function columns(v: SavedView, tasks: Task[], ctx: Ctx): Col[] {
  const { state } = ctx
  const used = (get: (t: Task) => string[]) => [...new Set(tasks.flatMap(get))]
  const many = (ids: string[], get: (t: Task) => string[], make: (id: string) => Omit<Col, 'id' | 'tasks'>, none = '') => [
    ...ids.filter(Boolean).map(id => ({ id, ...make(id), tasks: tasks.filter(t => get(t).includes(id)) })),
    ...(none && tasks.some(t => !get(t).length) ? [{ id: 'none', title: none, tasks: tasks.filter(t => !get(t).length) }] : []),
  ]
  switch (viewGroup(v)) {
    case 'none': return [{ id: 'all', title: '', tasks }]
    case 'project': {
      const ids = v.projects.length ? v.projects : state.projects.map(p => p.id).filter(id => tasks.some(t => t.projectId === id))
      return many(ids, t => [t.projectId], id => {
        const p = state.projects.find(x => x.id === id)
        return { title: p?.name ?? 'Projeto removido', mark: p && <span style={{ color: p.color }}><Icon name={projectIcon(p, state.people.length > 0 && !ctx.wide)} /></span> }
      })
    }
    case 'person': {
      const ids = v.people.length ? v.people : state.people.map(p => p.id).filter(id => !ctx.wide || tasks.some(t => t.assignees.includes(id)))
      // Someone who left the team may still hold tasks: without a filter, keep them reachable.
      const gone = v.people.length ? [] : used(t => t.assignees).filter(id => !ids.includes(id))
      return many([...ids, ...gone], t => t.assignees, id => {
        const p = state.people.find(x => x.id === id)
        return { title: p?.name ?? id.split('@')[0], mark: p && <Avatar person={p} bare /> }
      }, 'Sem responsável')
    }
    case 'tag': {
      const ids = v.tags.length && v.tagMode === 'any' ? v.tags : used(t => t.tags).sort()
      // Tag columns are '@tag', so a tag named "none" can't pass for the untagged column.
      return many(ids.map(id => '@' + id), t => t.tags.map(x => '@' + x), id => ({ title: id.slice(1), mark: <span style={{ color: colorFor(id.slice(1)) }}><Icon name="tag" /></span> }), 'Sem etiqueta')
    }
    case 'section': {
      const sections = state.projects.find(p => p.id === v.projects[0])?.sections ?? []
      const cols = many(sections.map(s => s.id), t => sections.some(s => s.id === t.section) ? [t.section!] : [], id => ({ title: sections.find(s => s.id === id)!.name }), 'Sem seção')
      return cols.length ? cols : [{ id: 'none', title: 'Sem seção', tasks }]
    }
    case 'priority': return ([1, 2, 3, 4] as Priority[]).filter(p => !v.priorities.length || v.priorities.includes(p)).map(p => ({
      id: String(p), title: PRIORITY[p].label, mark: <span style={{ color: PRIORITY[p].color }}><Icon name={PRIORITY[p].icon} /></span>, tasks: tasks.filter(t => t.priority === p),
    }))
    case 'date': return DATES.map(([id, title]) => ({ id, title, tasks: tasks.filter(t => dateBucket(t) === id) }))
      .filter(c => c.tasks.length || (v.due === 'any' && ['today', 'tomorrow', 'none'].includes(c.id)))
  }
}

/** One line per task: status, title, and the time when it has one. A parent lists all its subtasks on a rail beneath it; a subtask on its own day names its parent. */
/** `group`: what the table's rows are, so the card shows the other side (tags under a project row, the project under a tag row). */
function TableTask({ task, ctx, under, group }: { task: Task; ctx: Ctx; under?: boolean; group?: ViewGroup }) {
  const project = group === 'tag' ? ctx.state.projects.find(p => p.id === task.projectId) : undefined
  const tags = group === 'project' || group === 'section' ? task.tags : []
  const parent = !under && task.parentId ? ctx.state.tasks.find(t => t.id === task.parentId) : undefined // its parent isn't in the view
  const subs = task.ghostOf ? [] : ctx.state.tasks.filter(t => t.parentId === task.id)
  const time = task.when?.kind === 'time' ? task.when.time : task.when?.kind === 'slot' ? task.when.from : null
  const done = isDone(task.status)
  const body = <>
    <div role="button" tabIndex={0} onClick={() => ctx.open(task.id)} onKeyDown={e => e.key === 'Enter' && ctx.open(task.id)}
      className={`relative flex min-w-0 cursor-pointer items-start gap-2 rounded-lg py-1.5 pr-2 text-sm leading-5 hover:bg-white/[0.05] focus-visible:bg-white/[0.06] focus-visible:outline-none ${under ? 'ml-[15px] pl-3.5' : 'pl-2'}`}>
      {under && <span aria-hidden className="absolute -top-1 bottom-[calc(100%-16px)] left-0 w-2.5 rounded-bl-[5px] border-b border-l border-white/[0.14]" />}
      <span className="pt-0.5"><GlyphButton task={task} ctx={ctx} size={under ? 14 : 16} /></span>
      <span className="min-w-0 flex-1">
        <span className={`line-clamp-2 break-words ${done ? 'text-white/35 line-through' : under ? 'text-white/65' : 'text-white/85'} ${subs.length ? 'font-medium' : ''}`}>
          {parent && <span className="text-white/35">{parent.title} › </span>}{task.title}
        </span>
        {task.description && <span className="mt-0.5 line-clamp-2 text-xs leading-4 break-words text-white/40">{task.description}</span>}
        {(tags.length > 0 || project) && <span className="mt-1.5 flex flex-wrap items-center gap-1">
          {project && <span className="inline-flex max-w-full items-center gap-1 rounded-full py-px pr-2 pl-1.5 text-[11px] leading-4" style={{ background: tint(project.color, 14), color: project.color }}>
            <Icon name={projectIcon(project, !!project.team)} className="size-3 shrink-0" /><span className="truncate">{project.name}</span></span>}
          {tags.map(g => <TagChip key={g} tag={g} color={colorFor(g, task.projectId)} />)}
        </span>}
      </span>
      {task.status.kind === 'subtasks' && <span className={`shrink-0 pt-px text-xs tabular-nums ${done ? 'text-white/35' : 'text-white/50'}`}>{task.status.done}/{task.status.total}</span>}
      {time && <span className="shrink-0 pt-px text-xs text-white/40 tabular-nums">{time}</span>}
    </div>
    {subs.map(s => <TableTask key={s.id} task={s} ctx={ctx} under group={group} />)}
  </>
  // A top-level task is a small tile on the cell, its subtasks inside it.
  return under ? body : <div className={`rounded-xl bg-white/[0.035] p-0.5 shadow-[inset_0_1px_0_rgb(255_255_255/.04),0_6px_14px_-10px_rgba(0,0,0,.8)] ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.055] ${done ? 'opacity-60' : ''}`}>{body}</div>
}

const LONG_WD = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const readSizes = (key: string): Record<string, number> => { try { return JSON.parse(localStorage.getItem(key) ?? '{}') } catch { return {} } }

/** Rows by group, one column per day, always the size of the screen. Borders drag to resize (double click resets); sizes are kept per view on this device. */
function DayTable({ viewId, days, rows, flip, render }: { viewId: string; days: DayCol[]; rows: Col[]; flip?: boolean; render: (t: Task) => ReactNode }) {
  const key = `table-sizes:${viewId}`
  const [size, setSize] = useState(() => readSizes(key))
  const [head, setHead] = useState(() => readSizes(key).head ?? 180)
  const grid = useRef<HTMLDivElement>(null)
  // Untouched sizes follow the load: rows grow with their fullest cell, columns with how many tasks they hold.
  const fullest = (c: Col) => Math.max(0, ...days.map(([, , has]) => c.tasks.filter(has).length))
  const auto: Record<string, number> = {
    ...Object.fromEntries(days.map(([id, , has]) => { const n = rows.reduce((k, c) => k + c.tasks.filter(has).length, 0); return [id, n ? 1 + Math.min(n, 12) * 0.08 : 0.55] })),
    ...Object.fromEntries(rows.map(c => [c.id, 0.8 + fullest(c)])),
  }
  const w = (id: string) => size[id] ?? auto[id] ?? 1
  const touched = Object.keys(size).length > 0
  const keep = (next: Record<string, number>) => { setSize(next); try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* private mode */ } }
  const now = today()

  /** Drag the border after item `i`: what one side gains the next one loses, so the table never outgrows the screen. */
  const drag = (ids: string[], i: number, axis: 'x' | 'y') => (e: PE) => {
    e.preventDefault()
    const el = grid.current!, start = axis === 'x' ? e.clientX : e.clientY, base = { ...size }
    const a = ids[i], b = ids[i + 1], total = ids.reduce((n, id) => n + w(id), 0)
    const px = axis === 'x' ? el.clientWidth - head : el.clientHeight - (el.firstElementChild as HTMLElement).offsetHeight
    const move = (m: PointerEvent) => {
      const d = ((axis === 'x' ? m.clientX : m.clientY) - start) * total / px, pair = w(a) + w(b), min = total * 0.04
      const na = Math.min(Math.max(w(a) + d, min), pair - min)
      setSize({ ...base, [a]: na, [b]: pair - na })
    }
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); setSize(s => (keep(s), s)) }
    addEventListener('pointermove', move); addEventListener('pointerup', up)
  }
  const dragHead = (e: PE) => {
    e.preventDefault()
    const start = e.clientX, from = head
    const move = (m: PointerEvent) => setHead(Math.min(Math.max(from + m.clientX - start, 96), 320))
    const up = (m: PointerEvent) => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); keep({ ...size, head: Math.min(Math.max(from + m.clientX - start, 96), 320) }) }
    addEventListener('pointermove', move); addEventListener('pointerup', up)
  }
  const reset = (ids: string[]) => () => keep(Object.fromEntries(Object.entries(size).filter(([id]) => !ids.includes(id))))
  const handle = (axis: 'x' | 'y', down: (e: PE) => void, onReset: () => void, label: string) => (
    <div role="separator" aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'} aria-label={label} title="Arraste para ajustar; clique duas vezes para voltar"
      onPointerDown={down} onDoubleClick={onReset}
      className={`group/h absolute z-10 touch-none ${axis === 'x' ? '-right-[5px] top-0 bottom-0 w-[9px] cursor-col-resize' : '-bottom-[5px] left-0 right-0 h-[9px] cursor-row-resize'}`}>
      <span className={`absolute rounded-full bg-iris opacity-0 transition-opacity group-hover/h:opacity-100 group-active/h:opacity-100 ${axis === 'x' ? 'inset-y-0 left-[4px] w-px' : 'inset-x-0 top-[4px] h-px'}`} />
    </div>
  )
  const colIds = days.map(d => d[0]), rowIds = rows.map(r => r.id)
  // Flipped, the same cells flow down the columns instead: days become rows, groups become columns.
  const dayAxis = flip ? 'y' : 'x', rowAxis = flip ? 'x' : 'y'
  const across = `${head}px ${(flip ? rowIds : colIds).map(id => `minmax(0,${w(id)}fr)`).join(' ')}`
  const down = `auto ${(flip ? colIds : rowIds).map(id => `minmax(0,${w(id)}fr)`).join(' ')}`

  return (
    <div className="board table-view -mx-3 flex min-h-0 min-w-0 flex-1 overflow-hidden px-3 pb-4 sm:-mx-5 sm:px-5 lg:-mr-9 lg:-ml-8 lg:pr-9 lg:pl-8">
      <div ref={grid} className="float grid min-w-0 flex-1 overflow-hidden rounded-2xl"
        style={{ gridTemplateColumns: across, gridTemplateRows: down, gridAutoFlow: flip ? 'column' : 'row' }}>
        <div className="relative flex items-end border-b border-white/[0.08] px-2 pb-2">
          {touched && <button type="button" onClick={() => { setHead(180); keep({}) }}
            className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-white/50 hover:bg-white/[0.06] hover:text-white focus-visible:outline-2 focus-visible:outline-iris">
            <Icon name="reset" className="size-3.5" />Restaurar tamanhos</button>}
          {handle('x', dragHead, () => { setHead(180); const { head: _, ...rest } = size; keep(rest) }, 'Largura dos nomes')}
        </div>
        {days.map(([id, title], i) => {
          const day = id.length === 10, isToday = id === now, weekend = day && [0, 6].includes(parseISO(id).getDay())
          return (
            <div key={id} className={`relative min-w-0 border-b border-l border-white/[0.06] px-3 pt-3 pb-2.5 ${isToday ? 'bg-iris/[0.07]' : weekend ? 'bg-black/15' : ''}`}>
              {day ? <div className="flex min-w-0 items-baseline gap-2">
                <span className={`text-[22px] leading-none font-semibold tabular-nums tracking-tight ${isToday ? 'text-iris' : 'text-white/90'}`}>{parseISO(id).getDate()}</span>
                <span className={`truncate text-[13px] ${isToday ? 'font-medium text-white' : 'text-white/45'}`}>{['Hoje', 'Amanhã'].includes(title) ? `${title.toLowerCase()}, ${LONG_WD[parseISO(id).getDay()].slice(0, 3)}` : LONG_WD[parseISO(id).getDay()]}</span>
              </div> : <div className="truncate pt-1 text-[13px] text-white/45">{title}</div>}
              {isToday && <span className={`absolute bg-iris ${flip ? 'inset-y-0 left-0 w-[2px]' : 'inset-x-0 top-0 h-[2px]'}`} />}
              {i < days.length - 1 && handle(dayAxis, drag(colIds, i, dayAxis), reset(colIds), `Largura de ${title}`)}
            </div>
          )
        })}
        {rows.map((c, r) => <div key={c.id} className="contents">
          <div className="relative flex min-h-0 min-w-0 flex-col gap-1 overflow-hidden border-b border-white/[0.05] px-3.5 py-3">
            <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-white/90">{c.mark}<span className="min-w-0 flex-1 truncate">{c.title}</span></div>
            <span className="text-xs text-white/35 tabular-nums">{c.tasks.filter(t => !t.ghostOf).length} tarefa{c.tasks.filter(t => !t.ghostOf).length === 1 ? '' : 's'}</span>
            {r < rows.length - 1 && handle(rowAxis, drag(rowIds, r, rowAxis), reset(rowIds), `${flip ? 'Largura' : 'Altura'} de ${c.title}`)}
          </div>
          {days.map(([id, , has]) => {
            // Subtasks already hang under their parent here; elsewhere they still show on their own day.
            const here = c.tasks.filter(has), top = here.filter(t => !here.some(p => p.id === t.parentId))
            return <div key={id} className={`min-h-0 min-w-0 overflow-y-auto border-b border-l border-white/[0.05] space-y-1.5 p-2 ${id === now ? 'bg-iris/[0.04]' : id.length === 10 && [0, 6].includes(parseISO(id).getDay()) ? 'bg-black/15' : ''}`}>{top.map(render)}</div>
          })}
        </div>)}
      </div>
    </div>
  )
}

/** What moving a card to another column changes; null = that move makes no sense and the card goes back. */
function movePatch(v: SavedView, t: Task, from: string, to: string, ctx: Ctx, ctxFor: (projectId: string) => Ctx): Partial<Task> | null {
  const none = to === 'none'
  const swap = (list: string[]) => none ? [] : [...new Set([...list.filter(x => x !== from), to])]
  switch (viewGroup(v)) {
    case 'priority': return { priority: Number(to) as Priority }
    case 'section': return { section: none ? null : to }
    case 'tag': return { tags: none ? [] : [...new Set([...t.tags.filter(x => x !== from.slice(1)), to.slice(1)])] }
    // Delegating only works inside the task's own team.
    case 'person': return none || ctxFor(t.projectId).state.people.some(p => p.id === to) ? { assignees: swap(t.assignees) } : null
    // Each space keeps its own tasks, so a card only changes project within the same one; families move from the task itself.
    case 'project': {
      const space = (id: string) => ctx.state.projects.find(p => p.id === id)?.team?.id
      const family = t.parentId || ctx.state.tasks.some(x => x.parentId === t.id)
      return family || !ctx.state.projects.some(p => p.id === to) || space(to) !== space(t.projectId) ? null : { projectId: to, section: null }
    }
    case 'date': {
      if (none) return t.recurrence ? null : { when: null }
      const day = to === 'today' ? today() : to === 'tomorrow' ? addDays(today(), 1) : null
      return day ? { when: t.when ? moveWhen(t.when, day) : { kind: 'date', date: day } } : null
    }
    case 'none': return null
  }
}

/** ctxFor: the space (yours or a team's) that owns a project. */
export function SavedViewPage({ id, ctx: given, ctxFor, team, back, go }: { id: string; ctx: Ctx; ctxFor: (projectId: string) => Ctx; team?: string; back: View; go: (v: View) => void }) {
  const { state } = given
  const isNew = id === 'new'
  const saved = isNew ? blankView() : state.views?.find(x => x.id === id)
  const [form, setForm] = useState<SavedView | null>(isNew ? blankView : null) // null = dialog closed
  const [del, setDel] = useState(false)
  if (!saved) return <p className="text-sm text-white/45">Esta visualização não existe mais.</p>
  const v = form ?? saved
  const set = (p: Partial<SavedView>) => setForm({ ...v, ...p })
  const w = viewWords(v, state)
  const name = v.name.trim() || w.name
  const tasks = viewTasks(v, state.tasks)
  // Only one team's tasks here (none of your own): marking each one as the team's says nothing.
  const spaces = new Set(tasks.map(t => state.projects.find(p => p.id === t.projectId)?.team?.id))
  const ctx: Ctx = { ...given, oneTeam: spaces.size === 1 && !spaces.has(undefined) }
  const count = `${tasks.length} tarefa${tasks.length === 1 ? '' : 's'}`
  const tableTasks = v.layout === 'table' ? viewTasks(v, state.tasks, undefined, true) : tasks
  // Projected repeats only where the table has a day for them.
  const shownDays = v.due === 'today' ? [today()] : tableDays(v.weekdays)
  const ghosts = v.layout === 'table' && v.projections ? projections(tableTasks).filter(g => shownDays.some(d => onDay(g, d))) : []
  const cols = columns(v, [...tableTasks, ...ghosts], ctx)
  const group = viewGroup(v)
  const showProject = group !== 'project' && group !== 'section'
  // Cards carry their column, since one task can sit in two.
  const key = (col: string, t: Task) => `${col}\n${t.id}`
  const taskOf = (k: string) => tasks.find(t => t.id === k.split('\n')[1])

  const save = () => {
    const view = { ...v, name, id: isNew ? uid() : v.id }
    ctx.dispatch({ type: 'saveView', view })
    if (isNew) go({ kind: 'view', id: view.id })
    else setForm(null)
  }
  const close = () => isNew ? go(back) : setForm(null)
  const duplicate = () => {
    const view = { ...v, id: uid(), name: `${name} (cópia)`, pinned: false }
    ctx.dispatch({ type: 'saveView', view })
    go({ kind: 'view', id: view.id })
  }

  /** Quick add prefilled so the new task lands in this view; hidden where a new task couldn't. */
  const adder = (col: string) => {
    if (!['open', 'all'].includes(v.status) || v.due === 'late') return null
    if (group === 'date' && (['late', 'week', 'later'].includes(col) || (v.due === 'none' && col !== 'none'))) return null
    const person = group === 'person' ? (col === 'none' ? undefined : col) : v.people.includes('') ? undefined : v.people[0]
    const projectId = group === 'project' ? col : v.projects.length ? v.projects[0] : ctx.wide ? 'inbox' : state.projects[0]?.id
    if (!state.projects.some(p => p.id === projectId) || (person && !ctxFor(projectId).state.people.some(p => p.id === person))) return null
    if (group === 'tag' && col === 'none' && v.tags.length) return null
    const tags = [...(v.tagMode === 'all' ? v.tags : group === 'tag' ? [] : v.tags.slice(0, 1)), ...(group === 'tag' && col !== 'none' ? [col.slice(1)] : [])]
    const date = group === 'date' ? (col === 'today' ? today() : col === 'tomorrow' ? addDays(today(), 1) : undefined) : v.due === 'today' || v.due === 'week' ? today() : undefined
    return <QuickAdd ctx={ctxFor(projectId)} projectId={projectId} section={group === 'section' && col !== 'none' ? col : undefined} date={date}
      assignees={person ? [person] : []} tags={tags} priority={group === 'priority' ? Number(col) as Priority : v.priorities.length ? Math.max(...v.priorities) as Priority : undefined} />
  }

  const allTags = [...new Set([...state.tasks.flatMap(t => t.tags), ...Object.keys(state.tagColors ?? {}), ...v.tags])].sort()
  const any = (label: string): Opt<string> => ({ value: ANY, label })
  // Picked but gone (deleted, left the team): still listed, so it can be unpicked.
  const lost = (picked: string[], known: string[], label?: string): Opt<string>[] => picked.filter(x => !known.includes(x)).map(x => ({ value: x, label: label ?? x.split('@')[0] }))
  const sel = (xs: string[]) => xs.length ? xs : [ANY]
  // Only `form` is drafted: the page behind previews it, and closing the dialog drops it.
  const config = form && (
    <Dialog title={isNew ? 'Nova visualização' : 'Configurar visualização'} onClose={close} footer={<>
      <span className="mr-auto self-center text-xs text-white/45 tabular-nums">{count}</span>
      <button type="button" className={btnGhost} onClick={close}>Cancelar</button>
      <button type="button" className={btnPrimary} onClick={save}>{isNew ? 'Criar visualização' : 'Salvar alterações'}</button>
    </>}>
      <div className="-mx-5 -my-4 max-h-[58vh] space-y-4 overflow-y-auto px-5 py-4">
        <Field label="Nome">
          <input autoFocus className={inputCls} aria-label="Nome da visualização" placeholder={w.name} value={v.name} onChange={e => set({ name: e.target.value })} onKeyDown={e => e.key === 'Enter' && save()} />
        </Field>
        <Field label="Cor do ícone">
          <ColorField value={viewColor(v, state)} onChange={color => set({ color })} ariaLabel="Cor do ícone" />
        </Field>
        <Field label="Projetos">
          <Select<string> ariaLabel="Projetos" searchable multi={sel(v.projects)} onChange={x => set({ projects: flip(v.projects, x) })}
            options={[any('Qualquer projeto'), ...lost(v.projects, state.projects.map(p => p.id), 'Projeto removido'), ...state.projects.map(p => ({ value: p.id, label: p.name, icon: projectIcon(p, !!team), color: p.color, hint: p.team?.name }))]} />
        </Field>
        {(state.people.length > 0 || v.people.length > 0) && <Field label="Responsáveis">
          <Select<string> ariaLabel="Responsáveis" multi={sel(v.people)} onChange={x => set({ people: flip(v.people, x) })}
            options={[any('Qualquer pessoa'), { value: '', label: 'Sem responsável' }, ...lost(v.people, ['', ...state.people.map(p => p.id)]), ...state.people.map(p => ({ value: p.id, label: p.name, avatar: <Avatar person={p} bare /> }))]} />
        </Field>}
        <Field label="Etiquetas">
          <Select<string> ariaLabel="Etiquetas" searchable multi={sel(v.tags)} onChange={x => set({ tags: flip(v.tags, x) })}
            options={[any('Qualquer etiqueta'), ...allTags.map(g => ({ value: g, label: g, icon: 'tag' as const, color: colorFor(g) }))]} />
          {v.tags.length > 1 && <Segmented value={v.tagMode} options={[{ value: 'all', label: 'Com todas' }, { value: 'any', label: 'Com alguma' }]} onChange={tagMode => set({ tagMode })} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Situação"><Select<ViewStatus> ariaLabel="Situação" value={v.status} options={opts(STATUS)} onChange={status => set({ status })} /></Field>
          <Field label="Data"><Select<ViewDue> ariaLabel="Data" value={v.due} options={opts(DUE)} onChange={due => set({ due })} /></Field>
        </div>
        <Field label="Prioridade">
          <Select<Priority | typeof ANY> ariaLabel="Prioridade" multi={v.priorities.length ? v.priorities : [ANY]}
            options={[{ value: ANY, label: 'Qualquer prioridade' }, ...priorityOptions]} onChange={x => set({ priorities: flip(v.priorities, x) })} />
        </Field>
        <div className="border-t border-white/[0.06]" />
        <Field label="Layout">
          <Segmented value={v.layout} options={[{ value: 'list', label: 'Lista vertical' }, { value: 'board', label: 'Colunas horizontais' }, { value: 'table', label: 'Tabela por dia' }]} onChange={layout => set({ layout })} />
        </Field>
        {v.layout === 'table' && <Field label="Dias">
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5, 6, 0].map(i => {
              const on = !!v.weekdays?.includes(i)
              return <button key={i} type="button" aria-pressed={on} aria-label={WEEKDAYS[i]} onClick={() => set({ weekdays: on ? v.weekdays!.filter(x => x !== i) : [...(v.weekdays ?? []), i] })}
                className={`h-8 flex-1 rounded-[8px] text-xs ${on ? 'bg-iris text-on' : 'bg-white/[0.04] text-white/50 hover:text-white'}`}>{WEEKDAYS[i].slice(0, 3)}</button>
            })}
          </div>
          <Segmented value={v.flip ? 'rows' : 'cols'} options={[{ value: 'cols', label: 'Dias nas colunas' }, { value: 'rows', label: 'Dias nas linhas' }]} onChange={x => set({ flip: x === 'rows' })} />
          <p className="text-xs text-white/40">{v.weekdays?.length ? 'Mostra estes dias da semana atual.' : 'Nenhum marcado: os próximos 7 dias a partir de hoje.'}</p>
        </Field>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={{ list: 'Agrupamento', board: 'Colunas', table: v.flip ? 'Colunas' : 'Linhas' }[v.layout]}><Select<ViewGroup> ariaLabel="Agrupamento" value={group} onChange={g => set({ group: g })}
            options={opts(GROUP, [...(v.layout !== 'list' ? ['none' as const] : []), ...(v.layout === 'table' ? ['date' as const] : []), ...(v.projects.length === 1 ? [] : ['section' as const])])} /></Field>
          <Field label="Ordem"><Select<ViewSort> ariaLabel="Ordem" value={v.sort} options={opts(SORT)} onChange={sort => set({ sort })} /></Field>
        </div>
      </div>
    </Dialog>
  )
  // Table: a week, or just its picked weekdays (only today for a "today" view); tasks outside it keep their own columns.
  const days = shownDays
  const dayCols = ([
    ['late', 'Atrasadas', t => dateBucket(t) === 'late'],
    ...days.map((d): DayCol => [d, fmtDay(d), t => onDay(t, d)]),
    ['later', 'Depois', t => !['none', 'late'].includes(dateBucket(t)) && !days.some(d => onDay(t, d))],
    ['none', 'Sem data', t => dateBucket(t) === 'none'],
  ] as DayCol[]).filter(([id, , has]) => days.includes(id) || tasks.some(has))
  const nothing = <p className="py-4 text-sm text-white/45">Nenhuma tarefa combina com estas regras. Ajuste os filtros em Mais ações, Configurar visualização.</p>

  return (
    <>
      <Header title={form ? name : <NameField key={name} label="Nome da visualização" value={name} onSave={n => ctx.dispatch({ type: 'saveView', view: { ...saved, name: n } })} />} icon={v.layout} color={viewColor(v, state)}
        sub={<>{team && `${team}, `}{count}</>}>
        {!isNew && v.layout === 'table' && <GhostToggle on={!!saved.projections} onChange={on => ctx.dispatch({ type: 'saveView', view: { ...saved, projections: on } })} />}
        {!isNew && <ToolMenu icon="more" label="Mais ações">
          <MenuItem icon={<Icon name="settings" className="size-4 text-ink-3" />} onClick={() => setForm(saved)}>Configurar visualização</MenuItem>
          {!team && <MenuItem icon={<Icon name={saved.pinned ? 'unpin' : 'pin'} className="size-4 text-ink-3" />}
            onClick={() => ctx.dispatch({ type: 'saveView', view: { ...saved, pinned: !saved.pinned } })}>{saved.pinned ? 'Tirar da barra lateral' : 'Fixar na barra lateral'}</MenuItem>}
          {saved.layout === 'table' && <MenuItem icon={<Icon name="reset" className="size-4 text-ink-3" />} onClick={() => ctx.dispatch({ type: 'saveView', view: { ...saved, flip: !saved.flip } })}>{saved.flip ? 'Dias nas colunas' : 'Dias nas linhas'}</MenuItem>}
          <MenuItem icon={<Icon name="plus" className="size-4 text-ink-3" />} onClick={duplicate}>Duplicar</MenuItem>
          <MenuItem danger icon={<Icon name="trash" className="size-4 text-ink-3" />} onClick={() => setDel(true)}>Excluir visualização</MenuItem>
        </ToolMenu>}
      </Header>
      {v.layout === 'board' ? (
        <Kanban cols={Object.fromEntries(cols.map(c => ['col:' + c.id, c.tasks.map(t => key(c.id, t))]))} onColDrop={() => {}}
          onDrop={(k, col) => {
            const from = k.split('\n')[0], to = col.slice(4), t = taskOf(k)
            const patch = t && from !== to ? movePatch(v, t, from, to, ctx, ctxFor) : null
            if (t && patch) ctx.dispatch({ type: 'update', id: t.id, patch })
          }}
          overlay={k => { const t = taskOf(k); return t && <div className="float cursor-grabbing overflow-hidden rounded-2xl py-0.5 rotate-[1.5deg] shadow-[0_24px_48px_-18px_rgba(0,0,0,.95)] ring-1 ring-iris/40"><TaskRow task={t} ctx={ctx} showProject={showProject} /></div> }}>
          {(live, over) => (
            <div className="board -mx-3 flex min-h-[60vh] flex-1 snap-x items-stretch gap-4 overflow-x-auto px-3 pb-4 scroll-px-3 sm:-mx-5 sm:px-5 sm:scroll-px-5 lg:-mr-9 lg:-ml-8 lg:pr-9 lg:pl-8 lg:scroll-pl-8">
              {cols.map(c => {
                const cid = 'col:' + c.id, hot = over === cid, ids = live[cid] ?? []
                return (
                  <section key={c.id} aria-label={c.title} className={`group/col flex w-[300px] shrink-0 snap-start flex-col transition-opacity duration-200 ${over && !hot ? 'opacity-45' : ''}`}>
                    <Drop id={cid} active={hot} fill>
                      <h2 className={`flex items-center gap-2 border-b py-2 text-sm font-semibold transition-[color,border-color,box-shadow] ${hot ? 'border-iris text-white shadow-[inset_0_-2px_0_var(--color-iris)]' : `border-white/[0.08] ${c.id === 'none' ? 'text-white/50' : 'text-white/85'}`}`}>
                        {c.mark}<span className="min-w-0 flex-1 truncate">{c.title}</span>
                        <span className="text-xs font-normal text-white/35 tabular-nums">{ids.length}</span>
                      </h2>
                      <KanbanCol id={cid} ids={ids}>
                        {ids.length > 0 && <div className="space-y-1 pt-3">{ids.map(k => { const t = taskOf(k); return t && <SortableTask key={k} dragId={k} task={t} ctx={ctx} showProject={showProject} card /> })}</div>}
                      </KanbanCol>
                      <div className="transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/col:opacity-100 [@media(hover:hover)]:focus-within:opacity-100">{adder(c.id)}</div>
                    </Drop>
                  </section>
                )
              })}
              {!cols.length && nothing}
            </div>
          )}
        </Kanban>
      ) : v.layout === 'table' ? (tasks.length ? (
        <DayTable viewId={v.id} flip={v.flip} days={dayCols} rows={cols.filter(c => c.tasks.length)} render={t => t.ghostOf ? <Ghost key={t.id} task={t} ctx={ctx}><TableTask task={t} ctx={ctx} group={group} /></Ghost> : <TableTask key={t.id} task={t} ctx={ctx} group={group} />} />
      ) : nothing) : <>
        {!tasks.length && nothing}
        {group === 'none' || !tasks.length ? <><TaskList tasks={tasks} ctx={ctx} showProject />{group === 'none' && adder('all')}</>
          : cols.filter(c => c.tasks.length).map(c => <Group key={c.id} title={c.title} count={c.tasks.length}><TaskList tasks={c.tasks} ctx={ctx} showProject={showProject} />{adder(c.id)}</Group>)}
      </>}
      {config}
      {del && <Dialog title="Excluir visualização" onClose={() => setDel(false)} footer={<>
        <button type="button" className={btnGhost} onClick={() => setDel(false)}>Cancelar</button>
        <button type="button" autoFocus className={`${btnPrimary} !bg-coral`} onClick={() => { go(back); ctx.dispatch({ type: 'removeView', id }) }}>Excluir visualização</button>
      </>}>
        <p className="text-sm text-white/70">“{saved.name}” será removida{team ? ' para todo o time' : ''}. As tarefas continuam onde estão.</p>
      </Dialog>}
    </>
  )
}

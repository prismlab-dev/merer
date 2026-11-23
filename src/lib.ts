// Domain model + pure helpers (dates, recurrence, quick-add parsing, automations).

export type Priority = 1 | 2 | 3 | 4

export type Status =
  | { kind: 'check'; done: boolean }
  | { kind: 'progress'; value: number } // 0–100
  | { kind: 'stages'; stages: string[]; current: number } // done at last stage
  | { kind: 'subtasks'; done: number; total: number } // counts kept in sync by the store

// "Quando fazer" — Todoist only has date/time; here it can also be a window.
export type When =
  | { kind: 'date'; date: string }
  | { kind: 'time'; date: string; time: string }
  | { kind: 'window'; start: string; end: string } // any day in range
  | { kind: 'slot'; date: string; from: string; to: string } // time range on a day

export type Unit = 'day' | 'week' | 'month' | 'year'
export interface Recurrence {
  every: number
  unit: Unit
  weekdays: number[] // 0=dom … 6=sáb, only for unit 'week'
  anchor: 'schedule' | 'completion' // like Todoist "every" vs "every!"
  until: string | null
}

export interface Task {
  id: string
  ghostOf?: string // a projected repeat of this task id; never stored
  title: string
  description: string
  projectId: string
  section?: string | null // id from Project.sections; unknown ids fall back to no section
  parentId: string | null
  priority: Priority
  tags: string[]
  assignees: string[]
  status: Status
  when: When | null
  deadline: string | null // hard limit, independent from "when"
  durationMin: number | null
  recurrence: Recurrence | null
  dependsOn: string[]
  completedAt: string | null
  completions: number
  createdBy?: string // email; only stamped on team tasks
}

// `team` is only set on the merged personal view, so rows can show where a delegated task comes from.
// `members` (emails) only exists on team projects; missing = the whole team (projects made before it existed).
export interface Project { id: string; name: string; color: string; team?: { id: string; name: string; color: string }; members?: string[]; sections?: { id: string; name: string }[]; board?: boolean }
export const projectMembers = (p: Project, team: string[]) => p.members ?? team
export interface Person { id: string; name: string; photo?: string }

export interface Automation {
  id: string
  name: string
  enabled: boolean
  trigger: { kind: 'task'; taskId: string } | { kind: 'tag'; tag: string } | { kind: 'project'; projectId: string }
  action: { title: string; projectId: string; inDays: number | null; priority: Priority; tags: string[] }
  runs: number
}

// ---------- dates ----------
export const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const parseISO = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const today = () => iso(new Date())
export const addDays = (s: string, n: number) => {
  const d = parseISO(s)
  d.setDate(d.getDate() + n)
  return iso(d)
}
export const diffDays = (a: string, b: string) => Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 864e5)
const addMonths = (s: string, n: number) => {
  const d = parseISO(s)
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + n)
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()))
  return iso(d)
}

const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
export const WEEKDAYS = WD
const WD_LONG = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
/** Hoje / Amanhã / Ontem, weekday name within the next 6 days, else "3 nov". */
export function fmtDay(s: string, ref = today()) {
  const n = diffDays(ref, s)
  if (n === 0) return 'Hoje'
  if (n === 1) return 'Amanhã'
  if (n === -1) return 'Ontem'
  const d = parseISO(s)
  if (n > 1 && n < 7) return WD_LONG[d.getDay()]
  const base = `${d.getDate()} ${d.toLocaleString('pt-BR', { month: 'short' }).replace('.', '')}`
  return d.getFullYear() === parseISO(ref).getFullYear() ? base : `${base} ${d.getFullYear()}`
}

/** First and last day a task can be worked on. */
export function span(w: When): [string, string] {
  return w.kind === 'window' ? [w.start, w.end] : [w.date, w.date]
}

export function fmtWhen(w: When) {
  switch (w.kind) {
    case 'date': return fmtDay(w.date)
    case 'time': return `${fmtDay(w.date)} ${w.time}`
    case 'slot': return `${fmtDay(w.date)} ${w.from}–${w.to}`
    case 'window': return `${fmtDay(w.start)} até ${fmtDay(w.end)}`
  }
}

export function fmtDuration(min: number) {
  const h = Math.floor(min / 60), m = min % 60
  return h ? (m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`) : `${m}min`
}

const UNIT_LABEL: Record<Unit, [string, string]> = {
  day: ['dia', 'dias'], week: ['semana', 'semanas'], month: ['mês', 'meses'], year: ['ano', 'anos'],
}
export function fmtRecurrence(r: Recurrence) {
  let s = r.every === 1 ? `Todo ${UNIT_LABEL[r.unit][0]}` : `A cada ${r.every} ${UNIT_LABEL[r.unit][1]}`
  if (r.unit === 'day' && r.every === 1) s = 'Todo dia'
  if (r.unit === 'week' && r.weekdays.length) s += ` · ${[...r.weekdays].sort().map(d => WD[d]).join(', ')}`
  if (r.anchor === 'completion') s += ' após concluir'
  if (r.until) s += ` até ${fmtDay(r.until)}`
  return s
}

/** Next occurrence strictly after `from`. ponytail: weekday sets ignore `every` > 1. */
export function nextDate(r: Recurrence, from: string): string {
  if (r.unit === 'week' && r.weekdays.length) {
    for (let i = 1; i <= 7; i++) {
      const c = addDays(from, i)
      if (r.weekdays.includes(parseISO(c).getDay())) return c
    }
  }
  if (r.unit === 'day') return addDays(from, r.every)
  if (r.unit === 'week') return addDays(from, 7 * r.every)
  if (r.unit === 'month') return addMonths(from, r.every)
  return addMonths(from, 12 * r.every)
}

/** Shift a When so it starts at `date`, keeping its shape (window length, times). */
export function moveWhen(w: When, date: string): When {
  if (w.kind === 'window') return { ...w, start: date, end: addDays(date, diffDays(w.start, w.end)) }
  return { ...w, date }
}

/** Upcoming occurrences, for the series preview. */
export function occurrences(w: When, r: Recurrence, count: number): When[] {
  const out: When[] = [w]
  let cur = w
  while (out.length < count) {
    const n = nextDate(r, span(cur)[0])
    if (r.until && n > r.until) break
    cur = moveWhen(cur, n)
    out.push(cur)
  }
  return out
}

/** The next `n` repeats of open recurring tasks, as read-only copies on their future dates. */
export const projections = (tasks: Task[], n = 3): Task[] => tasks.flatMap(t => t.recurrence && t.when && !isDone(t.status)
  ? occurrences(t.when, t.recurrence, n + 1).slice(1).map((when, i) => ({ ...t, id: `${t.id}~${i + 1}`, when, ghostOf: t.id,
    deadline: t.deadline && addDays(t.deadline, diffDays(span(t.when!)[0], span(when)[0])) }))
  : [])

// ---------- status ----------
export function isDone(s: Status) {
  if (s.kind === 'subtasks') return s.total > 0 && s.done >= s.total
  return s.kind === 'check' ? s.done : s.kind === 'progress' ? s.value >= 100 : s.current >= s.stages.length - 1
}
export function progressOf(s: Status) {
  if (s.kind === 'subtasks') return s.done / Math.max(1, s.total)
  return s.kind === 'check' ? (s.done ? 1 : 0) : s.kind === 'progress' ? s.value / 100 : s.current / Math.max(1, s.stages.length - 1)
}
export function resetStatus(s: Status): Status {
  if (s.kind === 'subtasks') return { ...s, done: 0 }
  return s.kind === 'check' ? { ...s, done: false } : s.kind === 'progress' ? { ...s, value: 0 } : { ...s, current: 0 }
}
export function completeStatus(s: Status): Status {
  if (s.kind === 'subtasks') return { ...s, done: s.total }
  return s.kind === 'check' ? { ...s, done: true } : s.kind === 'progress' ? { ...s, value: 100 } : { ...s, current: s.stages.length - 1 }
}
/** One click on the status glyph. */
export function stepStatus(s: Status): Status {
  if (s.kind === 'subtasks') return s // driven by the subtasks themselves
  if (s.kind === 'check') return { ...s, done: !s.done }
  if (s.kind === 'progress') return { ...s, value: s.value >= 100 ? 0 : Math.min(100, Math.floor(s.value / 25) * 25 + 25) }
  return { ...s, current: s.current >= s.stages.length - 1 ? 0 : s.current + 1 }
}

export const blockers = (t: Task, all: Task[]) =>
  t.dependsOn.map(id => all.find(x => x.id === id)).filter((x): x is Task => {
    if (!x || isDone(x.status)) return false
    // ponytail: recurring dep counts as done for this cycle once it rolled past t's date
    if (x.recurrence && x.when && t.when) return span(x.when)[0] <= span(t.when)[0]
    return true
  })

// ---------- quick add: "Revisar contrato p1 #Trabalho @jurídico +ana amanhã 30min" ----------
export interface Parsed { title: string; priority?: Priority; project?: string; tags: string[]; people: string[]; date?: string; time?: string; durationMin?: number }
export type QuickKind = 'priority' | 'project' | 'tag' | 'person' | 'date' | 'time' | 'duration'
/** What a quick-add word means, or null if it belongs to the title. Shared by the parser and the input highlight. */
export function quickKind(tok: string): QuickKind | null {
  const low = tok.toLowerCase()
  let m: RegExpMatchArray | null
  if (/^p[1-4]$/.test(low)) return 'priority'
  if (tok.length > 1 && tok[0] === '#') return 'project'
  if (tok.length > 1 && tok[0] === '@') return 'tag'
  if (tok.length > 1 && tok[0] === '+') return 'person'
  if (low === 'hoje' || low === 'amanhã' || low === 'amanha') return 'date'
  if ((m = low.match(/^(\d{1,2})h(\d{2})?$/)) && Number(m[1]) < 24) return 'time'
  if (/^\d+(min|m)$/.test(low) || /^\d+(?:[.,]\d+)?hr?s?$/.test(low)) return 'duration'
  return null
}

/** Splits input into words and spaces, tagging each word with its quick-add meaning. */
export function quickTokens(input: string) {
  let hasTime = false
  return input.split(/(\s+)/).filter(Boolean).map(text => {
    let kind = /\s/.test(text) ? null : quickKind(text)
    if (kind === 'time') { if (hasTime) kind = null; hasTime = true } // only the first time counts
    return { text, kind }
  })
}

export function parseQuick(input: string, ref = today()): Parsed {
  const out: Parsed = { title: '', tags: [], people: [] }
  const rest: string[] = []
  for (const { text: tok, kind } of quickTokens(input.trim())) {
    const low = tok.toLowerCase()
    if (/^\s/.test(tok)) continue
    if (kind === 'priority') out.priority = Number(low[1]) as Priority
    else if (kind === 'project') out.project = tok.slice(1)
    else if (kind === 'tag') out.tags.push(tok.slice(1))
    else if (kind === 'person') out.people.push(tok.slice(1))
    else if (kind === 'date') out.date = low === 'hoje' ? ref : addDays(ref, 1)
    else if (kind === 'time') { const [h, mm = '00'] = low.split('h'); out.time = `${h.padStart(2, '0')}:${mm || '00'}` }
    else if (kind === 'duration') out.durationMin = low.includes('m') && !low.includes('h') ? parseInt(low) : Math.round(parseFloat(low.replace(',', '.')) * 60)
    else rest.push(tok)
  }
  out.title = rest.join(' ')
  return out
}

export const uid = () => Math.random().toString(36).slice(2, 10)

// ---------- automations ----------
export function matches(a: Automation, t: Task) {
  if (!a.enabled) return false
  const tr = a.trigger
  return tr.kind === 'task' ? tr.taskId === t.id : tr.kind === 'tag' ? t.tags.includes(tr.tag) : tr.projectId === t.projectId
}

export function blankTask(p: Partial<Task> & { title: string; projectId: string }): Task {
  return {
    id: uid(), description: '', parentId: null, priority: 4, tags: [], assignees: [],
    status: { kind: 'check', done: false }, when: null, deadline: null, durationMin: null,
    recurrence: null, dependsOn: [], completedAt: null, completions: 0, ...p,
  }
}

export const IN_DAYS: [number | null, string][] = [[0, 'No mesmo dia'], [1, 'No dia seguinte'], [3, 'Em 3 dias'], [7, 'Em 1 semana'], [null, 'Sem data']]

// ---------- saved views ----------
export type ViewStatus = 'open' | 'moving' | 'blocked' | 'done' | 'all'
export type ViewDue = 'any' | 'late' | 'today' | 'week' | 'none'
export type ViewGroup = 'none' | 'section' | 'project' | 'person' | 'tag' | 'priority' | 'date'
export type ViewSort = 'date' | 'deadline' | 'priority' | 'title'
/** A filter + layout the user named. Empty lists mean "any"; '' in people means "no assignee". */
export interface SavedView {
  id: string
  name: string
  status: ViewStatus
  projects: string[]
  people: string[]
  tags: string[]
  tagMode: 'all' | 'any'
  priorities: Priority[]
  due: ViewDue
  layout: 'list' | 'board' | 'table' // table: rows by group, one column per day
  group: ViewGroup
  sort: ViewSort
  color?: string // icon only; unset follows the first project or tag
  pinned?: boolean // shown in the sidebar; personal views only
  projections?: boolean // also show the next repeats of recurring tasks, faded
  weekdays?: number[] // table only, 0=dom … 6=sáb; unset = the next 7 days
  flip?: boolean // table only: days as rows, groups as columns
}
export const blankView = (p: Partial<SavedView> = {}): SavedView => ({
  id: 'new', name: '', status: 'open', projects: [], people: [], tags: [], tagMode: 'all', priorities: [], due: 'any', layout: 'list', group: 'none', sort: 'date', ...p,
})

/** Sections only exist inside one project, a board needs columns, and a table needs rows (its columns are already days). */
export const viewGroup = (v: SavedView): ViewGroup =>
  v.group === 'section' && v.projects.length !== 1 ? 'project'
  : (v.group === 'none' && v.layout !== 'list') || (v.group === 'date' && v.layout === 'table') ? (v.projects.length === 1 ? 'section' : 'project')
  : v.group

function inView(v: SavedView, t: Task, all: Task[], ref: string) {
  const done = isDone(t.status)
  if (v.status === 'done' ? !done : v.status !== 'all' && done) return false
  if (v.status === 'moving' && progressOf(t.status) === 0) return false
  if (v.status === 'blocked' && !blockers(t, all).length) return false
  if (v.projects.length && !v.projects.includes(t.projectId)) return false
  if (v.people.length && !v.people.some(p => p ? t.assignees.includes(p) : !t.assignees.length)) return false
  if (v.tags.length && !(v.tagMode === 'all' ? v.tags.every(g => t.tags.includes(g)) : v.tags.some(g => t.tags.includes(g)))) return false
  if (v.priorities.length && !v.priorities.includes(t.priority)) return false
  const [s, e] = t.when ? span(t.when) : ['', '']
  const within = (to: string) => (!!s && s <= to && e >= ref) || (!!t.deadline && t.deadline >= ref && t.deadline <= to)
  switch (v.due) {
    case 'any': return true
    case 'none': return !t.when && !t.deadline
    case 'late': return (!!e && e < ref) || (!!t.deadline && t.deadline < ref)
    case 'today': return within(ref)
    case 'week': return within(addDays(ref, 6))
  }
}

/** Tasks of a view, sorted. A subtask steps out on its own only when its parent isn't in the view, unless `flat` (the table, where each sits on its own day). */
export function viewTasks(v: SavedView, all: Task[], ref = today(), flat = false): Task[] {
  const g = viewGroup(v), nestAll = g === 'project' || g === 'section' // rows there skip the project, so every parent lists its subtasks
  const apart = g === 'person' || g === 'tag' || g === 'priority' // a subtask may belong in another group than its parent's
  const hit = all.filter(t => inView(v, t, all, ref))
  const ids = new Set(hit.map(t => t.id))
  const when = (t: Task) => t.when ? span(t.when)[0] + (t.when.kind === 'time' ? t.when.time : t.when.kind === 'slot' ? t.when.from : '99') : '9999'
  const key = (t: Task) => v.sort === 'title' ? t.title.toLowerCase() : v.sort === 'priority' ? t.priority + when(t) : v.sort === 'deadline' ? t.deadline ?? '9999' : when(t) + t.priority
  // Elsewhere only parents driven by their subtasks list them beneath (see TaskRow), so other subtasks keep their own row.
  const nests = (t: Task) => {
    const p = ids.has(t.parentId!) && all.find(x => x.id === t.parentId)
    return !!p && !apart && (nestAll || p.status.kind === 'subtasks' && (!t.when || !!p.when && span(t.when)[0] === span(p.when)[0]))
  }
  return hit.filter(t => flat || !t.parentId || !nests(t)).sort((a, b) => key(a).localeCompare(key(b), 'pt-BR'))
}

/** Day bucket of a task, for grouping by date. */
export function dateBucket(t: Task, ref = today()) {
  const [s, e] = t.when ? span(t.when) : [t.deadline, t.deadline]
  if (!s || !e) return 'none'
  return e < ref ? 'late' : s <= ref ? 'today' : s === addDays(ref, 1) ? 'tomorrow' : s <= addDays(ref, 6) ? 'week' : 'later'
}

/** Days of a table: the next 7, or the picked weekdays of this week (next week once they've all passed). */
export function tableDays(weekdays: number[] = [], ref = today()): string[] {
  const week = (from: string) => Array.from({ length: 7 }, (_, i) => addDays(from, i))
  if (!weekdays.length) return week(ref)
  const mon = addDays(ref, -((parseISO(ref).getDay() + 6) % 7))
  const pick = (from: string) => week(from).filter(d => weekdays.includes(parseISO(d).getDay()))
  return pick(mon).some(d => d >= ref) ? pick(mon) : pick(addDays(mon, 7))
}

/** Whether a task falls on a day: scheduled across it, or due that day. */
export const onDay = (t: Task, day: string) => (!!t.when && span(t.when)[0] <= day && span(t.when)[1] >= day) || t.deadline === day

/** Free-form sticky note; the first line reads as its title. */
export interface Note { id: string; text: string; color: string; pinned: boolean; updatedAt: string }

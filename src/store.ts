import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { supabase } from './auth'
import {
  type Automation, type Note, type Person, type Project, type SavedView, type Task,
  addDays, blankTask, diffDays, isDone, matches, moveWhen, nextDate, resetStatus, span, today, uid,
} from './lib'

export interface State {
  tasks: Task[]
  projects: Project[]
  people: Person[]
  automations: Automation[]
  notes: Note[]
  tagColors?: Record<string, string> // tags without an entry use colorFor's hash
  views?: SavedView[]
  sidebarOrder?: string[] // your own + team project ids as you arranged them in the sidebar; only yours
  toast: { id: string; text: string } | null
}

export type Action =
  | { type: 'add'; task: Task }
  | { type: 'update'; id: string; patch: Partial<Task> }
  | { type: 'remove'; id: string }
  | { type: 'saveProject'; project: Project }
  | { type: 'renameTag'; from: string; to: string; color?: string }
  | { type: 'removeProject'; id: string }
  | { type: 'removeTag'; tag: string }
  | { type: 'saveAutomation'; automation: Automation }
  | { type: 'removeAutomation'; id: string }
  | { type: 'saveNote'; note: Note }
  | { type: 'removeNote'; id: string }
  | { type: 'saveView'; view: SavedView }
  | { type: 'removeView'; id: string }
  | { type: 'reorder'; list: 'tasks' | 'projects'; from: string; to: string }
  | { type: 'sidebarOrder'; ids: string[] }
  | { type: 'dismissToast' }
  | { type: 'replace'; state: State }

const KEY = 'silus-tasks-v2'

function updateTask(s: State, a: Extract<Action, { type: 'update' }>): State {
  const prev = s.tasks.find(t => t.id === a.id)
  if (!prev) return s
  let next: Task = { ...prev, ...a.patch }
  const completing = a.patch.status && !isDone(prev.status) && isDone(next.status)
  if (a.patch.status && !isDone(next.status)) next.completedAt = null
  if (!completing) return { ...s, tasks: s.tasks.map(t => (t.id === a.id ? next : t)) }

  const notes: string[] = []
  let tasks = s.tasks
  // Recurring: roll forward instead of closing (Todoist behaviour).
  const r = next.recurrence
  const base = r && next.when ? (r.anchor === 'completion' ? today() : span(next.when)[0]) : null
  const nd = r && base ? nextDate(r, base) : null
  if (r && next.when && nd && !(r.until && nd > r.until)) {
    const shift = diffDays(span(next.when)[0], nd)
    next = {
      ...next, when: moveWhen(next.when, nd), status: resetStatus(next.status),
      deadline: next.deadline && addDays(next.deadline, shift), completions: next.completions + 1,
    }
    // Subtask-driven status: the next cycle starts with every subtask open again.
    if (next.status.kind === 'subtasks') tasks = tasks.map(t => (t.parentId === a.id ? { ...t, status: resetStatus(t.status), completedAt: null } : t))
    notes.push('Próxima ocorrência agendada')
  } else next.completedAt = new Date().toISOString()

  const created: Task[] = []
  const automations = s.automations.map(au => {
    if (!matches(au, prev)) return au
    const { title, projectId, inDays, priority, tags } = au.action
    created.push(blankTask({
      title, projectId, priority, tags,
      when: inDays === null ? null : { kind: 'date', date: addDays(today(), inDays) },
    }))
    notes.push(`${au.name} criou “${title}”`)
    return { ...au, runs: au.runs + 1 }
  })
  return {
    ...s, automations,
    tasks: [...tasks.map(t => (t.id === a.id ? next : t)), ...created],
    toast: notes.length ? { id: uid(), text: notes.join(' · ') } : s.toast,
  }
}

/** Keeps a 'subtasks' status in sync with its children; finishing the last one completes (or rolls) the parent. */
function syncParent(s: State, id: string | null): State {
  const p = id ? s.tasks.find(t => t.id === id) : undefined
  if (!p || p.status.kind !== 'subtasks') return s
  const subs = s.tasks.filter(t => t.parentId === p.id)
  const done = subs.filter(t => isDone(t.status)).length
  if (done === p.status.done && subs.length === p.status.total) return s
  return reducer(s, { type: 'update', id: p.id, patch: { status: { kind: 'subtasks', done, total: subs.length } } })
}

export function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'add': return syncParent({ ...s, tasks: [...s.tasks, a.task] }, a.task.parentId)
    case 'remove': {
      const gone = new Set([a.id, ...s.tasks.filter(t => t.parentId === a.id).map(t => t.id)])
      return syncParent({
        ...s,
        tasks: s.tasks.filter(t => !gone.has(t.id)).map(t => ({ ...t, dependsOn: t.dependsOn.filter(d => !gone.has(d)) })),
        automations: s.automations.filter(x => !(x.trigger.kind === 'task' && gone.has(x.trigger.taskId))),
      }, s.tasks.find(t => t.id === a.id)?.parentId ?? null)
    }
    case 'update': {
      const parentId = s.tasks.find(t => t.id === a.id)?.parentId ?? null
      return syncParent(syncParent(updateTask(s, a), a.id), parentId)
    }
    case 'saveProject': {
      const exists = s.projects.some(p => p.id === a.project.id)
      return { ...s, projects: exists ? s.projects.map(p => (p.id === a.project.id ? a.project : p)) : [...s.projects, a.project] }
    }
    case 'renameTag': {
      const swap = (tags: string[]) => tags.includes(a.from) ? [...new Set(tags.map(g => (g === a.from ? a.to : g)))] : tags
      const { [a.from]: old, ...tagColors } = s.tagColors ?? {}
      const color = a.color ?? old
      return {
        ...s,
        tagColors: color ? { ...tagColors, [a.to]: color } : tagColors,
        tasks: s.tasks.map(t => (t.tags.includes(a.from) ? { ...t, tags: swap(t.tags) } : t)),
        views: s.views?.map(v => ({ ...v, tags: swap(v.tags) })),
        automations: s.automations.map(x => ({
          ...x,
          trigger: x.trigger.kind === 'tag' && x.trigger.tag === a.from ? { ...x.trigger, tag: a.to } : x.trigger,
          action: { ...x.action, tags: swap(x.action.tags) },
        })),
      }
    }
    case 'removeProject': {
      // Tasks go with the project; automations creating into it fall back to the inbox.
      const gone = new Set(s.tasks.filter(t => t.projectId === a.id).map(t => t.id))
      return {
        ...s,
        projects: s.projects.filter(p => p.id !== a.id),
        tasks: s.tasks.filter(t => !gone.has(t.id)).map(t => ({ ...t, dependsOn: t.dependsOn.filter(d => !gone.has(d)) })),
        automations: s.automations
          .filter(x => !(x.trigger.kind === 'project' && x.trigger.projectId === a.id) && !(x.trigger.kind === 'task' && gone.has(x.trigger.taskId)))
          .map(x => (x.action.projectId === a.id ? { ...x, action: { ...x.action, projectId: 'inbox' } } : x)),
      }
    }
    case 'removeTag': return {
      ...s,
      tagColors: Object.fromEntries(Object.entries(s.tagColors ?? {}).filter(([k]) => k !== a.tag)),
      tasks: s.tasks.map(t => (t.tags.includes(a.tag) ? { ...t, tags: t.tags.filter(g => g !== a.tag) } : t)),
      automations: s.automations
        .filter(x => !(x.trigger.kind === 'tag' && x.trigger.tag === a.tag))
        .map(x => ({ ...x, action: { ...x.action, tags: x.action.tags.filter(g => g !== a.tag) } })),
    }
    case 'saveAutomation': {
      const exists = s.automations.some(x => x.id === a.automation.id)
      return { ...s, automations: exists ? s.automations.map(x => (x.id === a.automation.id ? a.automation : x)) : [...s.automations, a.automation] }
    }
    case 'removeAutomation': return { ...s, automations: s.automations.filter(x => x.id !== a.id) }
    case 'saveNote': {
      const rest = s.notes.filter(x => x.id !== a.note.id)
      return { ...s, notes: [a.note, ...rest] }
    }
    case 'removeNote': return { ...s, notes: s.notes.filter(x => x.id !== a.id) }
    case 'saveView': {
      const views = s.views ?? []
      return { ...s, views: views.some(x => x.id === a.view.id) ? views.map(x => (x.id === a.view.id ? a.view : x)) : [...views, a.view] }
    }
    case 'removeView': return { ...s, views: s.views?.filter(x => x.id !== a.id) }
    case 'reorder': {
      // Move `from` to `to`'s slot in the full array; items hidden by the current view keep their relative order.
      const list: { id: string }[] = s[a.list]
      const i = list.findIndex(x => x.id === a.from), j = list.findIndex(x => x.id === a.to)
      if (i < 0 || j < 0) return s
      const next = [...list]
      next.splice(j, 0, ...next.splice(i, 1))
      // Keep the sidebar in step when projects are reordered from the projects page.
      const o = s.sidebarOrder, oi = o?.indexOf(a.from) ?? -1, oj = o?.indexOf(a.to) ?? -1
      const sidebarOrder = o && oi >= 0 && oj >= 0 ? [...o] : o
      if (sidebarOrder !== o) sidebarOrder!.splice(oj, 0, ...sidebarOrder!.splice(oi, 1))
      return { ...s, [a.list]: next, ...(a.list === 'projects' && { sidebarOrder }) }
    }
    case 'sidebarOrder': {
      // Own projects follow the same relative order, so the projects page matches the sidebar.
      const rank = (id: string) => { const i = a.ids.indexOf(id); return i < 0 ? 1e9 : i }
      return { ...s, sidebarOrder: a.ids, projects: [...s.projects].sort((x, y) => rank(x.id) - rank(y.id)) }
    }
    case 'dismissToast': return { ...s, toast: null }
    case 'replace': return a.state
  }
}

// Delegating only happens inside teams, so personal data drops any old example people and assignees.
const withDefaults = (raw: Partial<State>): State => {
  const s = { ...seed(), notes: [], ...raw, people: [], toast: null }
  return { ...s, tasks: s.tasks.map(t => (t.assignees.length ? { ...t, assignees: [] } : t)) }
}

// Local cache per account renders instantly; Supabase (prism.state) is the source of truth.
function load(key: string): State {
  try {
    const raw = localStorage.getItem(key) ?? localStorage.getItem(KEY)
    if (raw) return withDefaults(JSON.parse(raw))
  } catch { /* fall through to seed */ }
  return seed()
}

export function useStore(userId: string) {
  const key = `${KEY}:${userId}`
  const [state, dispatch] = useReducer(reducer, key, load)
  const synced = useRef(false)

  useEffect(() => {
    supabase.from('state').select('data').eq('user_id', userId).maybeSingle().then(({ data, error }) => {
      if (error) return console.error(error) // stay offline-only; don't overwrite cloud with a stale cache
      if (data) dispatch({ type: 'replace', state: withDefaults(data.data) })
      synced.current = true
      if (!data) dispatch({ type: 'dismissToast' }) // first login: trigger a save of the local state
    })
  }, [userId])

  useEffect(() => {
    const snapshot = { ...state, toast: null }
    try { localStorage.setItem(key, JSON.stringify(snapshot)) } catch { /* storage unavailable */ }
    if (!synced.current) return
    // ponytail: last-write-wins per account, add onSnapshot-style realtime if used on two devices at once
    const id = setTimeout(() => {
      supabase.from('state').upsert({ user_id: userId, data: snapshot, updated_at: new Date().toISOString() })
        .then(({ error }) => error && console.error(error))
    }, 800)
    return () => clearTimeout(id)
  }, [state, key, userId])
  return [state, dispatch] as const
}

export interface Team { id: string; name: string; color: string; members: { email: string; role: 'owner' | 'member' }[]; data: State }
interface TeamRow { id: string; name: string; color: string; data: Partial<State>; updated_at: string; team_members: Team['members'] }
type Shared = Pick<State, 'tasks' | 'projects' | 'automations' | 'tagColors' | 'views'>

/** Three-way merge: keep what others saved (remote) and replay only the fields this tab changed since base. */
export function rebase(base: Shared, local: Shared, remote: Shared): Shared {
  const j = (x: unknown) => JSON.stringify(x)
  // Field by field, so two people editing different fields of one record both keep their edit.
  const fields = <T extends object>(b: T | undefined, l: T, r: T): T => {
    if (!b) return l
    const out = { ...r } as Record<string, unknown>
    const lr = l as Record<string, unknown>, br = b as Record<string, unknown>
    for (const k of new Set([...Object.keys(b), ...Object.keys(l)]) as Set<string>) {
      if (j(lr[k]) === j(br[k])) continue
      // A status and its completion time only make sense together.
      for (const f of k === 'status' || k === 'completedAt' ? ['status', 'completedAt'] : [k]) {
        if (lr[f] === undefined) delete out[f]; else out[f] = lr[f]
      }
    }
    return out as T
  }
  const list = <T extends { id: string }>(b: T[] = [], l: T[] = [], r: T[] = []) => {
    const bs = new Map(b.map(x => [x.id, x])), ls = new Map(l.map(x => [x.id, x])), rs = new Map(r.map(x => [x.id, x]))
    const merge = (x: T) => {
      const mine = ls.get(x.id)
      if (!mine) return bs.has(x.id) ? [] : [x] // deleted here, or added remotely
      return [fields(bs.get(x.id), mine, x)]
    }
    const added = l.filter(x => !bs.has(x.id) && !rs.has(x.id))
    // Reordered here (and not there): keep this tab's order, with records new from remote at the end.
    const ids = (xs: T[]) => xs.map(x => x.id)
    const kept = (m: Map<string, T>) => ids(b).filter(id => m.has(id))
    if (j(ids(l)) !== j([...kept(ls), ...ids(added)]) && j(ids(r).filter(id => bs.has(id))) === j(kept(rs))) {
      return [...l.flatMap(x => rs.has(x.id) ? merge(rs.get(x.id)!) : bs.has(x.id) ? [] : [x]), ...r.filter(x => !bs.has(x.id) && !ls.has(x.id))]
    }
    return [...r.flatMap(merge), ...added]
  }
  const projects = list(base.projects, local.projects, remote.projects)
  // A project deleted on either side takes its tasks along, including ones just added to it on the other.
  const gone = new Set([...base.projects, ...local.projects, ...remote.projects].map(p => p.id).filter(id => !projects.some(p => p.id === id)))
  return {
    tasks: list(base.tasks, local.tasks, remote.tasks).filter(t => !gone.has(t.projectId)),
    projects,
    automations: list(base.automations, local.automations, remote.automations),
    views: list(base.views, local.views, remote.views),
    tagColors: fields(base.tagColors ?? {}, local.tagColors ?? {}, remote.tagColors ?? {}),
  }
}

const teamJson = (t: Team) => JSON.stringify({ tasks: t.data.tasks, projects: t.data.projects, automations: t.data.automations, tagColors: t.data.tagColors, views: t.data.views })
type Profiles = Map<string, { name: string | null; photo: string | null }>
const toTeam = (r: TeamRow, profiles: Profiles): Team => ({
  id: r.id, name: r.name, color: r.color, members: r.team_members,
  data: {
    tasks: r.data.tasks ?? [], projects: r.data.projects ?? [], automations: r.data.automations ?? [], tagColors: r.data.tagColors, views: r.data.views, notes: [], toast: null,
    people: r.team_members.map(m => {
      const p = profiles.get(m.email)
      return { id: m.email, name: p?.name || m.email.split('@')[0], photo: p?.photo ?? undefined }
    }),
  },
})

/** Teams the signed-in email belongs to. Each team's data runs through the same reducer as the personal space. */
export function useTeams(me: string) {
  const [teams, setTeams] = useState<Team[]>([])
  // Last server version per team: base for the merge and for the conditional save.
  const saved = useRef(new Map<string, { json: string; at: string }>())
  const saving = useRef(new Set<string>())
  const reloadAfterSave = useRef(false)
  const saves = useRef(0) // finished saves; a load that straddles one read a stale server copy
  const [retry, setRetry] = useState(0)

  const load = useCallback(async (): Promise<void> => {
    const seen = saves.current
    const [{ data, error }, who] = await Promise.all([
      supabase.from('teams').select('id, name, color, data, updated_at, team_members(email, role)').order('updated_at'),
      supabase.rpc('member_profiles'), // name + photo from the Silus profile; see supabase/member_profiles.sql
    ])
    if (error) return console.error(error)
    if (who.error) console.error(who.error)
    const profiles: Profiles = new Map((who.data ?? []).map((p: { email: string; name: string | null; photo: string | null }) => [p.email, p]))
    const rows = data as TeamRow[]
    if (saves.current !== seen) return load()
    setTeams(cur => rows.map(r => {
      const t = toTeam(r, profiles)
      const local = cur.find(x => x.id === t.id)
      // Mid-save the base is stale: merging now could undo edits made since. Keep local and reload after.
      if (local && saving.current.has(t.id)) { reloadAfterSave.current = true; return local }
      const base = saved.current.get(t.id)
      saved.current.set(t.id, { json: teamJson(t), at: r.updated_at })
      // Unsaved local edits are replayed on top of the server version, never instead of it.
      if (local && base && teamJson(local) !== base.json) return { ...t, data: { ...t.data, ...rebase(JSON.parse(base.json), local.data, t.data) } }
      return t
    }))
  }, [])

  useEffect(() => {
    load()
    const ch = supabase.channel('teams')
      .on('postgres_changes', { event: '*', schema: 'prism', table: 'teams' }, load)
      .on('postgres_changes', { event: '*', schema: 'prism', table: 'team_members' }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  useEffect(() => {
    const dirty = teams.filter(t => saved.current.has(t.id) && !saving.current.has(t.id) && teamJson(t) !== saved.current.get(t.id)!.json)
    if (!dirty.length) return
    // ponytail: whole-team document with optimistic lock + merge; move tasks to rows if teams grow large
    const id = setTimeout(() => dirty.forEach(async t => {
      const json = teamJson(t)
      const at = new Date().toISOString()
      saving.current.add(t.id)
      // Only overwrite the version we started from; otherwise reload, merge and try again.
      const { data, error } = await supabase.from('teams').update({ data: JSON.parse(json), updated_at: at })
        .eq('id', t.id).eq('updated_at', saved.current.get(t.id)!.at).select('id')
      saving.current.delete(t.id)
      saves.current++
      if (error) console.error(error)
      else if (data.length) saved.current.set(t.id, { json, at })
      else await load()
      if (reloadAfterSave.current && !saving.current.size) { reloadAfterSave.current = false; await load() }
      setRetry(n => n + 1)
    }), 800)
    return () => clearTimeout(id)
  }, [teams, retry, load])

  // Team tasks remember who made them; personal ones are always yours.
  const dispatchTeam = useCallback((id: string, a: Action) => {
    if (a.type === 'add' && !a.task.createdBy) a = { ...a, task: { ...a.task, createdBy: me } }
    setTeams(ts => ts.map(t => (t.id === id ? { ...t, data: reducer(t.data, a) } : t)))
  }, [me])

  const fail = (error: { message: string } | null) => { if (error) { alert(`Não foi possível salvar: ${error.message}`); return true } return false }
  const api = {
    create: async (name: string, color: string) => {
      const { data, error } = await supabase.from('teams')
        .insert({ name, color, data: { tasks: [], projects: [{ id: uid(), name: 'Geral', color }], automations: [] } }).select('id').single()
      if (fail(error) || !data) return null
      if (fail((await supabase.from('team_members').insert({ team_id: data.id, email: me, role: 'owner' })).error)) return null
      await load()
      return data.id as string
    },
    rename: async (id: string, name: string, color: string) => { if (!fail((await supabase.from('teams').update({ name, color }).eq('id', id)).error)) await load() },
    invite: async (id: string, email: string) => { if (!fail((await supabase.from('team_members').insert({ team_id: id, email: email.trim().toLowerCase() })).error)) await load() },
    removeMember: async (id: string, email: string) => { if (!fail((await supabase.from('team_members').delete().eq('team_id', id).eq('email', email)).error)) await load() },
    remove: async (id: string) => { if (!fail((await supabase.from('teams').delete().eq('id', id)).error)) await load() },
  }
  return { teams, dispatchTeam, api }
}
export type TeamApi = ReturnType<typeof useTeams>['api']

export function seed(): State {
  const t = today()
  const d = (n: number) => addDays(t, n)
  const projects: Project[] = [
    { id: 'inbox', name: 'Entrada', color: '#5cb8ff' },
    { id: 'launch', name: 'Lançamento Prism', color: '#9b8cff' },
    { id: 'home', name: 'Casa', color: '#3dd6c3' },
    { id: 'personal', name: 'Pessoal', color: '#e58ad6' },
  ]
  const k = (p: Partial<Task> & { title: string; projectId: string; id: string }) => blankTask(p)
  const tasks: Task[] = [
    k({ id: 'brief', title: 'Fechar briefing da landing', projectId: 'launch', priority: 1, tags: ['design'],
      when: { kind: 'time', date: t, time: '10:00' }, durationMin: 60, deadline: d(1),
      description: 'Público, proposta de valor e as três seções principais. Validar com a Ana antes de passar para o Bruno.' }),
    k({ id: 'copy', title: 'Escrever textos da página inicial', projectId: 'launch', priority: 2, tags: ['conteúdo'],
      status: { kind: 'progress', value: 40 }, when: { kind: 'window', start: d(0), end: d(4) }, deadline: d(5), durationMin: 180, dependsOn: [] }),
    k({ id: 'build', title: 'Implementar landing em produção', projectId: 'launch', priority: 2, tags: ['dev'],
      status: { kind: 'stages', stages: ['A fazer', 'Em desenvolvimento', 'Em revisão', 'Publicado'], current: 0 },
      when: { kind: 'window', start: d(3), end: d(8) }, deadline: d(9), durationMin: 480, dependsOn: ['brief', 'copy'] }),
    k({ id: 'b1', title: 'Hero com prévia do app', projectId: 'launch', parentId: 'build' }),
    k({ id: 'b2', title: 'Seção de preços', projectId: 'launch', parentId: 'build' }),
    k({ id: 'b3', title: 'Formulário de lista de espera', projectId: 'launch', parentId: 'build', status: { kind: 'check', done: true } }),
    k({ id: 'review', title: 'Revisão semanal do lançamento', projectId: 'launch', priority: 3,
      when: { kind: 'slot', date: d(1), from: '14:00', to: '15:00' }, durationMin: 60,
      recurrence: { every: 1, unit: 'week', weekdays: [], anchor: 'schedule', until: null } }),
    k({ id: 'rent', title: 'Pagar aluguel', projectId: 'home', priority: 1, tags: ['contas'],
      when: { kind: 'date', date: d(-1) }, deadline: d(2),
      recurrence: { every: 1, unit: 'month', weekdays: [], anchor: 'schedule', until: null } }),
    k({ id: 'plants', title: 'Regar as plantas', projectId: 'home', tags: ['rotina'], when: { kind: 'date', date: t }, durationMin: 10,
      recurrence: { every: 1, unit: 'week', weekdays: [1, 4], anchor: 'schedule', until: null } }),
    k({ id: 'filter', title: 'Trocar filtro do purificador', projectId: 'home', when: { kind: 'date', date: d(12) },
      recurrence: { every: 3, unit: 'month', weekdays: [], anchor: 'completion', until: null } }),
    k({ id: 'book', title: 'Ler “Working in Public”', projectId: 'personal', tags: ['leitura'],
      status: { kind: 'progress', value: 65 }, when: { kind: 'window', start: d(-3), end: d(10) } }),
    k({ id: 'doctor', title: 'Marcar consulta de rotina', projectId: 'personal', priority: 2, tags: ['saúde'],
      when: { kind: 'window', start: d(1), end: d(6) }, deadline: d(14) }),
    k({ id: 'idea', title: 'Anotar ideias de integrações', projectId: 'inbox', description: 'Calendário, e-mail, Prism Finance.' }),
    k({ id: 'receipt', title: 'Enviar comprovante para a contabilidade', projectId: 'inbox', tags: ['contas'],
      dependsOn: ['rent'], when: { kind: 'date', date: d(1) } }),
  ]
  const automations: Automation[] = [
    { id: 'a1', name: 'Após o briefing', enabled: true, trigger: { kind: 'task', taskId: 'brief' },
      action: { title: 'Agendar sessão de fotos do produto', projectId: 'launch', inDays: 2, priority: 3, tags: ['design'] }, runs: 0 },
    { id: 'a2', name: 'Contas pagas', enabled: true, trigger: { kind: 'tag', tag: 'contas' },
      action: { title: 'Atualizar planilha no Prism', projectId: 'inbox', inDays: 0, priority: 4, tags: [] }, runs: 0 },
  ]
  const at = (h: number) => new Date(Date.now() - h * 3.6e6).toISOString()
  const notes: Note[] = [
    { id: 'n1', text: 'Ideias para o hero\nMostrar a linha do tempo de uma tarefa recorrente rolando para a próxima data.', color: '#9b8cff', pinned: true, updatedAt: at(1) },
    { id: 'n2', text: 'Senha do wi-fi da Casa: prisma2026', color: '#3dd6c3', pinned: true, updatedAt: at(20) },
    { id: 'n3', text: 'Perguntar à Carla se o comprovante precisa ir em PDF.', color: '#f7c04a', pinned: false, updatedAt: at(50) },
  ]
  return { tasks, projects, people: [], automations, notes, toast: null }
}

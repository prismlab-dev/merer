import { useCallback, useEffect, useState, type ComponentProps, type CSSProperties } from 'react'
import { type Task, isDone, projectMembers, span, today, uid } from './lib'
import { type Action, type State, type Team, useStore, useTeams } from './store'
import { ColorField, Popover, Tip } from './controls'
import { QuickAdd, QuickAddModal, type Ctx } from './tasks'
import { ProjectPeople, TeamView, TeamsView } from './teams'
import { Sortable, useRow } from './sortable'
import { TaskDetail } from './TaskDetail'
import { HomeView, PomodoroView } from './home'
import { NotesView } from './notes'
import { SettingsDialog, bgProps, useLook } from './settings'
import { Avatar, Dialog, Icon, Logo, PALETTE, PROJECT_COLORS, btnGhost, btnPrimary, colorFor, setTagColors, inputCls, tint, type IconName } from './ui'
import { AutomationsView, FILTERS, HeadSlot, MenuItem, ProjectsView, FiltersView, TagsView, ListView, NameField, ProjectView, TodayView, UpcomingView, UpcomingWindows, type View } from './views'

export default function App({ userId, email }: { userId: string; email: string }) {
  const [state, dispatch] = useStore(userId)
  const { teams, dispatchTeam, api: teamApi } = useTeams(email)
  const [teamsOpen, setTeamsOpen] = useState(true)
  const [look, setLook] = useLook()
  const [view, setView] = useState<View>({ kind: 'home' })
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [nav, setNav] = useState(false)
  const [projectsOpen, setProjectsOpen] = useState(true)
  const [moreAnchor, setMoreAnchor] = useState<HTMLButtonElement | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [mini, setMini] = useState(() => { try { return localStorage.getItem('prism:mini') === '1' } catch { return false } })
  const toggleMini = () => setMini(m => { try { localStorage.setItem('prism:mini', m ? '0' : '1') } catch { /* private mode */ } return !m })
  const [q, setQ] = useState('')
  const [dialog, setDialog] = useState<'project' | 'team' | 'tag' | 'settings' | null>(null)
  // team: the project belongs to that team (project dialog), or the team being edited (team dialog).
  const [draft, setDraft] = useState<{ id?: string; name: string; color: string; team?: string }>({ name: '', color: PROJECT_COLORS[0] })
  const open = useCallback((id: string) => setOpenId(id), [])

  // Your space = your own data + team tasks assigned to you (and their subtasks); edits are routed back to the team.
  const assigned = (tm: Team, t: Task): boolean => t.assignees.includes(email) || (!!t.parentId && tm.data.tasks.some(p => p.id === t.parentId && assigned(tm, p)))
  const teamOf = (taskOrProject: string) => teams.find(tm => tm.data.tasks.some(t => t.id === taskOrProject) || tm.data.projects.some(p => p.id === taskOrProject))
  const merged: State = {
    ...state, people: [],
    tasks: [...state.tasks, ...teams.flatMap(tm => tm.data.tasks.filter(t => assigned(tm, t)))],
    projects: [...state.projects, ...teams.flatMap(tm => tm.data.projects.map(p => ({ ...p, team: { id: tm.id, name: tm.name, color: tm.color } })))],
  }
  const route = (a: Action) => {
    const tm = a.type === 'update' || a.type === 'remove' ? teamOf(a.id) : a.type === 'add' ? teamOf(a.task.parentId ?? a.task.projectId) : undefined
    if (tm) dispatchTeam(tm.id, a)
    else dispatch(a)
  }
  const ctx: Ctx = { state: merged, dispatch: route, open }
  const teamCtx = (tm: Team): Ctx => ({ state: tm.data, dispatch: a => dispatchTeam(tm.id, a), open })
  const [head, setHead] = useState<HTMLElement | null>(null)
  const [bar, setBar] = useState<HTMLElement | null>(null)
  const go = (v: View) => { setView(v); setNav(false) }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'q' && !(e.target as HTMLElement).closest('input,textarea,select') && !openId) { e.preventDefault(); setAdding(true) }
      if (e.key === '/' && !(e.target as HTMLElement).closest('input,textarea,select')) { e.preventDefault(); document.getElementById('search')?.focus() }
      if (e.key === 'Escape') setAdding(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openId])

  const toast = state.toast ?? teams.find(x => x.data.toast)?.data.toast ?? null
  const dismissToast = useCallback(() => {
    dispatch({ type: 'dismissToast' })
    teams.forEach(x => x.data.toast && dispatchTeam(x.id, { type: 'dismissToast' }))
  }, [dispatch, dispatchTeam, teams])
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(dismissToast, 4500)
    return () => clearTimeout(id)
  }, [toast, dismissToast])

  const t = today()
  const openTasks = merged.tasks.filter(x => !isDone(x.status) && !x.parentId)
  const todayCount = openTasks.filter(x => (x.when && span(x.when)[0] <= t) || (x.deadline && x.deadline <= t)).length
  const taskTeam = openId ? teams.find(tm => tm.data.tasks.some(x => x.id === openId)) : undefined
  const task = (taskTeam?.data ?? state).tasks.find(x => x.id === openId)

  // Pages inside a team read and write that team's data; the rest reads your space.
  const tm = teams.find(x => x.id === (view.kind === 'team' ? view.id : view.team))
  const c = tm ? teamCtx(tm) : ctx
  const own: Ctx = tm ? c : { state: { ...state, people: [] }, dispatch, open } // no delegating in your own space
  setTagColors({ ...state.tagColors, ...c.state.tagColors })
  const saveTag = (from: string, to: string, color?: string) => { own.dispatch({ type: 'renameTag', from, to, color }); if (to !== from) goIn({ kind: 'tag', tag: to }) }
  const goIn = (v: View) => go(tm ? { ...v, team: tm.id } : v)

  // Own and team projects in one list, in the order you arranged (sidebarOrder lives only in your data); new ones go last.
  const rank = (id: string) => { const i = state.sidebarOrder?.indexOf(id) ?? -1; return i < 0 ? 1e9 : i }
  const sidebar = [
    ...state.projects.filter(p => p.id !== 'inbox').map(p => ({ p, team: undefined as Team | undefined })),
    ...teams.flatMap(x => x.data.projects.filter(p => projectMembers(p, x.members.map(m => m.email)).includes(email)).map(p => ({ p, team: x as Team | undefined }))),
  ].sort((a, b) => rank(a.p.id) - rank(b.p.id))

  const navCls = (active: boolean) => `ni group flex h-9 w-full items-center gap-2.5 overflow-hidden rounded-[10px] px-2.5 text-sm transition-colors duration-150 focus-visible:bg-white/[0.05] ${active ? 'bg-white/[0.08] font-medium text-white shadow-[inset_0_0_0_1px_var(--color-line)]' : 'text-ink-2 hover:bg-white/[0.04] hover:text-white/90 active:bg-white/[0.08]'}`
  const item = (v: View, icon: IconName, label: string, count?: number) => {
    const active = JSON.stringify(v) === JSON.stringify(view)
    return (
      <button key={label} type="button" onClick={() => go(v)} title={mini ? label : undefined} aria-label={label} aria-current={active ? 'page' : undefined}
        className={navCls(active)}>
        <Icon name={icon} className={`size-[17px] shrink-0 transition-colors ${active ? 'text-white' : 'text-ink-3 group-hover:text-white/80 group-focus-visible:text-white/80 group-active:text-white'}`} />
        <span className="lbl flex-1 truncate text-left">{label}</span>
        {!!count && <span className={`lbl shrink-0 text-xs tabular-nums ${active ? 'text-white/70' : 'text-white/35'}`}>{count}</span>}
      </button>
    )
  }

  // Pages tucked behind "Mais páginas"; while one is open the trigger takes its name and icon.
  const more: ['tags' | 'notes' | 'automations' | 'pomodoro', IconName, string, number?][] = [
    ['tags', 'tag', 'Etiquetas'],
    ['notes', 'note', 'Anotações', state.notes.length],
    ['automations', 'bolt', 'Automações', state.automations.filter(a => a.enabled).length],
    ['pomodoro', 'timer', 'Pomodoro'],
  ]
  const moreHere = view.team ? undefined : more.find(m => m[0] === view.kind)

  const newProject = (team?: Team) => { setDraft({ name: '', color: PROJECT_COLORS[(team?.data ?? state).projects.length % PROJECT_COLORS.length], team: team?.id }); setDialog('project') }
  const addProject = () => {
    const name = draft.name.trim()
    if (!name) return
    const id = draft.id ?? uid()
    const prev = (teams.find(x => x.id === draft.team)?.data ?? state).projects.find(p => p.id === id)
    // New team projects start with just you; add people from the project page.
    const a: Action = { type: 'saveProject', project: { ...prev, id, name, color: draft.color, members: prev?.members ?? (draft.team ? [email] : undefined) } }
    if (draft.team) dispatchTeam(draft.team, a)
    else dispatch(a)
    setDialog(null)
    go({ kind: 'project', id, team: draft.team })
  }
  const newTag = () => { setDraft({ name: '', color: PROJECT_COLORS[0] }); setDialog('tag') }
  // New tag: renaming a name onto itself just records its colour.
  const submitTag = () => { const n = draft.name.trim(); if (!n) return; saveTag(draft.id ?? n, n, draft.color); setDialog(null) }
  const newTeam = () => { setDraft({ name: '', color: PROJECT_COLORS[teams.length % PROJECT_COLORS.length] }); setDialog('team') }
  const saveTeam = async () => {
    const name = draft.name.trim()
    if (!name) return
    setDialog(null)
    if (draft.team) return teamApi.rename(draft.team, name, draft.color)
    const id = await teamApi.create(name, draft.color)
    if (id) go({ kind: 'team', id, tab: 'members' })
  }

  const searchHits = (s: string) => {
    if (s.startsWith('+')) return c.state.tasks.filter(x => x.assignees.includes(s.slice(1)) && !isDone(x.status))
    const n = s.toLowerCase()
    return c.state.tasks.filter(x => (x.title + ' ' + x.description + ' ' + x.tags.join(' ')).toLowerCase().includes(n))
  }

  let content
  switch (view.kind) {
    case 'home': content = <HomeView ctx={ctx} go={go} />; break
    case 'today': content = <TodayView ctx={ctx} />; break
    case 'upcoming': content = <UpcomingView ctx={ctx} />; break
    case 'filters': content = <FiltersView ctx={ctx} go={go} />; break
    case 'tags': content = <TagsView ctx={ctx} go={go} onNew={newTag} teams={teams} />; break
    case 'projects': content = <ProjectsView ctx={own} go={go} onNew={() => newProject()} />; break
    case 'automations': content = <AutomationsView ctx={own} />; break
    case 'teams': content = <TeamsView teams={teams} me={email} go={go} onNew={newTeam} />; break
    case 'team': content = tm ? <TeamView key={tm.id} team={tm} ctx={c} me={email} tab={view.tab} go={goIn} api={teamApi} onNewProject={() => newProject(tm)} onNewTag={newTag}
      onEdit={() => { setDraft({ name: tm.name, color: tm.color, team: tm.id }); setDialog('team') }} onGone={() => go({ kind: 'teams' })} />
      : <p className="text-sm text-white/45">Carregando time…</p>; break
    case 'pomodoro': content = <PomodoroView />; break
    case 'notes': content = <NotesView ctx={ctx} focus={view.focus} key={view.focus} />; break
    case 'project': content = <ProjectView key={view.id} ctx={c} id={view.id} team={tm?.name}
      people={tm && c.state.projects.some(p => p.id === view.id) && <ProjectPeople team={tm} project={c.state.projects.find(p => p.id === view.id)!} ctx={c} me={email} />}
      onDeleted={() => go(tm ? { kind: 'team', id: tm.id, tab: 'projects' } : { kind: 'projects' })}
      onEdit={() => { const p = c.state.projects.find(x => x.id === view.id); if (p) { setDraft({ ...p, team: tm?.id }); setDialog('project') } }} />; break
    // Renaming or removing a tag touches your own data (or the team's, inside a team); delegated tasks keep their team tags.
    case 'tag': content = <ListView ctx={c} title={<NameField key={view.tag} label="Nome da etiqueta" value={view.tag} onSave={to => to !== view.tag && saveTag(view.tag, to)} />} icon="tag" color={colorFor(view.tag)} tasks={c.state.tasks.filter(x => x.tags.includes(view.tag) && !isDone(x.status))}
      onEdit={() => { setDraft({ id: view.tag, name: view.tag, color: colorFor(view.tag) }); setDialog('tag') }}
      onDelete={() => { if (confirm(`Remover a etiqueta “${view.tag}” de todas as tarefas?`)) { own.dispatch({ type: 'removeTag', tag: view.tag }); go(tm ? { kind: 'team', id: tm.id, tab: 'tags' } : { kind: 'tags' }) } }} />; break
    case 'filter': content = <ListView ctx={c} title={FILTERS[view.id].label} icon={FILTERS[view.id].icon} color={FILTERS[view.id].color} tasks={c.state.tasks.filter(x => FILTERS[view.id].test(x, c.state.tasks))} />; break
    case 'search': {
      const who = view.q.startsWith('+') ? c.state.people.find(p => p.id === view.q.slice(1)) : null
      content = who
        ? <ListView ctx={ctx} title={<span className="flex items-center gap-2.5"><Avatar person={who} size="size-8" bare />{who.name}</span>} team={tm?.name} tasks={searchHits(view.q)} />
        : <ListView ctx={ctx} title={`Busca: ${view.q}`} icon="search" color={PALETTE.iris} tasks={searchHits(view.q)} />
    }
  }

  return (
    <div className="flex min-h-dvh text-white">
      <div className="backdrop bd" {...bgProps(look.bg)} aria-hidden />
      {nav && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setNav(false)} />}
      <aside data-mini={mini || undefined} className={`fixed inset-y-0 left-0 z-40 sidebar flex w-[260px] flex-col bg-surface px-3 py-4 transition-transform lg:sticky lg:top-0 lg:h-dvh lg:w-[240px] lg:shrink-0 lg:translate-x-0 ${nav ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="relative mb-4 flex h-7 items-center gap-2.5 px-2">
          <span className="lbl flex items-center gap-2.5"><Logo /><span className="text-[15px] font-semibold tracking-[-0.01em]">Prism</span></span>
          <button type="button" onClick={toggleMini} aria-label={mini ? 'Expandir barra lateral' : 'Recolher barra lateral'} aria-expanded={!mini}
            className="absolute -top-0.5 left-[180px] hidden size-8 place-items-center rounded-md text-ink-3 transition-[left,color,background-color] duration-[420ms] ease-[cubic-bezier(.32,.72,0,1)] hover:bg-white/[0.07] hover:text-iris active:bg-white/[0.1] motion-reduce:transition-none lg:grid in-data-mini:left-[2px]">
            <Icon name="panel" className="swap-out col-start-1 row-start-1 size-5" /><Icon name="panelOpen" className="swap-in col-start-1 row-start-1 size-5" />
          </button>
        </div>
        <button type="button" onClick={() => { setAdding(true); setNav(false) }} aria-label="Adicionar tarefa" title={mini ? 'Adicionar tarefa' : undefined}
          className="ab press mb-2 flex h-9 items-center gap-2.5 overflow-hidden rounded-full border border-iris/25 bg-iris/[0.09] py-1.5 pr-2 pl-2 text-sm font-medium text-white hover:bg-iris/[0.15]">
          <span className="grid size-[18px] shrink-0 place-items-center rounded-full bg-iris text-on"><Icon name="plus" className="size-3" /></span>
          <span className="lbl">Adicionar tarefa</span>
          <kbd className="lbl ml-auto rounded-full border border-white/10 px-2 text-[10px] text-white/45">Q</kbd>
        </button>
        <div className="mb-3 border-t border-white/[0.06]" aria-hidden />
        <nav className="space-y-0.5">
          {item({ kind: 'home' }, 'home', 'Início')}
          {item({ kind: 'project', id: 'inbox' }, 'inbox', 'Entrada', openTasks.filter(x => x.projectId === 'inbox').length)}
          {item({ kind: 'today' }, 'today', 'Hoje', todayCount)}
          {item({ kind: 'upcoming' }, 'upcoming', 'Em breve')}
          {item({ kind: 'filters' }, 'filter', 'Visualizações')}
          <button ref={setMoreAnchor} type="button" onClick={() => setMoreOpen(o => !o)} title={mini ? 'Mais páginas' : undefined} aria-label="Mais páginas"
            aria-haspopup="menu" aria-expanded={moreOpen} className={navCls(!!moreHere)}>
            <Icon name={moreHere ? moreHere[1] : 'dots'} className={`size-[17px] shrink-0 transition-colors ${moreHere || moreOpen ? 'text-white' : 'text-ink-3 group-hover:text-white/80 group-focus-visible:text-white/80'}`} />
            <span className="lbl flex-1 truncate text-left">{moreHere ? moreHere[2] : 'Mais páginas'}</span>
          </button>
          <Popover anchor={moreAnchor} open={moreOpen} onClose={() => setMoreOpen(false)} width={220}>
            <div role="menu" aria-label="Mais páginas" className="p-1">
              {more.map(([kind, icon, label, n]) => (
                <MenuItem key={kind} icon={<Icon name={icon} className="size-4 text-ink-3" />} checked={moreHere?.[0] === kind || undefined} onClick={() => { setMoreOpen(false); go({ kind }) }}>
                  <span className="flex items-center justify-between gap-2">{label}{!!n && moreHere?.[0] !== kind && <span className="text-xs text-white/35 tabular-nums">{n}</span>}</span>
                </MenuItem>
              ))}
            </div>
          </Popover>
        </nav>
        <div className="ph mt-5 mb-1 flex h-[42px] items-center justify-between overflow-hidden border-t border-white/[0.06] px-2.5 pt-4">
          <button type="button" onClick={() => go({ kind: 'projects' })} aria-current={view.kind === 'projects' ? 'page' : undefined}
            className={`lbl -ml-1 rounded-md px-1 py-0.5 text-[11px] font-semibold tracking-[0.06em] uppercase transition-colors hover:text-white/80 ${view.kind === 'projects' ? 'text-white' : 'text-white/40'}`}>Meus projetos</button>
          <span className="lbl flex items-center gap-0.5">
            <button type="button" aria-label="Novo projeto" onClick={() => newProject()} className="grid size-6 place-items-center rounded-md text-ink-3 transition-colors hover:bg-white/[0.07] hover:text-iris active:bg-white/[0.1]"><Icon name="plus" className="size-3.5" /></button>
            <button type="button" aria-label={projectsOpen ? 'Recolher projetos' : 'Expandir projetos'} aria-expanded={projectsOpen} onClick={() => setProjectsOpen(o => !o)}
              className="grid size-6 place-items-center rounded-md text-ink-3 transition-colors hover:bg-white/[0.07] hover:text-iris active:bg-white/[0.1]">
              <Icon name="chevron" className={`size-4 transition-transform duration-200 motion-reduce:transition-none ${projectsOpen ? 'rotate-90' : ''}`} />
            </button>
          </span>
        </div>
        <nav className={`min-h-0 space-y-0.5 overflow-y-auto ${projectsOpen || mini ? '' : 'hidden'}`}>
          <Sortable ids={sidebar.map(e => e.p.id)} onMove={(from, to) => {
            const ids = sidebar.map(e => e.p.id), i = ids.indexOf(from), j = ids.indexOf(to)
            ids.splice(j, 0, ...ids.splice(i, 1))
            dispatch({ type: 'sidebarOrder', ids })
          }}>
          {sidebar.map(({ p, team: x }) => {
            const active = view.kind === 'project' && view.id === p.id
            const n = (x?.data ?? state).tasks.filter(y => y.projectId === p.id && !y.parentId && !isDone(y.status)).length
            return (
              <SortableNav key={p.id} id={p.id} onClick={() => go({ kind: 'project', id: p.id, team: x?.id })} title={mini ? (x ? `${p.name}, ${x.name}` : p.name) : undefined}
                aria-label={x ? `${p.name}, do time ${x.name}` : p.name} aria-current={active ? 'page' : undefined} className={navCls(active)}>
                <span style={{ '--c': p.color } as CSSProperties} className={`shrink-0 transition-colors ${active ? 'text-(--c)' : 'text-[color-mix(in_srgb,var(--c)_60%,var(--color-surface))] group-hover:text-(--c) group-focus-visible:text-(--c)'}`}><Icon name={x ? 'teamProject' : 'hash'} className="size-[17px]" /></span>
                <span className="lbl min-w-0 flex-1 truncate text-left text-[13px]">{p.name}</span>
                {!!n && <span className={`lbl shrink-0 text-xs tabular-nums ${active ? 'text-white/70' : 'text-white/35'}`}>{n}</span>}
              </SortableNav>
            )
          })}
          </Sortable>
        </nav>
        <div className="ph mt-3 mb-1 flex h-[42px] items-center justify-between overflow-hidden border-t border-white/[0.06] px-2.5 pt-4">
          <button type="button" onClick={() => go({ kind: 'teams' })} aria-current={view.kind === 'teams' ? 'page' : undefined}
            className={`lbl -ml-1 rounded-md px-1 py-0.5 text-[11px] font-semibold tracking-[0.06em] uppercase transition-colors hover:text-white/80 ${view.kind === 'teams' ? 'text-white' : 'text-white/40'}`}>Meus times</button>
          <span className="lbl flex items-center gap-0.5">
            <button type="button" aria-label="Novo time" onClick={newTeam} className="grid size-6 place-items-center rounded-md text-ink-3 transition-colors hover:bg-white/[0.07] hover:text-iris active:bg-white/[0.1]"><Icon name="plus" className="size-3.5" /></button>
            <button type="button" aria-label={teamsOpen ? 'Recolher times' : 'Expandir times'} aria-expanded={teamsOpen} onClick={() => setTeamsOpen(o => !o)}
              className="grid size-6 place-items-center rounded-md text-ink-3 transition-colors hover:bg-white/[0.07] hover:text-iris active:bg-white/[0.1]">
              <Icon name="chevron" className={`size-4 transition-transform duration-200 motion-reduce:transition-none ${teamsOpen ? 'rotate-90' : ''}`} />
            </button>
          </span>
        </div>
        <nav className={`max-h-[30vh] shrink-0 space-y-0.5 overflow-y-auto ${teamsOpen || mini ? '' : 'hidden'}`}>
          {teams.length === 0 && !mini && <button type="button" onClick={newTeam} className="w-full px-2.5 py-1.5 text-left text-xs text-white/35 hover:text-white/70">Crie um time para delegar tarefas</button>}
          {teams.map(x => {
            const active = tm?.id === x.id
            const n = x.data.tasks.filter(y => !y.parentId && !isDone(y.status) && y.assignees.includes(email)).length
            return (
              <button key={x.id} type="button" onClick={() => go({ kind: 'team', id: x.id })} title={mini ? x.name : undefined} aria-label={x.name} aria-current={active ? 'page' : undefined} className={navCls(active)}>
                <span style={{ '--c': x.color } as CSSProperties} className={`shrink-0 transition-colors ${active ? 'text-(--c)' : 'text-[color-mix(in_srgb,var(--c)_60%,var(--color-surface))] group-hover:text-(--c) group-focus-visible:text-(--c)'}`}><Icon name="users" className="size-[17px]" /></span>
                <span className="lbl flex-1 truncate text-left text-[13px]">{x.name}</span>
                {!!n && <Tip label="Atribuídas a você"><span className={`lbl shrink-0 text-xs tabular-nums ${active ? 'text-white/70' : 'text-white/35'}`}>{n}</span></Tip>}
              </button>
            )
          })}
        </nav>
        <button type="button" onClick={() => { setDialog('settings'); setNav(false) }} title={mini ? 'Configurações' : undefined} aria-label="Configurações" className={`${navCls(false)} mt-auto`}>
          <Icon name="settings" className="size-[17px] shrink-0 text-ink-3 transition-colors group-hover:text-white/80" />
          <span className="lbl flex-1 truncate text-left">Configurações</span>
        </button>
        <span className="lbl px-2.5 pt-3 text-[11px] tabular-nums text-white/20">v{__APP_VERSION__}</span>
      </aside>

      <main className="flex h-dvh min-w-0 flex-1 flex-col">
        {/* Page bar: same surface as the sidebar; pages portal their toolbar into it (see Header). */}
        <div className="pagebar z-20 flex h-[52px] shrink-0 items-center gap-2 border-b border-white/[0.06] bg-surface px-3">
          <button type="button" aria-label="Abrir menu" onClick={() => setNav(true)} className="grid size-9 place-items-center rounded-[10px] text-ink-2 transition-colors hover:bg-white/[0.07] hover:text-white active:bg-white/[0.1] lg:hidden"><Icon name="menu" /></button>
          <span className="lg:hidden"><Logo /></span>
          <form role="search" className="min-w-0 flex-1" onSubmit={e => { e.preventDefault(); if (q.trim()) go({ kind: 'search', q: q.trim() }) }}>
            <label className="group flex h-8 w-full max-w-[340px] items-center gap-2.5 rounded-[10px] border border-white/[0.06] bg-canvas px-2.5 text-sm transition-[border-color,max-width,background-color] duration-300 ease-[cubic-bezier(.32,.72,0,1)] focus-within:max-w-[460px] focus-within:border-iris/40 focus-within:bg-raised motion-reduce:transition-none">
              <Icon name="search" className="size-4 shrink-0 text-ink-3 transition-colors group-focus-within:text-iris" />
              <input id="search" type="search" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Escape' && e.currentTarget.blur()} placeholder="Buscar tarefas" aria-label="Buscar tarefas" className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-white/35 [&::-webkit-search-cancel-button]:hidden" />
              <kbd className="rounded-[5px] border border-white/10 px-1.5 text-[10px] text-white/40 group-focus-within:hidden">/</kbd>
            </label>
          </form>
          <div ref={setBar} className="ml-auto flex min-w-0 shrink-0 items-center" />
        </div>
        {/* Left-anchored, not centred: the column hangs off the sidebar and leaves the backdrop open on the right. */}
        {/* Only this area scrolls vertically (page bar stays); the title scrolls with it, board columns scroll sideways on their own. */}
        <div className="min-h-0 w-full flex-1 overflow-y-auto has-[.board]:flex has-[.board]:flex-col px-3 py-5 sm:px-5 lg:py-9 lg:pl-8 lg:pr-9 has-[.board]:pb-0!">
          <div ref={setHead} />
          <HeadSlot.Provider value={head && bar && { head, bar }}>
          {view.kind === 'home' ? content : view.kind === 'upcoming' ? (
            // Board mode: drop the Janelas card and the content card's surface, same as a project's board.
            <div className="flex flex-col gap-6 xl:flex-row xl:items-start has-[.board]:flex-1 has-[.board]:flex-col! [&:has(.board)>:last-child]:hidden">
              <div className="float rise min-w-0 rounded-[28px] px-4 py-6 sm:px-8 sm:py-8 xl:w-[760px] xl:shrink-0 has-[.board]:flex has-[.board]:flex-1 has-[.board]:flex-col has-[.board]:w-full! has-[.board]:shrink! has-[.board]:border-transparent! has-[.board]:bg-transparent! has-[.board]:shadow-none! has-[.board]:backdrop-blur-none! has-[.board]:px-0! has-[.board]:py-0!">{content}</div>
              <div className="float rise min-w-0 rounded-[28px] px-4 py-6 sm:px-6 xl:sticky xl:top-4 xl:ml-auto xl:w-[600px] xl:shrink"><UpcomingWindows ctx={ctx} /></div>
            </div>
          ) : <div className={`float rise rounded-[28px] px-4 py-6 sm:px-8 sm:py-8 ${['filters', 'tags', 'automations', 'notes', 'team'].includes(view.kind) ? '' : 'max-w-[812px] has-[.board]:flex has-[.board]:flex-1 has-[.board]:flex-col has-[.board]:max-w-none has-[.board]:border-transparent! has-[.board]:bg-transparent! has-[.board]:shadow-none! has-[.board]:backdrop-blur-none! has-[.board]:px-0! has-[.board]:py-0!'}`}>{content}</div>}
          </HeadSlot.Provider>
        </div>
      </main>

      {adding && (
        <QuickAddModal onClose={() => setAdding(false)}>
          <QuickAdd ctx={c} autoFocus projectId={view.kind === 'project' ? view.id : tm?.data.projects[0]?.id ?? 'inbox'} date={view.kind === 'today' ? t : undefined} onDone={() => setAdding(false)} />
        </QuickAddModal>
      )}
      {dialog === 'project' && (
        <Dialog title={draft.id ? 'Editar projeto' : 'Novo projeto'} onClose={() => setDialog(null)} footer={<>
          <button type="button" className={btnGhost} onClick={() => setDialog(null)}>Cancelar</button>
          <button type="button" className={btnPrimary} disabled={!draft.name.trim()} onClick={addProject}>{draft.id ? 'Salvar' : 'Criar projeto'}</button>
        </>}>
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl" style={{ background: tint(draft.color, 16), color: draft.color }}><Icon name={draft.team ? 'teamProject' : 'hash'} className="size-5" /></span>
            <input autoFocus className={inputCls} placeholder="Nome do projeto" aria-label="Nome do projeto" value={draft.name}
              onChange={e => setDraft({ ...draft, name: e.target.value })} onKeyDown={e => e.key === 'Enter' && addProject()} />
          </div>
          <ColorField value={draft.color} onChange={color => setDraft({ ...draft, color })} />
        </Dialog>
      )}
      {dialog === 'tag' && (
        <Dialog title={draft.id ? 'Editar etiqueta' : 'Nova etiqueta'} onClose={() => setDialog(null)} footer={<>
          <button type="button" className={btnGhost} onClick={() => setDialog(null)}>Cancelar</button>
          <button type="button" className={btnPrimary} disabled={!draft.name.trim()} onClick={submitTag}>{draft.id ? 'Salvar' : 'Criar etiqueta'}</button>
        </>}>
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl" style={{ background: tint(draft.color, 16), color: draft.color }}><Icon name="tag" className="size-5" /></span>
            <input autoFocus className={inputCls} placeholder="Nome da etiqueta" aria-label="Nome da etiqueta" value={draft.name}
              onChange={e => setDraft({ ...draft, name: e.target.value })} onKeyDown={e => e.key === 'Enter' && submitTag()} />
          </div>
          <ColorField value={draft.color} onChange={color => setDraft({ ...draft, color })} />
        </Dialog>
      )}
      {dialog === 'team' && (
        <Dialog title={draft.team ? 'Editar time' : 'Novo time'} onClose={() => setDialog(null)} footer={<>
          <button type="button" className={btnGhost} onClick={() => setDialog(null)}>Cancelar</button>
          <button type="button" className={btnPrimary} disabled={!draft.name.trim()} onClick={saveTeam}>{draft.team ? 'Salvar' : 'Criar time'}</button>
        </>}>
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl" style={{ background: tint(draft.color, 16), color: draft.color }}><Icon name="users" className="size-5" /></span>
            <input autoFocus className={inputCls} placeholder="Nome do time" aria-label="Nome do time" value={draft.name}
              onChange={e => setDraft({ ...draft, name: e.target.value })} onKeyDown={e => e.key === 'Enter' && saveTeam()} />
          </div>
          <ColorField value={draft.color} onChange={color => setDraft({ ...draft, color })} />
          {!draft.team && <p className="text-xs leading-relaxed text-white/45">Você entra como dono e convida as pessoas pelo e-mail. Só dentro do time dá para atribuir tarefas a outras pessoas.</p>}
        </Dialog>
      )}
      {dialog === 'settings' && <SettingsDialog email={email} look={look} onChange={setLook} onClose={() => setDialog(null)} />}
      {task && <TaskDetail key={task.id} task={task} ctx={taskTeam ? teamCtx(taskTeam) : ctx} team={taskTeam} onClose={() => setOpenId(null)} />}
      {toast && (
        <div role="status" key={toast.id} className="rise fixed bottom-5 left-1/2 z-[60] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-full border border-white/[0.1] bg-raised py-2 pr-2 pl-4 text-sm shadow-[0_20px_45px_-20px_rgba(0,0,0,0.85)]">
          <Icon name="bolt" className="size-4 shrink-0 text-saffron" />
          <span className="truncate">{toast.text}</span>
          <button type="button" aria-label="Fechar aviso" onClick={dismissToast} className="grid size-7 place-items-center rounded-full text-ink-2 hover:text-white"><Icon name="x" className="size-3.5" /></button>
        </div>
      )}
    </div>
  )
}

function SortableNav({ id, className, ...rest }: { id: string } & ComponentProps<'button'>) {
  const { ref, style, handle, dragging } = useRow(id)
  return <button ref={ref} style={style} {...handle} type="button" {...rest} className={`${className} ${dragging ? 'bg-raised shadow-[0_12px_30px_-12px_rgba(0,0,0,.9)]' : ''}`} />
}

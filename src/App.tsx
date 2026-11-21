import { useCallback, useEffect, useState, type ComponentProps, type CSSProperties } from 'react'
import { isDone, span, today, uid } from './lib'
import { seed, useStore } from './store'
import { supabase } from './auth'
import { ColorField } from './controls'
import { QuickAdd, QuickAddModal, type Ctx } from './tasks'
import { Sortable, useRow } from './sortable'
import { TaskDetail } from './TaskDetail'
import { HomeView, PomodoroView } from './home'
import { NotesView } from './notes'
import { SettingsDialog, bgProps, useLook } from './settings'
import { Dialog, Icon, Logo, PALETTE, PROJECT_COLORS, btnGhost, btnPrimary, colorFor, inputCls, tint, type IconName } from './ui'
import { AutomationsView, FILTERS, HeadSlot, ProjectsView, FiltersView, ListView, ProjectView, TodayView, UpcomingView, UpcomingWindows, type View } from './views'

export default function App({ userId }: { userId: string }) {
  const [state, dispatch] = useStore(userId)
  const [look, setLook] = useLook()
  const [view, setView] = useState<View>({ kind: 'home' })
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [nav, setNav] = useState(false)
  const [projectsOpen, setProjectsOpen] = useState(true)
  const [mini, setMini] = useState(() => { try { return localStorage.getItem('prism:mini') === '1' } catch { return false } })
  const toggleMini = () => setMini(m => { try { localStorage.setItem('prism:mini', m ? '0' : '1') } catch { /* private mode */ } return !m })
  const [q, setQ] = useState('')
  const [dialog, setDialog] = useState<'project' | 'reset' | 'settings' | null>(null)
  const [draft, setDraft] = useState<{ id?: string; name: string; color: string }>({ name: '', color: PROJECT_COLORS[0] })
  const open = useCallback((id: string) => setOpenId(id), [])
  const ctx: Ctx = { state, dispatch, open }
  const [head, setHead] = useState<HTMLElement | null>(null)
  const go = (v: View) => { setView(v); setNav(false) }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'q' && !(e.target as HTMLElement).closest('input,textarea,select') && !openId) { e.preventDefault(); setAdding(true) }
      if (e.key === 'Escape') setAdding(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openId])

  useEffect(() => {
    if (!state.toast) return
    const id = setTimeout(() => dispatch({ type: 'dismissToast' }), 4500)
    return () => clearTimeout(id)
  }, [state.toast, dispatch])

  const t = today()
  const openTasks = state.tasks.filter(x => !isDone(x.status) && !x.parentId)
  const todayCount = openTasks.filter(x => (x.when && span(x.when)[0] <= t) || (x.deadline && x.deadline <= t)).length
  const task = state.tasks.find(x => x.id === openId)

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

  const newProject = () => { setDraft({ name: '', color: PROJECT_COLORS[state.projects.length % PROJECT_COLORS.length] }); setDialog('project') }
  const addProject = () => {
    const name = draft.name.trim()
    if (!name) return
    const id = draft.id ?? uid()
    dispatch({ type: 'saveProject', project: { id, name, color: draft.color } })
    setDialog(null)
    go({ kind: 'project', id })
  }

  const searchHits = (s: string) => {
    if (s.startsWith('+')) return state.tasks.filter(x => x.assignees.includes(s.slice(1)) && !isDone(x.status))
    const n = s.toLowerCase()
    return state.tasks.filter(x => (x.title + ' ' + x.description + ' ' + x.tags.join(' ')).toLowerCase().includes(n))
  }

  let content
  switch (view.kind) {
    case 'home': content = <HomeView ctx={ctx} go={go} />; break
    case 'today': content = <TodayView ctx={ctx} />; break
    case 'upcoming': content = <UpcomingView ctx={ctx} />; break
    case 'filters': content = <FiltersView ctx={ctx} go={go} />; break
    case 'projects': content = <ProjectsView ctx={ctx} go={go} onNew={newProject} />; break
    case 'automations': content = <AutomationsView ctx={ctx} />; break
    case 'pomodoro': content = <PomodoroView />; break
    case 'notes': content = <NotesView ctx={ctx} focus={view.focus} key={view.focus} />; break
    case 'project': content = <ProjectView key={view.id} ctx={ctx} id={view.id} onDeleted={() => go({ kind: 'projects' })}
      onEdit={() => { const p = state.projects.find(x => x.id === view.id); if (p) { setDraft(p); setDialog('project') } }} />; break
    case 'tag': content = <ListView ctx={ctx} title={view.tag} icon="tag" color={colorFor(view.tag)} tasks={state.tasks.filter(x => x.tags.includes(view.tag) && !isDone(x.status))}
      onEdit={() => {
        const to = prompt('Novo nome da etiqueta', view.tag)?.trim()
        if (to && to !== view.tag) { dispatch({ type: 'renameTag', from: view.tag, to }); go({ kind: 'tag', tag: to }) }
      }}
      onDelete={() => { if (confirm(`Remover a etiqueta “${view.tag}” de todas as tarefas?`)) { dispatch({ type: 'removeTag', tag: view.tag }); go({ kind: 'filters' }) } }} />; break
    case 'filter': content = <ListView ctx={ctx} title={FILTERS[view.id].label} icon={FILTERS[view.id].icon} color={FILTERS[view.id].color} tasks={state.tasks.filter(x => FILTERS[view.id].test(x, state.tasks))} />; break
    case 'search': {
      const who = view.q.startsWith('+') ? state.people.find(p => p.id === view.q.slice(1))?.name : null
      content = <ListView ctx={ctx} title={who ?? `Busca: ${view.q}`} icon={who ? 'user' : 'search'} color={who ? PALETTE.orchid : PALETTE.iris} tasks={searchHits(view.q)} />
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
        <form className="mb-3" onSubmit={e => { e.preventDefault(); if (q.trim()) go({ kind: 'search', q: q.trim() }) }}>
          <label onClick={() => mini && toggleMini()} title={mini ? 'Buscar' : undefined} className="si group flex h-9 items-center gap-2.5 overflow-hidden rounded-full border border-white/[0.06] bg-white/[0.02] px-3 text-sm text-white/45 focus-within:border-white/20">
            <Icon name="search" className="size-4 shrink-0 text-ink-3 transition-colors group-focus-within:text-iris" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar" aria-label="Buscar tarefas" className="lbl min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-white/40" />
          </label>
        </form>
        <div className="mb-3 border-t border-white/[0.06]" aria-hidden />
        <nav className="space-y-0.5">
          {item({ kind: 'home' }, 'home', 'Início')}
          {item({ kind: 'project', id: 'inbox' }, 'inbox', 'Entrada', openTasks.filter(x => x.projectId === 'inbox').length)}
          {item({ kind: 'today' }, 'today', 'Hoje', todayCount)}
          {item({ kind: 'upcoming' }, 'upcoming', 'Em breve')}
          {item({ kind: 'filters' }, 'filter', 'Filtros e etiquetas')}
          {item({ kind: 'pomodoro' }, 'timer', 'Pomodoro')}
          {item({ kind: 'notes' }, 'note', 'Anotações', state.notes.length)}
          {item({ kind: 'automations' }, 'bolt', 'Automações', state.automations.filter(a => a.enabled).length)}
        </nav>
        <div className="ph mt-5 mb-1 flex h-[42px] items-center justify-between overflow-hidden border-t border-white/[0.06] px-2.5 pt-4">
          <button type="button" onClick={() => go({ kind: 'projects' })} aria-current={view.kind === 'projects' ? 'page' : undefined}
            className={`lbl -ml-1 rounded-md px-1 py-0.5 text-[11px] font-semibold tracking-[0.06em] uppercase transition-colors hover:text-white/80 ${view.kind === 'projects' ? 'text-white' : 'text-white/40'}`}>Meus projetos</button>
          <span className="lbl flex items-center gap-0.5">
            <button type="button" aria-label="Novo projeto" onClick={newProject} className="grid size-6 place-items-center rounded-md text-ink-3 transition-colors hover:bg-white/[0.07] hover:text-iris active:bg-white/[0.1]"><Icon name="plus" className="size-3.5" /></button>
            <button type="button" aria-label={projectsOpen ? 'Recolher projetos' : 'Expandir projetos'} aria-expanded={projectsOpen} onClick={() => setProjectsOpen(o => !o)}
              className="grid size-6 place-items-center rounded-md text-ink-3 transition-colors hover:bg-white/[0.07] hover:text-iris active:bg-white/[0.1]">
              <Icon name="chevron" className={`size-4 transition-transform duration-200 motion-reduce:transition-none ${projectsOpen ? 'rotate-90' : ''}`} />
            </button>
          </span>
        </div>
        <nav className={`min-h-0 flex-1 space-y-0.5 overflow-y-auto ${projectsOpen || mini ? '' : 'hidden'}`}>
          <Sortable ids={state.projects.filter(p => p.id !== 'inbox').map(p => p.id)} onMove={(from, to) => dispatch({ type: 'reorder', list: 'projects', from, to })}>
          {state.projects.filter(p => p.id !== 'inbox').map(p => {
            const active = view.kind === 'project' && view.id === p.id
            const n = openTasks.filter(x => x.projectId === p.id).length
            return (
              <SortableNav key={p.id} id={p.id} onClick={() => go({ kind: 'project', id: p.id })} title={mini ? p.name : undefined} aria-label={p.name} aria-current={active ? 'page' : undefined}
                className={navCls(active)}>
                <span style={{ '--c': p.color } as CSSProperties} className={`shrink-0 transition-colors ${active ? 'text-(--c)' : 'text-[color-mix(in_srgb,var(--c)_60%,var(--color-surface))] group-hover:text-(--c) group-focus-visible:text-(--c)'}`}><Icon name="hash" className="size-[17px]" /></span>
                <span className="lbl flex-1 truncate text-left text-[13px]">{p.name}</span>
                {!!n && <span className={`lbl shrink-0 text-xs tabular-nums ${active ? 'text-white/70' : 'text-white/35'}`}>{n}</span>}
              </SortableNav>
            )
          })}
          </Sortable>
        </nav>
        <button type="button" onClick={() => { setDialog('settings'); setNav(false) }} title={mini ? 'Aparência' : undefined} aria-label="Aparência" className={`${navCls(false)} mt-auto`}>
          <Icon name="settings" className="size-[17px] shrink-0 text-ink-3 transition-colors group-hover:text-white/80" />
          <span className="lbl flex-1 truncate text-left">Aparência</span>
        </button>
        <button type="button" onClick={() => setDialog('reset')}
          className="lbl pt-3 px-2.5 text-left text-xs text-white/30 hover:text-white/60">Restaurar exemplo</button>
        <button type="button" onClick={() => supabase.auth.signOut()}
          className="lbl pt-1 px-2.5 text-left text-xs text-white/30 hover:text-white/60">Sair</button>
        <span className="lbl px-2.5 pt-1 text-[11px] tabular-nums text-white/20">v{__APP_VERSION__}</span>
      </aside>

      <main className="min-w-0 flex-1">
        <div className="sticky top-0 z-20 flex items-center gap-2 float px-4 py-2.5 lg:hidden">
          <button type="button" aria-label="Abrir menu" onClick={() => setNav(true)} className="grid size-9 place-items-center rounded-[10px] text-ink-2 transition-colors hover:bg-white/[0.07] hover:text-white active:bg-white/[0.1]"><Icon name="menu" /></button>
          <Logo /><span className="text-sm font-semibold">Prism</span>
        </div>
        {/* Left-anchored, not centred: the column hangs off the sidebar and leaves the backdrop open on the right. */}
        <div className={`w-full px-3 py-5 sm:px-5 lg:py-9 lg:pl-8 lg:pr-9`}>
          <div ref={setHead} />
          <HeadSlot.Provider value={head}>
          {view.kind === 'home' ? content : view.kind === 'upcoming' ? (
            <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
              <div className="float rise min-w-0 rounded-[28px] px-4 py-6 sm:px-8 sm:py-8 xl:w-[760px] xl:shrink-0">{content}</div>
              <div className="float rise min-w-0 rounded-[28px] px-4 py-6 sm:px-6 xl:sticky xl:top-4 xl:ml-auto xl:w-[600px] xl:shrink"><UpcomingWindows ctx={ctx} /></div>
            </div>
          ) : <div className={`float rise rounded-[28px] px-4 py-6 sm:px-8 sm:py-8 ${['filters', 'automations', 'notes'].includes(view.kind) ? '' : 'max-w-[812px]'}`}>{content}</div>}
          </HeadSlot.Provider>
        </div>
      </main>

      {adding && (
        <QuickAddModal onClose={() => setAdding(false)}>
          <QuickAdd ctx={ctx} autoFocus projectId={view.kind === 'project' ? view.id : 'inbox'} date={view.kind === 'today' ? t : undefined} onDone={() => setAdding(false)} />
        </QuickAddModal>
      )}
      {dialog === 'project' && (
        <Dialog title={draft.id ? 'Editar projeto' : 'Novo projeto'} onClose={() => setDialog(null)} footer={<>
          <button type="button" className={btnGhost} onClick={() => setDialog(null)}>Cancelar</button>
          <button type="button" className={btnPrimary} disabled={!draft.name.trim()} onClick={addProject}>{draft.id ? 'Salvar' : 'Criar projeto'}</button>
        </>}>
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl" style={{ background: tint(draft.color, 16), color: draft.color }}><Icon name="hash" className="size-5" /></span>
            <input autoFocus className={inputCls} placeholder="Nome do projeto" aria-label="Nome do projeto" value={draft.name}
              onChange={e => setDraft({ ...draft, name: e.target.value })} onKeyDown={e => e.key === 'Enter' && addProject()} />
          </div>
          <ColorField value={draft.color} onChange={color => setDraft({ ...draft, color })} />
        </Dialog>
      )}
      {dialog === 'settings' && <SettingsDialog look={look} onChange={setLook} onClose={() => setDialog(null)} />}
      {dialog === 'reset' && (
        <Dialog title="Restaurar exemplo" onClose={() => setDialog(null)} footer={<>
          <button type="button" className={btnGhost} onClick={() => setDialog(null)}>Cancelar</button>
          <button type="button" autoFocus className="inline-flex items-center rounded-full bg-coral px-4 py-1.5 text-sm font-medium text-on hover:brightness-110" onClick={() => { dispatch({ type: 'replace', state: seed() }); setDialog(null) }}>Apagar e restaurar</button>
        </>}>
          <p className="text-sm leading-relaxed text-white/60">Suas tarefas, projetos e automações serão apagados e trocados pelos dados de exemplo.</p>
        </Dialog>
      )}
      {task && <TaskDetail key={task.id} task={task} ctx={ctx} onClose={() => setOpenId(null)} />}
      {state.toast && (
        <div role="status" key={state.toast.id} className="rise fixed bottom-5 left-1/2 z-[60] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-full border border-white/[0.1] bg-raised py-2 pr-2 pl-4 text-sm shadow-[0_20px_45px_-20px_rgba(0,0,0,0.85)]">
          <Icon name="bolt" className="size-4 shrink-0 text-saffron" />
          <span className="truncate">{state.toast.text}</span>
          <button type="button" aria-label="Fechar aviso" onClick={() => dispatch({ type: 'dismissToast' })} className="grid size-7 place-items-center rounded-full text-ink-2 hover:text-white"><Icon name="x" className="size-3.5" /></button>
        </div>
      )}
    </div>
  )
}

function SortableNav({ id, className, ...rest }: { id: string } & ComponentProps<'button'>) {
  const { ref, style, handle, dragging } = useRow(id)
  return <button ref={ref} style={style} {...handle} type="button" {...rest} className={`${className} ${dragging ? 'bg-raised shadow-[0_12px_30px_-12px_rgba(0,0,0,.9)]' : ''}`} />
}

import { useState, type FormEvent } from 'react'
import { type Project, isDone, projectMembers } from './lib'
import type { Team, TeamApi } from './store'
import { QuickAdd, TaskList, type Ctx } from './tasks'
import { Avatar, Icon, PALETTE, btnPrimary, btnTool, inputCls } from './ui'
import { AutomationsView, FiltersView, TagsView, Group, HeadSlot, Header, MenuItem, MenuLabel, MenuSep, ToolMenu, ProjectsView, type TeamTab, type View } from './views'

const TABS: [TeamTab, string][] = [['tasks', 'Quem faz o quê'], ['projects', 'Projetos'], ['filters', 'Visualizações'], ['tags', 'Etiquetas'], ['automations', 'Automações'], ['members', 'Membros']]

export function TeamView({ team, ctx, me, tab = 'tasks', go, api, onEdit, onNewProject, onNewTag, onGone }: {
  team: Team; ctx: Ctx; me: string; tab?: TeamTab; go: (v: View) => void; api: TeamApi
  onEdit: () => void; onNewProject: () => void; onNewTag: () => void; onGone: () => void
}) {
  const owner = team.members.some(m => m.email === me && m.role === 'owner')
  const roots = ctx.state.tasks.filter(t => !t.parentId && !isDone(t.status))
  const leave = async () => {
    if (owner ? !confirm(`Excluir o time “${team.name}” com todos os projetos e tarefas, para todos os membros?`) : !confirm(`Sair do time “${team.name}”?`)) return
    await (owner ? api.remove(team.id) : api.removeMember(team.id, me))
    onGone()
  }
  return (
    <>
      <Header title={team.name} icon="users" color={team.color} sub={
        <span className="flex items-center gap-2">
          <span className="flex -space-x-1.5">{ctx.state.people.slice(0, 5).map(p => <Avatar key={p.id} person={p} />)}</span>
          {team.members.length} membro{team.members.length === 1 ? '' : 's'}
          <span aria-hidden className="text-white/25">·</span>
          {roots.length} tarefa{roots.length === 1 ? '' : 's'} abertas
        </span>
      }>
        <ToolMenu icon="more" label="Mais ações">
          {owner && <MenuItem icon={<Icon name="edit" className="size-4 text-ink-3" />} onClick={onEdit}>Editar time</MenuItem>}
          <MenuItem danger icon={<Icon name={owner ? 'trash' : 'x'} className="size-4 text-ink-3" />} onClick={leave}>{owner ? 'Excluir time' : 'Sair do time'}</MenuItem>
        </ToolMenu>
      </Header>

      <div role="tablist" aria-label="Seções do time" className="-mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-white/[0.08]">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => go({ kind: 'team', id: team.id, tab: id })}
            style={tab === id ? { boxShadow: `inset 0 -2px 0 ${team.color}` } : undefined}
            className={`shrink-0 px-3 pt-1 pb-2.5 text-sm transition-colors ${tab === id ? 'font-medium text-white' : 'text-white/50 hover:text-white/80'}`}>
            {label}
          </button>
        ))}
      </div>

      <HeadSlot.Provider value={false}>
        {/* flex column so each tab's toolbar (order-last) sits under its list */}
        <div className="flex flex-col">
        {tab === 'tasks' && <Board ctx={ctx} team={team} />}
        {tab === 'projects' && <ProjectsView ctx={ctx} go={go} onNew={onNewProject} />}
        {tab === 'filters' && <FiltersView ctx={ctx} go={go} />}
        {tab === 'tags' && <TagsView ctx={ctx} go={go} onNew={onNewTag} />}
        {tab === 'automations' && <AutomationsView ctx={ctx} />}
        {tab === 'members' && <Members team={team} ctx={ctx} me={me} owner={owner} api={api} />}
        </div>
      </HeadSlot.Provider>
    </>
  )
}

/** Every team you belong to, like the projects page. */
export function TeamsView({ teams, me, go, onNew }: { teams: Team[]; me: string; go: (v: View) => void; onNew: () => void }) {
  return (
    <>
      <Header title="Meus times" icon="users" color={PALETTE.orchid} sub={`${teams.length} time${teams.length === 1 ? '' : 's'}`}>
        <button type="button" className={btnPrimary} onClick={onNew}><Icon name="plus" className="size-3.5" />Novo time</button>
      </Header>
      {teams.length === 0 && <p className="py-10 text-sm text-white/45">Você ainda não está em nenhum time. Crie um para dividir projetos e delegar tarefas.</p>}
      {teams.map(t => {
        const mine = t.data.tasks.filter(x => !x.parentId && !isDone(x.status) && x.assignees.includes(me)).length
        const owner = t.members.some(m => m.email === me && m.role === 'owner')
        return (
          <button key={t.id} type="button" onClick={() => go({ kind: 'team', id: t.id })}
            className="flex w-full items-center gap-3 border-b border-white/[0.06] py-3 text-left text-sm hover:bg-white/[0.015]">
            <span style={{ color: t.color }}><Icon name="users" /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-white/85">{t.name}</span>
              <span className="text-xs text-white/40">{owner ? 'Dono' : 'Membro'}, {t.data.projects.length} projeto{t.data.projects.length === 1 ? '' : 's'}</span>
            </span>
            <span className="hidden -space-x-1.5 sm:flex">{t.data.people.slice(0, 5).map(p => <Avatar key={p.id} person={p} />)}</span>
            <span className="w-28 text-right text-xs text-white/35 tabular-nums">{mine ? `${mine} para você` : 'Nada para você'}</span>
          </button>
        )
      })}
    </>
  )
}

/**
 * Who is in a team project. Only the team owner edits it; everyone else sees the faces.
 * ponytail: organises the sidebar, not access control; every member can still read the whole team blob.
 */
export function ProjectPeople({ team, project, ctx, me }: { team: Team; project: Project; ctx: Ctx; me: string }) {
  const members = projectMembers(project, team.members.map(m => m.email))
  const owner = team.members.some(m => m.email === me && m.role === 'owner')
  const faces = ctx.state.people.filter(p => members.includes(p.id))
  // Rendered inside the project's "more" menu: the owner toggles members, everyone else just sees who's in.
  return (
    <>
      <MenuSep /><MenuLabel>Pessoas no projeto</MenuLabel>
      {(owner ? ctx.state.people : faces).map(p => (
        <MenuItem key={p.id} icon={<Avatar person={p} size="size-5" bare />} checked={owner ? members.includes(p.id) : undefined}
          onClick={() => owner && ctx.dispatch({ type: 'saveProject', project: { ...project, members: members.includes(p.id) ? members.filter(x => x !== p.id) : [...members, p.id] } })}>{p.name}</MenuItem>
      ))}
    </>
  )
}

/** One group per member: the delegation overview. New tasks in a group are assigned to that person. */
function Board({ ctx, team }: { ctx: Ctx; team: Team }) {
  const roots = ctx.state.tasks.filter(t => !t.parentId && !isDone(t.status))
  const projectId = ctx.state.projects[0]?.id
  if (!projectId) return <p className="py-6 text-sm text-white/40">Crie um projeto na aba Projetos para começar a delegar tarefas.</p>
  const groups = [
    ...ctx.state.people.map(p => ({ key: p.id, title: p.name, tasks: roots.filter(t => t.assignees.includes(p.id)), assignees: [p.id] })),
    { key: '', title: 'Sem responsável', tasks: roots.filter(t => !t.assignees.some(a => team.members.some(m => m.email === a))), assignees: [] },
  ]
  return (
    <div className="grid gap-x-8 gap-y-10 lg:grid-cols-2">
      {groups.map(g => (
        <div key={g.key}>
          <Group title={g.title} count={g.tasks.length}>
            <TaskList tasks={g.tasks} ctx={ctx} showProject />
            <QuickAdd ctx={ctx} projectId={projectId} assignees={g.assignees} />
          </Group>
        </div>
      ))}
    </div>
  )
}

function Members({ team, ctx, me, owner, api }: { team: Team; ctx: Ctx; me: string; owner: boolean; api: TeamApi }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const taken = team.members.some(m => m.email === email.trim().toLowerCase())
  const invite = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    await api.invite(team.id, email)
    setBusy(false)
    setEmail('')
  }
  return (
    <div className="max-w-xl">
      {owner && (
        <form onSubmit={invite} className="mb-6">
          <div className="flex gap-2">
            <input type="email" required className={inputCls} placeholder="email@exemplo.com" aria-label="E-mail do novo membro" value={email} onChange={e => setEmail(e.target.value)} />
            <button type="submit" className={`${btnPrimary} shrink-0`} disabled={busy || taken}>Convidar</button>
          </div>
          <p className="mt-2 text-xs text-white/40">{taken ? 'Essa pessoa já está no time.' : 'A pessoa vê o time ao entrar no Prism com esse e-mail.'}</p>
        </form>
      )}
      {team.members.map(m => {
        const person = ctx.state.people.find(p => p.id === m.email) ?? { id: m.email, name: m.email }
        return (
          <div key={m.email} className="flex items-center gap-3 border-b border-white/[0.06] py-2.5 text-sm">
            <Avatar person={person} size="size-7" bare />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-white/85">{person.name}{m.email === me && <span className="text-white/40"> (você)</span>}</span>
              <span className="block truncate text-xs text-white/40">{m.email} · {m.role === 'owner' ? 'Dono' : 'Membro'}</span>
            </span>
            {owner && m.email !== me && (
              <button type="button" onClick={() => confirm(`Remover ${m.email} do time?`) && api.removeMember(team.id, m.email)} className={`${btnTool} hover:text-coral`}>Remover</button>
            )}
          </div>
        )
      })}
    </div>
  )
}

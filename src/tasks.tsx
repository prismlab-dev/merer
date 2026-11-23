import { useLayoutEffect, useRef, useState, type Dispatch, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  type Priority, type QuickKind, type Task, quickKind, type When, blankTask, blockers, diffDays, fmtDay, fmtDuration, isDone, parseQuick, quickTokens, span, stepStatus, today,
} from './lib'
import type { Action, State } from './store'
import { DateField, Select, Tip } from './controls'
import { Sortable, useDrag, useRow } from './sortable'
import { Avatar, Icon, Meta, PALETTE, projectIcon, PRIORITY, StatusGlyph, btnGhost, btnPrimary, colorFor, priorityOptions, tint, WhenLabel, type IconName } from './ui'

export interface Ctx { state: State; dispatch: Dispatch<Action>; open: (id: string) => void; wide?: boolean; oneTeam?: boolean; only?: Set<string> } // wide: your space plus your teams' tasks, whoever does them (saved views); only: subtasks a saved view lets through

const WHEN_ICON: Record<When['kind'], IconName> = { date: 'calendar', time: 'clock', slot: 'clock', window: 'window' }

export function GlyphButton({ task, ctx, size }: { task: Task; ctx: Ctx; size?: number }) {
  const waiting = blockers(task, ctx.state.tasks)
  const blocked = waiting.length > 0 && !isDone(task.status)
  const bySubs = task.status.kind === 'subtasks'
  const label = blocked
    ? `Bloqueada por ${waiting.map(w => w.title).join(', ')}`
    : bySubs ? 'Conclui ao terminar as subtarefas'
    : task.status.kind === 'check' ? (task.status.done ? 'Reabrir tarefa' : 'Concluir tarefa') : 'Avançar status'
  return (
    <Tip label={label}><button type="button" aria-label={label} disabled={blocked || bySubs}
      onClick={e => { e.stopPropagation(); ctx.dispatch({ type: 'update', id: task.id, patch: { status: stepStatus(task.status) } }) }}
      className="group/glyph -m-1 shrink-0 rounded-full p-1 disabled:cursor-not-allowed">
      <StatusGlyph status={task.status} priority={task.priority} blocked={blocked} size={size} />
    </button></Tip>
  )
}

export function TaskRow({ task, ctx, showProject, depth = 0, drag, branch, small, lit }: {
  task: Task; ctx: Ctx; showProject?: boolean; depth?: number; drag?: ReturnType<typeof useRow>['handle']
  branch?: 'mid' | 'last'; small?: boolean; lit?: boolean
}) {
  const { state } = ctx
  const t = today()
  const done = isDone(task.status)
  const day = task.when && span(task.when)[0]
  // Cross-project lists (showProject) nest only subtasks sharing the parent's day; dated-apart ones show on their own day.
  const subs = state.tasks.filter(x => x.parentId === task.id && (!ctx.only || ctx.only.has(x.id)) && (!showProject || !x.when || span(x.when)[0] === day))
  const parent = depth === 0 && task.parentId ? state.tasks.find(x => x.id === task.parentId) : undefined
  const waiting = blockers(task, state.tasks)
  const project = state.projects.find(p => p.id === task.projectId)
  const nested = depth === 0 && subs.length > 0 && (!showProject || task.status.kind === 'subtasks')
  // A parent that only finishes through its subtasks steps back: the children are the real work.
  const rollup = nested && task.status.kind === 'subtasks'
  const compact = small || rollup
  const subsDone = subs.filter(x => isDone(x.status)).length
  const rail = lit ? 'border-iris' : 'border-line'
  const inTeam = state.people.length > 0 && !ctx.wide
  const people = task.assignees.map(id => state.people.find(p => p.id === id)).filter(p => !!p)

  const meta: ReactNode[] = []
  if (parent) meta.push(<Meta key="pa" icon="subtasks"><span className="max-w-40 truncate">{parent.title}</span></Meta>)
  if (waiting.length && !done) meta.push(<Meta key="b" icon="clock" tone="amber"><span className="truncate">Aguardando {waiting[0].title}</span>{waiting.length > 1 && <span className="shrink-0">&nbsp;+{waiting.length - 1}</span>}</Meta>)
  if (task.status.kind === 'progress' && !done) meta.push(<Meta key="p" tone="emerald">{task.status.value}%</Meta>)
  if (task.status.kind === 'stages') meta.push(<Meta key="s">{task.status.stages[task.status.current]} · {task.status.current}/{task.status.stages.length - 1}</Meta>)
  if (task.when) {
    const [s, e] = span(task.when)
    const tone = e < t ? 'rose' : task.when.kind === 'window' && s <= t ? 'sky' : s === t ? 'emerald' : 'muted'
    meta.push(<Meta key="w" icon={WHEN_ICON[task.when.kind]} tone={done ? 'muted' : tone}>
      <WhenLabel w={task.when} />{task.recurrence && <Icon name="repeat" className="ml-0.5 size-3" />}
    </Meta>)
  }
  if (task.deadline) {
    const n = diffDays(t, task.deadline)
    const tone = done ? 'muted' : n < 0 || n <= 1 ? 'rose' : n <= 3 ? 'amber' : 'muted'
    meta.push(<Meta key="d" icon="deadline" tone={tone} title="Prazo final">
      {n < 0 ? `Venceu há ${-n}d` : fmtDay(task.deadline)}
    </Meta>)
  }
  if (task.durationMin) meta.push(<Meta key="du" icon="duration">{fmtDuration(task.durationMin)}</Meta>)
  if (subs.length && !rollup) meta.push(<Meta key="sub" icon="subtasks">{subsDone}/{subs.length}</Meta>)
  // Tags sit as small color blocks side by side; hovering one slides it open to its name.
  if (task.tags.length) meta.push(<span key="tags" className="inline-flex items-center gap-1">{task.tags.map(tag => <TagChip key={tag} tag={tag} color={colorFor(tag, task.projectId)} />)}</span>)

  const metaLine = meta.length > 0 && <div className={`${compact ? 'mt-0.5' : 'mt-1'} flex flex-wrap items-center gap-x-3 gap-y-1`}>{meta}</div>
  // Narrow rows (board cards): the project gets the last line instead of eating the title's width on the right.
  const projectLine = showProject && project && <div className={`${compact ? 'mt-0.5' : 'mt-1'} flex min-w-0 @lg/row:hidden`}><Meta icon={projectIcon(project, inTeam)} color={project.color}><span className="truncate">{project.name}</span></Meta></div>

  return (
    <>
      <div role="button" tabIndex={0} onClick={() => ctx.open(task.id)} onKeyDown={e => e.key === 'Enter' && ctx.open(task.id)}
        {...drag} style={{ paddingLeft: 8 + depth * 28 }}
        className={`@container/row group relative flex cursor-pointer items-start pr-2 hover:bg-white/[0.015] ${small ? 'gap-2.5 py-1' : compact ? 'gap-2.5 py-1.5' : branch ? 'gap-3 py-1.5' : 'gap-3 py-2.5'}
          ${nested || branch === 'mid' ? '' : 'border-b border-white/[0.06] last:border-b-0'}`}>
        {branch && <>
          {/* Tree rail from the parent's glyph: the elbow curls into this row, the rail runs on past it unless this is the last child.
              lit: under a parent that finishes through its subtasks, a done child's stretch of rail glows — that's the parent's progress. */}
          <span aria-hidden className={`pointer-events-none absolute top-0 left-[17px] w-[14px] border-b border-l ${rail} ${small ? 'h-[13px]' : 'h-[17px]'}`} />
          {branch === 'mid' && <span aria-hidden className={`pointer-events-none absolute top-0 bottom-0 left-[17px] border-l ${rail}`} />}
        </>}
        <div className="pt-px"><GlyphButton task={task} ctx={ctx} size={compact ? 16 : undefined} /></div>
        <div className="min-w-0 flex-1">
          <div className={`min-w-0 ${compact ? 'text-[13px] leading-[18px]' : 'text-sm leading-5'} ${done ? 'text-white/35 line-through decoration-white/25' : rollup ? 'text-white/70' : 'text-white/90'}`}>{task.title}</div>
          {task.description && !compact && <div className="mt-0.5 truncate text-xs text-white/40">{task.description}</div>}
          {!rollup && metaLine}
          {!nested && projectLine}
        </div>
        {/* People, project and team each on their own line, stacked on the right. */}
        <div className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
          {people.length > 0 && <div className="flex -space-x-1.5">{people.map(p => <Avatar key={p.id} person={p} />)}</div>}
          <div className="contents">
            {showProject && project && (
              <span className="hidden items-center gap-1.5 text-xs text-white/40 @lg/row:inline-flex">
                {project.name}<span style={{ color: project.color }}><Icon name={projectIcon(project, inTeam)} className="size-3.5" /></span>
              </span>
            )}
            {project?.team && depth === 0 && !ctx.oneTeam && <TeamBadge team={project.team} label={ctx.wide ? `Do time ${project.team.name}` : undefined} />}
          </div>
        </div>
      </div>
      {nested && subs.map((s, i) => <TaskRow key={s.id} task={s} ctx={ctx} depth={1} small={!rollup} lit={rollup && isDone(s.status)} branch={i === subs.length - 1 ? 'last' : 'mid'} />)}
      {/* With its subtasks listed beneath, the parent's details close the block: all of them when the subtasks are its status, only the project otherwise. */}
      {nested && (rollup && meta.length > 0 || showProject && project) && (
        <div className="@container/row border-b border-white/[0.06] pr-2 pb-2 last:border-b-0" style={{ paddingLeft: compact ? 34 : 38 }}>
          {rollup && metaLine}
          {projectLine}
        </div>
      )}
    </>
  )
}

export function TagChip({ tag, color }: { tag: string; color: string }) {
  return (
    <span role="img" aria-label={`Etiqueta ${tag}`}
      className="group/tag inline-grid h-3.5 min-w-3 grid-cols-[0fr] items-center rounded-[4px] px-0 transition-[grid-template-columns,padding] duration-200 ease-[cubic-bezier(.2,.8,.2,1)] hover:grid-cols-[1fr] hover:px-1.5 motion-reduce:transition-none"
      style={{ background: color }}>
      <span className="overflow-hidden text-[10.5px] leading-none font-semibold whitespace-nowrap text-black/75 opacity-0 transition-opacity duration-150 group-hover/tag:opacity-100 group-hover/tag:delay-75">{tag}</span>
    </span>
  )
}

/** Marks a task delegated to you from a team, wherever it shows up in your own space. */
export function TeamBadge({ team, label = `Delegada a você pelo time ${team.name}` }: { team: { name: string; color: string }; label?: string }) {
  return (
    <Tip label={label}>
      <span className="inline-flex max-w-32 items-center gap-1 rounded-full py-0.5 pr-2 pl-1.5 text-[11px] font-medium" style={{ background: tint(team.color, 14), color: team.color }}>
        <Icon name="users" className="size-3 shrink-0" /><span className="truncate">{team.name}</span>
      </span>
    </Tip>
  )
}

export function TaskList({ tasks, ctx, showProject, empty, sortable, draggable, card }: { tasks: Task[]; ctx: Ctx; showProject?: boolean; empty?: string; sortable?: boolean; draggable?: boolean; card?: boolean }) {
  if (!tasks.length && empty) return <p className="py-6 text-sm text-white/40">{empty}</p>
  // draggable: rows move freely to a surrounding <Board> drop zone instead of reordering.
  if (draggable) return <div className={card ? 'space-y-1' : undefined}>{tasks.map(t => <DraggableTask key={t.id} task={t} ctx={ctx} showProject={showProject} card={card} />)}</div>
  if (!sortable) return <div>{tasks.map(t => <TaskRow key={t.id} task={t} ctx={ctx} showProject={showProject} />)}</div>
  return (
    <Sortable ids={tasks.map(t => t.id)} onMove={(from, to) => ctx.dispatch({ type: 'reorder', list: 'tasks', from, to })}>
      <div>{tasks.map(t => <SortableTask key={t.id} task={t} ctx={ctx} showProject={showProject} />)}</div>
    </Sortable>
  )
}

/** Row for a <Sortable> the caller builds (e.g. one spanning several sections). */
export const SortableTask = ({ dragId, ...p }: { task: Task; ctx: Ctx; showProject?: boolean; card?: boolean; dragId?: string }) => <DragShell {...p} drag={useRow(dragId ?? p.task.id)} />
const DraggableTask = (p: { task: Task; ctx: Ctx; showProject?: boolean; card?: boolean }) => <DragShell {...p} drag={useDrag(p.task.id, p.card)} />

function DragShell({ task, ctx, showProject, card, drag: { ref, style, handle, dragging } }: { task: Task; ctx: Ctx; showProject?: boolean; card?: boolean; drag: ReturnType<typeof useRow> }) {
  // Subtasks ride along inside the dragged block. card: a standalone tile on the board, no shared surface behind it.
  return (
    <div ref={ref} style={style} className={card
      // While held, the card itself stays behind as a dashed slot showing where it will land (the lifted copy is a DragOverlay).
      ? `float overflow-hidden rounded-2xl py-0.5 ${dragging ? 'opacity-40 outline-1 outline-dashed outline-iris/60 [&>*]:invisible' : ''}`
      : dragging ? 'rounded-xl bg-raised shadow-[0_16px_40px_-16px_rgba(0,0,0,.9)]' : undefined}>
      <TaskRow task={task} ctx={ctx} showProject={showProject} drag={handle} />
    </div>
  )
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, '')

export function QuickAddModal({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  // Portal so a transformed/clipped ancestor (a card, a board column) can't trap the fixed overlay.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-3 pt-[12vh] backdrop-blur-[2px]" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Nova tarefa" className="w-full max-w-2xl">{children}</div>
    </div>,
    document.body,
  )
}

// Example word, what it sets, and what a click inserts into the title.
const SHORTCUTS: [string, string, string][] = [
  ['amanhã', 'Data, ou hoje', 'amanhã'], ['14h', 'Horário, ou 9h30', '14h'], ['p1', 'Prioridade, de p1 a p4', 'p1'],
  ['30min', 'Duração, ou 1h', '30min'], ['#Projeto', 'Projeto', '#'], ['@etiqueta', 'Etiqueta', '@'], ['+pessoa', 'Responsável, só em times', '+'],
]

export function QuickAdd({ ctx, projectId = 'inbox', section, date, parentId = null, assignees: preset = [], tags = [], priority: basePriority = 4, autoFocus, onDone }:
  { ctx: Ctx; projectId?: string; section?: string; date?: string; parentId?: string | null; assignees?: string[]; tags?: string[]; priority?: Priority; autoFocus?: boolean; onDone?: () => void }) {
  const [open, setOpen] = useState(!!autoFocus)
  const [text, setText] = useState('')
  const [notes, setNotes] = useState('')
  // Picks made with the controls; anything left undefined falls back to what was typed.
  const [pick, setPick] = useState<{ projectId?: string; date?: string | null; priority?: Priority; assignees?: string[] }>({})
  const [help, setHelp] = useState(false)
  const mirror = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const insert = (w: string) => {
    setText(t => (t && !t.endsWith(' ') ? t + ' ' : t) + w + (w.length > 1 ? ' ' : ''))
    input.current?.focus()
  }
  const p = parseQuick(text)
  const projects = ctx.state.projects.filter(x => !x.team) // team tasks are created inside the team
  const typedProj = p.project ? projects.find(x => norm(x.name).startsWith(norm(p.project!))) : undefined
  const typedPeople = p.people.map(n => ctx.state.people.find(x => norm(x.name).startsWith(norm(n)))).filter(x => !!x).map(x => x.id)
  const proj = pick.projectId ?? typedProj?.id ?? projectId
  const d = pick.date !== undefined ? pick.date : p.date ?? (p.time ? today() : date ?? null)
  const priority = pick.priority ?? p.priority ?? basePriority
  const assignees = pick.assignees ?? (typedPeople.length ? typedPeople : preset)

  // Completions for the word being typed; Tab takes the first.
  const word = /\S+$/.exec(text)?.[0] ?? ''
  const suggest = (() => {
    const q = norm(word.slice(1)), c = word[0]
    type Sug = { w: string; label: string; color?: string }
    const pool: Sug[] | null =
      c === '#' ? projects.map(x => ({ w: '#' + x.name.replace(/\s+/g, ''), label: x.name, color: x.color }))
      : c === '@' ? [...new Set(ctx.state.tasks.flatMap(t => t.tags))].map(t => ({ w: '@' + t, label: t, color: colorFor(t, proj) }))
      : c === '+' ? ctx.state.people.map(x => ({ w: '+' + x.name.split(' ')[0], label: x.name }))
      : null
    if (pool) return word.length < 1 ? [] : pool.filter(o => norm(o.label).startsWith(q) && o.w !== word).slice(0, 5)
    const lw = norm(word)
    return word.length < 1 ? [] : ([
      { w: 'hoje', label: 'Data: hoje' }, { w: 'amanhã', label: 'Data: amanhã' },
      ...([1, 2, 3, 4] as Priority[]).map(n => ({ w: 'p' + n, label: `Prioridade ${n}`, color: PRIORITY[n].color })),
    ] as Sug[]).filter(o => norm(o.w).startsWith(lw) && norm(o.w) !== lw)
  })()
  // Dropdown sits under the word being typed, tracked via the mirror's last token.
  const wordEl = useRef<HTMLSpanElement>(null)
  const [wordX, setWordX] = useState(0)
  useLayoutEffect(() => { setWordX(wordEl.current && mirror.current ? Math.max(0, Math.min(wordEl.current.offsetLeft - mirror.current.scrollLeft, mirror.current.clientWidth - 224)) : 0) }, [text])
  const complete = (w: string) => { setText(text.slice(0, text.length - word.length) + w + ' '); input.current?.focus() }

  const close = () => { setText(''); setNotes(''); setPick({}); setOpen(false); onDone?.() }
  const submit = () => {
    if (!p.title) return
    ctx.dispatch({ type: 'add', task: blankTask({
      title: p.title, description: notes.trim(), projectId: proj, section: proj === projectId ? section : null, parentId, priority, tags: [...new Set([...tags, ...p.tags])], assignees,
      durationMin: p.durationMin ?? null,
      when: d ? (p.time ? { kind: 'time', date: d, time: p.time } : { kind: 'date', date: d }) : null,
    }) })
    close()
  }
  const keys = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === 'Tab' && !e.shiftKey && e.currentTarget.tagName === 'INPUT' && suggest.length) { e.preventDefault(); complete(suggest[0].w); return }
    if (e.key === 'Escape') close()
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || e.currentTarget.tagName === 'INPUT')) { e.preventDefault(); submit() }
  }

  if (!autoFocus) return (<>
    <button type="button" onClick={() => setOpen(true)} className="group flex w-full items-center gap-3 py-2.5 text-sm text-white/45 hover:text-white/80">
      <span className="grid size-5 place-items-center rounded-full text-iris group-hover:bg-iris group-hover:text-on"><Icon name="plus" className="size-3.5" /></span>
      {parentId ? 'Adicionar subtarefa' : 'Adicionar tarefa'}
    </button>
    {open && <QuickAddModal onClose={() => setOpen(false)}><QuickAdd ctx={ctx} projectId={projectId} section={section} date={date} parentId={parentId} assignees={preset} tags={tags} priority={basePriority} autoFocus onDone={() => setOpen(false)} /></QuickAddModal>}
  </>)

  const tokenColor = ({ text: w, kind }: { text: string; kind: QuickKind | null }) =>
    kind === 'priority' ? PRIORITY[Number(w[1]) as Priority].color
    : kind === 'project' ? (typedProj?.color ?? PALETTE.coral)
    : kind === 'tag' ? colorFor(w.slice(1), proj)
    : PALETTE.iris

  // Typed details that have no picker of their own.
  const extras: { k: string; icon: IconName; text: string; color?: string; warn?: boolean }[] = [
    ...(p.time ? [{ k: 'h', icon: 'clock' as IconName, text: p.time }] : []),
    ...(p.durationMin ? [{ k: 'du', icon: 'duration' as IconName, text: fmtDuration(p.durationMin) }] : []),
    ...(p.project && !typedProj && !pick.projectId ? [{ k: 'pr', icon: 'hash' as IconName, text: `Projeto “${p.project}” não existe`, warn: true }] : []),
    ...[...new Set([...tags, ...p.tags])].map(t => ({ k: 't' + t, icon: 'tag' as IconName, text: t, color: colorFor(t, proj) })),
  ]

  return (
    <div className="rise overflow-hidden rounded-2xl border border-white/[0.1] bg-surface shadow-[0_24px_50px_-24px_rgba(0,0,0,0.9)]">
      <div className="px-5 pt-5">
        {/* The input's own text is transparent; the layer behind it draws the same words, with commands tinted. */}
        <div className="relative text-lg font-semibold tracking-[-0.01em]">
          <div ref={mirror} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre text-white">
            {quickTokens(text).map((t, i, all) => t.kind
              ? <span key={i} ref={i === all.length - 1 ? wordEl : undefined} className="rounded-[4px]" style={{ color: tokenColor(t), background: tint(tokenColor(t), 18) }}>{t.text}</span>
              : i === all.length - 1 ? <span key={i} ref={wordEl}>{t.text}</span> : t.text)}
          </div>
          <input ref={input} autoFocus value={text} onChange={e => setText(e.target.value)} onKeyDown={keys} aria-label={parentId ? 'Nome da subtarefa' : 'Nome da tarefa'}
            onScroll={e => { if (mirror.current) mirror.current.scrollLeft = e.currentTarget.scrollLeft }}
            placeholder={parentId ? 'Nome da subtarefa' : 'O que precisa ser feito?'}
            className="relative w-full bg-transparent text-transparent caret-white outline-none selection:bg-iris/35 selection:text-white placeholder:font-medium placeholder:text-white/25" />
          {suggest.length > 0 && (
            <div role="listbox" aria-label="Sugestões" style={{ left: wordX }}
              className="rise absolute top-full z-20 mt-1 w-56 rounded-xl border border-white/[0.1] bg-surface p-1 text-sm font-normal tracking-normal shadow-[0_16px_40px_-12px_rgba(0,0,0,0.9)]">
              {suggest.map((o, i) => (
                <button key={o.w} type="button" role="option" aria-selected={i === 0} tabIndex={-1} onMouseDown={e => e.preventDefault()} onClick={() => complete(o.w)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left ${i === 0 ? 'bg-white/[0.07] text-white' : 'text-white/60 hover:bg-white/[0.05] hover:text-white/85'}`}>
                  {o.color && <span className="size-2 shrink-0 rounded-full" style={{ background: o.color }} />}
                  <span className="truncate">{o.label}</span>
                  {i === 0 && <kbd className="kbd ml-auto">Tab</kbd>}
                </button>
              ))}
            </div>
          )}
        </div>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} onKeyDown={keys} rows={2} aria-label="Descrição"
          placeholder="Detalhes, links, contexto…"
          className="mt-1 block w-full resize-none bg-transparent text-sm leading-6 text-white/75 outline-none placeholder:text-white/25" />
        {extras.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {extras.map(c => (
              <span key={c.k} className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ${c.warn ? 'bg-coral/10 text-coral' : 'bg-white/[0.05] text-white/70'}`}>
                <span style={{ color: c.color }}><Icon name={c.icon} className="size-3" /></span>{c.text}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1.5 px-4 pb-4">
        {!parentId && (
          <Select<string> ariaLabel="Projeto" compact searchable value={proj} onChange={projectId => setPick(s => ({ ...s, projectId }))}
            options={projects.map(x => ({ value: x.id, label: x.name, icon: projectIcon(x, ctx.state.people.length > 0), color: x.color }))} />
        )}
        <DateField ariaLabel="Data" compact clearable placeholder="Data" value={d} onChange={date => setPick(s => ({ ...s, date }))} />
        <Select<Priority> ariaLabel="Prioridade" compact value={priority} onChange={priority => setPick(s => ({ ...s, priority }))} options={priorityOptions} />
        {ctx.state.people.length > 0 && (
          <Select<string> ariaLabel="Responsáveis" compact multi={assignees} icon="users" placeholder="Responsável" searchable
            options={ctx.state.people.map(x => ({ value: x.id, label: x.name, avatar: <Avatar person={x} size="size-5" bare /> }))}
            onChange={id => setPick(s => ({ ...s, assignees: assignees.includes(id) ? assignees.filter(x => x !== id) : [...assignees, id] }))} />
        )}
      </div>

      <footer className="flex items-center gap-2 border-t border-white/[0.06] bg-white/[0.015] px-4 py-3">
        <button type="button" onClick={() => setHelp(h => !h)} aria-expanded={help}
          className="text-xs text-white/40 underline-offset-2 hover:text-white/70 hover:underline">Atalhos de digitação</button>
        <span className="ml-auto" />
        <button type="button" className={btnGhost} onClick={close}>Cancelar</button>
        <button type="button" className={btnPrimary} disabled={!p.title} onClick={submit}>{parentId ? 'Adicionar subtarefa' : 'Adicionar tarefa'}</button>
      </footer>
      {help && (
        <div className="border-t border-white/[0.06] px-5 pt-3 pb-4">
          <p className="text-xs text-white/45">Escreva no título. As palavras coloridas configuram a tarefa e saem do nome. Clique para inserir.</p>
          <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
            {SHORTCUTS.map(([w, what, ins]) => {
              const c = quickKind(w) === 'project' ? (ctx.state.projects.find(x => x.id !== 'inbox')?.color ?? PALETTE.iris) : tokenColor({ text: w, kind: quickKind(w) })
              return (
                <button key={w} type="button" onClick={() => insert(ins)}
                  className="-mx-2 flex items-baseline gap-3 rounded-lg px-2 py-1 text-left text-xs hover:bg-white/[0.04] focus-visible:bg-white/[0.06] focus-visible:outline-none">
                  <span className="min-w-[4.75rem] shrink-0"><span className="rounded-[4px] px-1 py-px text-[13px] font-semibold" style={{ color: c, background: tint(c, 18) }}>{w}</span></span>
                  <span className="text-white/55">{what}</span>
                </button>
              )
            })}
          </div>
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/45">
            <span><kbd className="kbd">Enter</kbd> adiciona</span>
            <span><kbd className="kbd">Ctrl</kbd> <kbd className="kbd">Enter</kbd> adiciona de dentro da descrição</span>
            <span><kbd className="kbd">Esc</kbd> cancela</span>
          </p>
        </div>
      )}
    </div>
  )
}

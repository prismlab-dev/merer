import { useRef, useState, type Dispatch, type KeyboardEvent, type ReactNode } from 'react'
import {
  type Priority, type QuickKind, type Task, quickKind, type When, blankTask, blockers, diffDays, fmtDay, fmtDuration, isDone, parseQuick, quickTokens, span, stepStatus, today,
} from './lib'
import type { Action, State } from './store'
import { DateField, Select, Tip } from './controls'
import { Sortable, useDrag, useRow } from './sortable'
import { Avatar, Icon, Meta, PALETTE, PRIORITY, StatusGlyph, btnGhost, btnPrimary, colorFor, priorityOptions, tint, WhenLabel, type IconName } from './ui'

export interface Ctx { state: State; dispatch: Dispatch<Action>; open: (id: string) => void }

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

export function TaskRow({ task, ctx, showProject, depth = 0, drag }: { task: Task; ctx: Ctx; showProject?: boolean; depth?: number; drag?: ReturnType<typeof useRow>['handle'] }) {
  const { state } = ctx
  const t = today()
  const done = isDone(task.status)
  const subs = state.tasks.filter(x => x.parentId === task.id)
  const waiting = blockers(task, state.tasks)
  const project = state.projects.find(p => p.id === task.projectId)
  const people = task.assignees.map(id => state.people.find(p => p.id === id)).filter(p => !!p)

  const meta: ReactNode[] = []
  if (waiting.length && !done) meta.push(<Meta key="b" icon="clock" tone="amber">Aguardando {waiting[0].title}{waiting.length > 1 && ` +${waiting.length - 1}`}</Meta>)
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
  if (subs.length) meta.push(<Meta key="sub" icon="subtasks">{subs.filter(x => isDone(x.status)).length}/{subs.length}</Meta>)
  for (const tag of task.tags) meta.push(<Meta key={'t' + tag} icon="tag" color={colorFor(tag)}>{tag}</Meta>)

  return (
    <>
      <div role="button" tabIndex={0} onClick={() => ctx.open(task.id)} onKeyDown={e => e.key === 'Enter' && ctx.open(task.id)}
        {...drag} style={{ paddingLeft: 8 + depth * 28 }}
        className="group flex cursor-pointer items-start gap-3 border-b border-white/[0.06] py-2.5 pr-2 last:border-b-0 hover:bg-white/[0.015]">
        <div className="pt-px"><GlyphButton task={task} ctx={ctx} /></div>
        <div className="min-w-0 flex-1">
          <div className={`text-sm leading-5 ${done ? 'text-white/35 line-through decoration-white/25' : 'text-white/90'}`}>{task.title}</div>
          {task.description && <div className="mt-0.5 truncate text-xs text-white/40">{task.description}</div>}
          {meta.length > 0 && <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">{meta}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          {people.length > 0 && <div className="flex -space-x-1.5">{people.map(p => <Avatar key={p.id} person={p} />)}</div>}
          {showProject && project && (
            <span className="hidden items-center gap-1.5 text-xs text-white/40 sm:inline-flex">
              {project.name}<span style={{ color: project.color }}><Icon name={project.id === 'inbox' ? 'inbox' : 'hash'} className="size-3.5" /></span>
            </span>
          )}
        </div>
      </div>
      {depth === 0 && !showProject && subs.map(s => <TaskRow key={s.id} task={s} ctx={ctx} depth={1} />)}
    </>
  )
}

export function TaskList({ tasks, ctx, showProject, empty, sortable, draggable }: { tasks: Task[]; ctx: Ctx; showProject?: boolean; empty?: string; sortable?: boolean; draggable?: boolean }) {
  if (!tasks.length && empty) return <p className="py-6 text-sm text-white/40">{empty}</p>
  // draggable: rows move freely to a surrounding <Board> drop zone instead of reordering.
  if (draggable) return <div>{tasks.map(t => <DraggableTask key={t.id} task={t} ctx={ctx} showProject={showProject} />)}</div>
  if (!sortable) return <div>{tasks.map(t => <TaskRow key={t.id} task={t} ctx={ctx} showProject={showProject} />)}</div>
  return (
    <Sortable ids={tasks.map(t => t.id)} onMove={(from, to) => ctx.dispatch({ type: 'reorder', list: 'tasks', from, to })}>
      <div>{tasks.map(t => <SortableTask key={t.id} task={t} ctx={ctx} showProject={showProject} />)}</div>
    </Sortable>
  )
}

const SortableTask = (p: { task: Task; ctx: Ctx; showProject?: boolean }) => <DragShell {...p} drag={useRow(p.task.id)} />
const DraggableTask = (p: { task: Task; ctx: Ctx; showProject?: boolean }) => <DragShell {...p} drag={useDrag(p.task.id)} />

function DragShell({ task, ctx, showProject, drag: { ref, style, handle, dragging } }: { task: Task; ctx: Ctx; showProject?: boolean; drag: ReturnType<typeof useRow> }) {
  // Subtasks ride along inside the dragged block.
  return (
    <div ref={ref} style={style} className={dragging ? 'rounded-xl bg-raised shadow-[0_16px_40px_-16px_rgba(0,0,0,.9)]' : undefined}>
      <TaskRow task={task} ctx={ctx} showProject={showProject} drag={handle} />
    </div>
  )
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, '')

export function QuickAddModal({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-3 pt-[12vh] backdrop-blur-[2px]" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Nova tarefa" className="w-full max-w-2xl">{children}</div>
    </div>
  )
}

// Example word, what it sets, and what a click inserts into the title.
const SHORTCUTS: [string, string, string][] = [
  ['amanhã', 'Data, ou hoje', 'amanhã'], ['14h', 'Horário, ou 9h30', '14h'], ['p1', 'Prioridade, de p1 a p4', 'p1'],
  ['30min', 'Duração, ou 1h', '30min'], ['#Projeto', 'Projeto', '#'], ['@etiqueta', 'Etiqueta', '@'], ['+pessoa', 'Responsável', '+'],
]

export function QuickAdd({ ctx, projectId = 'inbox', date, parentId = null, autoFocus, onDone }:
  { ctx: Ctx; projectId?: string; date?: string; parentId?: string | null; autoFocus?: boolean; onDone?: () => void }) {
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
  const typedProj = p.project ? ctx.state.projects.find(x => norm(x.name).startsWith(norm(p.project!))) : undefined
  const typedPeople = p.people.map(n => ctx.state.people.find(x => norm(x.name).startsWith(norm(n)))).filter(x => !!x).map(x => x.id)
  const proj = pick.projectId ?? typedProj?.id ?? projectId
  const d = pick.date !== undefined ? pick.date : p.date ?? (p.time ? today() : date ?? null)
  const priority = pick.priority ?? p.priority ?? 4
  const assignees = pick.assignees ?? typedPeople

  const close = () => { setText(''); setNotes(''); setPick({}); setOpen(false); onDone?.() }
  const submit = () => {
    if (!p.title) return
    ctx.dispatch({ type: 'add', task: blankTask({
      title: p.title, description: notes.trim(), projectId: proj, parentId, priority, tags: p.tags, assignees,
      durationMin: p.durationMin ?? null,
      when: d ? (p.time ? { kind: 'time', date: d, time: p.time } : { kind: 'date', date: d }) : null,
    }) })
    close()
  }
  const keys = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === 'Escape') close()
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || e.currentTarget.tagName === 'INPUT')) { e.preventDefault(); submit() }
  }

  if (!autoFocus) return (<>
    <button type="button" onClick={() => setOpen(true)} className="group flex w-full items-center gap-3 py-2.5 text-sm text-white/45 hover:text-white/80">
      <span className="grid size-5 place-items-center rounded-full text-iris group-hover:bg-iris group-hover:text-on"><Icon name="plus" className="size-3.5" /></span>
      {parentId ? 'Adicionar subtarefa' : 'Adicionar tarefa'}
    </button>
    {open && <QuickAddModal onClose={() => setOpen(false)}><QuickAdd ctx={ctx} projectId={projectId} date={date} parentId={parentId} autoFocus onDone={() => setOpen(false)} /></QuickAddModal>}
  </>)

  const tokenColor = ({ text: w, kind }: { text: string; kind: QuickKind | null }) =>
    kind === 'priority' ? PRIORITY[Number(w[1]) as Priority].color
    : kind === 'project' ? (typedProj?.color ?? PALETTE.coral)
    : kind === 'tag' ? colorFor(w.slice(1))
    : PALETTE.iris

  // Typed details that have no picker of their own.
  const extras: { k: string; icon: IconName; text: string; color?: string; warn?: boolean }[] = [
    ...(p.time ? [{ k: 'h', icon: 'clock' as IconName, text: p.time }] : []),
    ...(p.durationMin ? [{ k: 'du', icon: 'duration' as IconName, text: fmtDuration(p.durationMin) }] : []),
    ...(p.project && !typedProj && !pick.projectId ? [{ k: 'pr', icon: 'hash' as IconName, text: `Projeto “${p.project}” não existe`, warn: true }] : []),
    ...p.tags.map(t => ({ k: 't' + t, icon: 'tag' as IconName, text: t, color: colorFor(t) })),
  ]

  return (
    <div className="rise overflow-hidden rounded-2xl border border-white/[0.1] bg-surface shadow-[0_24px_50px_-24px_rgba(0,0,0,0.9)]">
      <div className="px-5 pt-5">
        {/* The input's own text is transparent; the layer behind it draws the same words, with commands tinted. */}
        <div className="relative text-lg font-semibold tracking-[-0.01em]">
          <div ref={mirror} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre text-white">
            {quickTokens(text).map((t, i) => t.kind
              ? <span key={i} className="rounded-[4px]" style={{ color: tokenColor(t), background: tint(tokenColor(t), 18) }}>{t.text}</span>
              : t.text)}
          </div>
          <input ref={input} autoFocus value={text} onChange={e => setText(e.target.value)} onKeyDown={keys} aria-label={parentId ? 'Nome da subtarefa' : 'Nome da tarefa'}
            onScroll={e => { if (mirror.current) mirror.current.scrollLeft = e.currentTarget.scrollLeft }}
            placeholder={parentId ? 'Nome da subtarefa' : 'O que precisa ser feito?'}
            className="relative w-full bg-transparent text-transparent caret-white outline-none selection:bg-iris/35 selection:text-white placeholder:font-medium placeholder:text-white/25" />
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
            options={ctx.state.projects.map(x => ({ value: x.id, label: x.name, icon: x.id === 'inbox' ? 'inbox' : 'hash', color: x.color }))} />
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

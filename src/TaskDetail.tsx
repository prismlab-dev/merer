import { type ReactNode, useEffect, useState } from 'react'
import {
  type Priority, type Recurrence, type Status, type Task, type Unit, type When,
  IN_DAYS, WEEKDAYS, addDays, blockers, diffDays, fmtDay, fmtDuration, fmtRecurrence, isDone, occurrences, parseISO, progressOf, span, today, uid,
} from './lib'
import { GlyphButton, QuickAdd, TaskRow, type Ctx } from './tasks'
import { Check, DateField, NumberField, Popover, Select, type DatePreset, Slider, TimeField } from './controls'
import { Avatar, Field, Icon, PALETTE, StatusGlyph, projectIcon, priorityOptions, Segmented, btnGhost, btnPrimary, colorFor, inputCls, tint, WhenLabel, type IconName } from './ui'

export function TaskDetail({ task, ctx, team, onClose }: { task: Task; ctx: Ctx; team?: { name: string; color: string }; onClose: () => void }) {
  const { state, dispatch } = ctx
  const set = (patch: Partial<Task>) => dispatch({ type: 'update', id: task.id, patch })
  const project = state.projects.find(p => p.id === task.projectId)
  const parent = state.tasks.find(t => t.id === task.parentId)
  const subs = state.tasks.filter(t => t.parentId === task.id)
  const t = today()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const stats: [string, IconName, string | null][] = [
    ['Status', isDone(task.status) ? 'done' : 'progress', task.status.kind === 'check' ? (task.status.done ? 'Concluída' : 'Aberta')
      : task.status.kind === 'progress' ? `${task.status.value}%`
      : task.status.kind === 'subtasks' ? `${task.status.done}/${task.status.total}` : task.status.stages[task.status.current]],
    ['Prazo em', 'deadline', task.deadline ? dayCount(diffDays(t, task.deadline)) : null],
    ['Duração', 'duration', task.durationMin ? fmtDuration(task.durationMin) : null],
    task.recurrence ? ['Concluída', 'repeat', `${task.completions}×`] : ['Subtarefas', 'subtasks', subs.length ? `${subs.filter(s => isDone(s.status)).length}/${subs.length}` : null],
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-3 py-[6vh] backdrop-blur-[2px]" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={task.title} className="rise w-full max-w-4xl rounded-2xl border border-white/[0.08] bg-surface text-white shadow-[0_24px_50px_-24px_rgba(0,0,0,0.9)]">
        <header className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-3.5">
          <span className="flex min-w-0 flex-1 items-center gap-2 text-xs text-white/45">
            <StatusGlyph status={task.status} priority={task.priority} blocked={blockers(task, state.tasks).length > 0 && !isDone(task.status)} size={16} />
            {parent ? 'Subtarefa de' : 'Tarefa de'}
            {project && <Chip color={project.color} icon={projectIcon(project, !!team)}>{project.id === 'inbox' ? 'Caixa de entrada' : project.name}</Chip>}
            {team && <>do<Chip color={team.color} icon="users">{team.name}</Chip></>}
          </span>
          <button type="button" aria-label="Fechar" onClick={onClose} className="grid size-8 place-items-center rounded-full border border-white/[0.1] text-white/60 hover:text-white">
            <Icon name="x" className="size-4" />
          </button>
        </header>

        <div className="grid gap-0 md:grid-cols-[1fr_320px]">
          <section className="min-w-0 space-y-5 p-5">
            <div className="flex items-start gap-3">
              <div className="pt-1.5"><GlyphButton task={task} ctx={ctx} size={22} /></div>
              <div className="min-w-0 flex-1">
                <input value={task.title} onChange={e => set({ title: e.target.value })} aria-label="Título"
                  className="w-full bg-transparent text-xl font-semibold tracking-[-0.01em] outline-none" />
                <textarea value={task.description} onChange={e => set({ description: e.target.value })} rows={1} placeholder="Descrição"
                  className="mt-1 max-h-48 min-h-6 w-full resize-none overflow-y-auto field-sizing-content bg-transparent text-sm leading-relaxed text-white/70 outline-none placeholder:text-white/25" />
              </div>
            </div>

            <StatusEditor status={task.status} onChange={status => set({ status })} />

            <Field label="Subtarefas" hint={subs.length ? `${subs.filter(s => isDone(s.status)).length} de ${subs.length}` : undefined}>
              <div className="rounded-xl border border-white/[0.06] px-3">
                {subs.map(s => <TaskRow key={s.id} task={s} ctx={ctx} />)}
                <QuickAdd ctx={ctx} projectId={task.projectId} parentId={task.id} />
              </div>
            </Field>

            <DependencyEditor task={task} ctx={ctx} />
            <TaskAutomations task={task} ctx={ctx} />
          </section>

          <aside className="space-y-5 border-t border-white/[0.06] p-5 md:border-t-0 md:border-l">
            <Field label="Projeto">
              <Select ariaLabel="Projeto" searchable value={task.projectId} onChange={projectId => set({ projectId, section: null })}
                options={state.projects.map(p => ({ value: p.id, label: p.name, icon: projectIcon(p, !!team), color: p.color }))} />
            </Field>
            {!!state.projects.find(p => p.id === task.projectId)?.sections?.length && <Field label="Seção">
              <Select<string> ariaLabel="Seção" value={task.section ?? ''} onChange={s => set({ section: s || null })}
                options={[{ value: '', label: 'Sem seção' }, ...state.projects.find(p => p.id === task.projectId)!.sections!.map(s => ({ value: s.id, label: s.name }))]} />
            </Field>}
            <Field label="Prioridade">
              <Select<Priority> ariaLabel="Prioridade" value={task.priority} onChange={priority => set({ priority })}
                options={priorityOptions} />
            </Field>
            <WhenEditor task={task} set={set} />
            <DeadlineEditor task={task} set={set} />
            <DurationEditor task={task} set={set} />
            <RecurrenceEditor task={task} set={set} />
            <Field label="Etiquetas">
              <TagEditor tags={task.tags} all={[...new Set([...state.tasks.flatMap(x => x.tags), ...Object.keys(state.tagColors ?? {})])]} onChange={tags => set({ tags })} />
            </Field>
            {state.people.length > 0 && <Field label="Responsáveis">
              <Select<string> ariaLabel="Responsáveis" multi={task.assignees} icon="users" placeholder="Atribuir a…" searchable
                options={state.people.map(p => ({ value: p.id, label: p.name, avatar: <Avatar person={p} size="size-5" bare /> }))}
                onChange={id => set({ assignees: task.assignees.includes(id) ? task.assignees.filter(x => x !== id) : [...task.assignees, id] })} />
            </Field>}
          </aside>
        </div>

        <footer className="flex items-center gap-4 border-t border-white/[0.06] px-5 py-3">
          <dl className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
            {stats.map(([k, icon, v]) => (
              <div key={k} title={k} className={`flex items-center gap-1.5 ${v ? 'text-white/70' : 'text-white/25'}`}
                style={k === 'Prazo em' && task.deadline && diffDays(t, task.deadline) < 0 && !isDone(task.status) ? { color: PALETTE.coral } : undefined}>
                <dt><Icon name={icon} className="size-3.5" /><span className="sr-only">{k}</span></dt>
                <dd className="tabular-nums">{v ?? '—'}</dd>
              </div>
            ))}
          </dl>
          <button type="button" className={btnGhost} onClick={() => { dispatch({ type: 'remove', id: task.id }); onClose() }}>
            <Icon name="trash" className="size-3.5" />Excluir
          </button>
        </footer>
      </div>
    </div>
  )
}

const dayCount = (n: number) => (n === 0 ? 'Hoje' : n < 0 ? `${-n}d atrás` : n === 1 ? '1 dia' : `${n} dias`)

function StatusEditor({ status, onChange }: { status: Status; onChange: (s: Status) => void }) {
  const [draft, setDraft] = useState(status.kind === 'stages' ? status.stages.join(', ') : 'A fazer, Em andamento, Em revisão, Concluído')
  const convert = (kind: Status['kind']): Status => {
    const done = isDone(status)
    if (kind === 'check') return { kind, done }
    if (kind === 'subtasks') return { kind, done: 0, total: 0 } // store fills in the real counts
    if (kind === 'progress') return { kind, value: Math.round(progressOf(status) * 100) }
    const stages = draft.split(',').map(s => s.trim()).filter(Boolean)
    return { kind, stages, current: done ? stages.length - 1 : 0 }
  }
  return (
    <Field label="Tipo de status">
      <Segmented value={status.kind} onChange={k => onChange(convert(k))}
        options={[{ value: 'check', label: 'Checklist' }, { value: 'progress', label: 'Progresso' }, { value: 'stages', label: 'Etapas' }, { value: 'subtasks', label: 'Subtarefas' }]} />
      {status.kind === 'check' && <p className="text-xs text-white/40">Aberta ou concluída. Clique no círculo para marcar.</p>}
      {status.kind === 'subtasks' && <p className="text-xs text-white/40">
        {status.total ? `${status.done} de ${status.total} concluídas.` : 'Adicione subtarefas abaixo.'} Conclui quando todas forem feitas; se for recorrente, elas reabrem no próximo ciclo.
      </p>}
      {status.kind === 'progress' && (
        <div className="flex items-center gap-3">
          <Slider ariaLabel="Progresso" min={0} max={100} step={5} value={status.value} marks={[25, 50, 75]} format={v => `${v}%`}
            color={status.value >= 100 ? PALETTE.lagoon : PALETTE.iris} onChange={value => onChange({ ...status, value })} />
          <span className="w-10 text-right text-sm tabular-nums">{status.value}%</span>
        </div>
      )}
      {status.kind === 'stages' && (
        <div className="space-y-2">
          <ol className="flex flex-wrap items-center gap-1">
            {status.stages.map((s, i) => (
              <li key={i} className="flex items-center gap-1">
                {i > 0 && <span className={`h-px w-3 ${i <= status.current ? 'bg-white/50' : 'bg-white/10'}`} />}
                <button type="button" onClick={() => onChange({ ...status, current: i })}
                  className={`rounded-full border px-2.5 py-1 text-xs ${i === status.current ? 'border-iris bg-iris text-on' : i < status.current ? 'border-white/25 text-white/80' : 'border-white/[0.08] text-white/45'}`}>
                  {s}
                </button>
              </li>
            ))}
          </ol>
          <input className={inputCls} value={draft} aria-label="Etapas separadas por vírgula" onChange={e => setDraft(e.target.value)}
            onBlur={() => {
              const stages = draft.split(',').map(s => s.trim()).filter(Boolean)
              if (stages.length >= 2) onChange({ ...status, stages, current: Math.min(status.current, stages.length - 1) })
            }} />
          <p className="text-xs text-white/40">A primeira etapa é o início; chegar à última conclui a tarefa.</p>
        </div>
      )}
    </Field>
  )
}

const WHEN_KINDS: { value: When['kind'] | 'none'; label: string; icon: IconName }[] = [
  { value: 'none', label: 'Sem data', icon: 'calendar' },
  { value: 'date', label: 'Dia', icon: 'calendar' },
  { value: 'time', label: 'Horário', icon: 'clock' },
  { value: 'slot', label: 'Faixa de horário', icon: 'duration' },
  { value: 'window', label: 'Janela de dias', icon: 'window' },
]

function WhenEditor({ task, set }: { task: Task; set: (p: Partial<Task>) => void }) {
  const w = task.when
  const t = today()
  const base = w ? span(w)[0] : t
  const kind = w?.kind ?? 'none'
  const change = (k: When['kind'] | 'none') => {
    if (k === 'none') return set({ when: null })
    const from = w?.kind === 'time' ? w.time : w?.kind === 'slot' ? w.from : '09:00'
    const end = (h: string) => { const [a, b] = h.split(':').map(Number); const m = a * 60 + b + (task.durationMin ?? 60); return `${String(Math.min(23, Math.floor(m / 60))).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` }
    set({ when: k === 'date' ? { kind: k, date: base } : k === 'time' ? { kind: k, date: base, time: from }
      : k === 'slot' ? { kind: k, date: base, from, to: end(from) } : { kind: k, start: base, end: addDays(base, 4) } })
  }
  const monday = addDays(t, ((8 - parseISO(t).getDay()) % 7) || 7)
  const saturday = addDays(t, (6 - parseISO(t).getDay() + 7) % 7 || 7)
  // Windows only make sense as ranges; single-day kinds get the day each shortcut starts on.
  const presets: DatePreset[] = kind === 'window'
    ? [
      { label: 'Esta semana', at: t, to: addDays(monday, -1) },
      { label: 'Próxima semana', at: monday, to: addDays(monday, 4) },
      { label: 'Fim de semana', at: saturday, to: addDays(saturday, 1) },
    ]
    : [
      { label: 'Hoje', at: t },
      { label: 'Amanhã', at: addDays(t, 1) },
      { label: 'Fim de semana', at: saturday },
      { label: 'Próxima semana', at: monday },
    ]
  const marks = task.deadline ? [{ date: task.deadline, color: PALETTE.coral, label: 'Prazo' }] : undefined
  const win = w?.kind === 'window'
  return (
    <Field label="Quando fazer" hint={w && <WhenLabel w={w} />}>
      <Select<When['kind'] | 'none'> ariaLabel="Tipo de data" value={kind} onChange={change}
        options={WHEN_KINDS.map(k => ({ ...k, color: k.value === 'none' ? undefined : PALETTE.azure }))} />
      {w && (
        <div className="grid grid-cols-2 gap-2">
          {win
            ? <div className="col-span-2"><DateField mode="range" ariaLabel="Janela" presets={presets} value={[w.start, w.end]} marks={marks}
              onChange={([start, end]) => set({ when: { ...w, start, end } })} /></div>
            : <div className="col-span-2">
              <DateField ariaLabel="Dia" presets={presets} value={w.date} marks={marks} onChange={d => d && set({ when: { ...w, date: d } })} />
            </div>}
          {w.kind === 'time' && <div className="col-span-2"><TimeField ariaLabel="Horário" value={w.time} onChange={time => set({ when: { ...w, time } })} /></div>}
          {w.kind === 'slot' && <>
            <TimeField ariaLabel="Das" value={w.from} onChange={from => set({ when: { ...w, from, to: w.to > from ? w.to : from } })} />
            <TimeField ariaLabel="Até" value={w.to} relativeTo={w.from} onChange={to => set({ when: { ...w, to } })} />
          </>}
        </div>
      )}
    </Field>
  )
}

function DeadlineEditor({ task, set }: { task: Task; set: (p: Partial<Task>) => void }) {
  const t = today()
  const d = task.deadline
  const from = task.when ? span(task.when)[1] : t
  let note = ''
  let tone = 'text-ink-3'
  if (d && task.when) {
    const slack = diffDays(from, d)
    if (slack < 0) { note = `O plano termina ${-slack}d depois do prazo.`; tone = 'text-coral' }
    else note = slack === 0 ? 'Sem folga: o plano termina no dia do prazo.' : `Folga de ${slack}d entre o plano e o prazo.`
    if (slack === 0) tone = 'text-saffron'
  }
  const presets: DatePreset[] = [
    { label: '+3 dias', icon: 'deadline', at: addDays(from, 3) },
    { label: '+1 semana', icon: 'deadline', at: addDays(from, 7) },
    { label: '+1 mês', icon: 'deadline', at: addDays(from, 30) },
  ]
  return (
    <Field label="Prazo final" hint={d && dayCount(diffDays(t, d))}>
      <DateField ariaLabel="Prazo" icon="deadline" placeholder="Sem prazo" clearable presets={presets} value={d} onChange={deadline => set({ deadline })}
        marks={task.when ? [{ date: from, color: PALETTE.iris, label: 'Fim do plano' }] : undefined} />
      {note && <p className={`text-xs ${tone}`}>{note}</p>}
    </Field>
  )
}

function DurationEditor({ task, set }: { task: Task; set: (p: Partial<Task>) => void }) {
  const d = task.durationMin
  const w = task.when
  const endsAt = d && w?.kind === 'time' ? (() => { const [h, m] = w.time.split(':').map(Number); const x = h * 60 + m + d; return `${String(Math.floor(x / 60) % 24).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}` })() : null
  return (
    <Field label="Duração" hint={endsAt && `termina ${endsAt}`}>
      <Select<number | null> ariaLabel="Duração" icon="duration" value={d} placeholder="Sem duração" onChange={durationMin => set({ durationMin })}
        options={[null, ...new Set([15, 30, 45, 60, 90, 120, 180, 240, ...(d ? [d] : [])].sort((x, y) => x - y))].map(m => ({ value: m, label: m === null ? 'Sem duração' : fmtDuration(m) }))}
        footer={() => (
          <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] p-2.5">
            <span className="text-xs text-ink-3">Personalizada</span>
            <NumberField ariaLabel="Duração em minutos" value={d} step={5} max={1440} suffix="min" placeholder="—" onChange={durationMin => set({ durationMin })} />
          </div>
        )} />
    </Field>
  )
}

const REPEAT_PRESETS: [string, string, Recurrence | null][] = [
  ['none', 'Não repete', null],
  ['day', 'Todo dia', { every: 1, unit: 'day', weekdays: [], anchor: 'schedule', until: null }],
  ['weekdays', 'Dias úteis', { every: 1, unit: 'week', weekdays: [1, 2, 3, 4, 5], anchor: 'schedule', until: null }],
  ['week', 'Toda semana', { every: 1, unit: 'week', weekdays: [], anchor: 'schedule', until: null }],
  ['2week', 'A cada 2 semanas', { every: 2, unit: 'week', weekdays: [], anchor: 'schedule', until: null }],
  ['month', 'Todo mês', { every: 1, unit: 'month', weekdays: [], anchor: 'schedule', until: null }],
  ['year', 'Todo ano', { every: 1, unit: 'year', weekdays: [], anchor: 'schedule', until: null }],
]
const sameRule = (a: Recurrence, b: Recurrence) =>
  a.every === b.every && a.unit === b.unit && [...a.weekdays].sort().join() === [...b.weekdays].sort().join()

function RecurrenceEditor({ task, set }: { task: Task; set: (p: Partial<Task>) => void }) {
  const r = task.recurrence
  const upd = (p: Partial<Recurrence>) => r && set({ recurrence: { ...r, ...p } })
  // Presets swap only the rule; anchor and end date survive the switch.
  const key = !r ? 'none' : REPEAT_PRESETS.find(([, , x]) => x && sameRule(x, r))?.[0] ?? 'custom'
  const pick = (k: string) => {
    const x = REPEAT_PRESETS.find(([v]) => v === k)?.[2]
    if (k === 'custom') return
    set(x ? { recurrence: { ...x, anchor: r?.anchor ?? 'schedule', until: r?.until ?? null }, when: task.when ?? { kind: 'date', date: today() } } : { recurrence: null })
  }
  const options = REPEAT_PRESETS.map(([value, label]) => ({ value, label, icon: 'repeat' as const, color: value === 'none' ? undefined : PALETTE.iris }))
  if (key === 'custom') options.push({ value: 'custom', label: fmtRecurrence({ ...r!, anchor: 'schedule', until: null }), icon: 'repeat', color: PALETTE.iris })
  const [peek, setPeek] = useState(false)
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null)
  const unit = (u: Unit) => r!.every > 1 ? { day: 'dias', week: 'semanas', month: 'meses', year: 'anos' }[u] : { day: 'dia', week: 'semana', month: 'mês', year: 'ano' }[u]
  return (
    <Field label="Repetir" hint={r && task.when && <>
      <button ref={setAnchor} type="button" aria-expanded={peek} onClick={() => setPeek(!peek)}
        className="rounded-md px-1.5 py-0.5 text-[11px] text-white/45 hover:bg-white/[0.06] hover:text-white aria-expanded:bg-white/[0.06] aria-expanded:text-white">Próximas</button>
      <Popover anchor={anchor} open={peek} onClose={() => setPeek(false)} width={300}><SeriesTable when={task.when} rec={r} /></Popover>
    </>}>
      <Select<string> ariaLabel="Repetir" icon="repeat" value={key} onChange={pick} options={options} width={280}
        footer={() => r ? (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-xs text-ink-2">
              A cada <NumberField ariaLabel="Intervalo" value={r.every} min={1} max={99} onChange={v => upd({ every: v ?? 1 })} />
            </div>
            <Segmented value={r.unit} onChange={u => upd({ unit: u, weekdays: [] })}
              options={(['day', 'week', 'month', 'year'] as Unit[]).map(u => ({ value: u, label: unit(u) }))} />
            {r.unit === 'week' && (
              <div className="flex gap-1">
                {WEEKDAYS.map((d, i) => {
                  const on = r.weekdays.includes(i)
                  return <button key={d} type="button" aria-pressed={on} aria-label={d} onClick={() => upd({ weekdays: on ? r.weekdays.filter(x => x !== i) : [...r.weekdays, i] })}
                    className={`h-7 flex-1 rounded-[8px] text-[11px] ${on ? 'bg-iris text-on' : 'bg-white/[0.04] text-white/50 hover:text-white'}`}>{d.slice(0, 1).toUpperCase()}</button>
                })}
              </div>
            )}
            <Check variant="switch" label="Contar a partir da conclusão" checked={r.anchor === 'completion'} onChange={c => upd({ anchor: c ? 'completion' : 'schedule' })}>
              <span className="text-xs text-white/70">Contar a partir da conclusão</span>
            </Check>
          </div>
        ) : <p className="text-xs text-ink-3">Escolha uma repetição para personalizar.</p>} />
      {r && <DateField ariaLabel="Repetir até" placeholder="Sem data de fim" clearable compact min={task.when ? span(task.when)[0] : undefined} value={r.until} onChange={until => upd({ until })} />}
    </Field>
  )
}

function SeriesTable({ when, rec }: { when: When; rec: Recurrence }) {
  const occ = occurrences(when, rec, 6)
  return (
    <div>
      <p className="px-3 pt-2.5 pb-2 text-xs text-white/50">Próximas ocorrências · {rec.anchor === 'completion' ? 'estimadas se concluir no dia' : fmtRecurrence(rec)}</p>
        <table className="w-full text-sm tabular-nums">
          <thead className="bg-raised text-left text-[11px] tracking-wider text-white/40 uppercase">
            <tr><th className="px-3 py-2 font-medium">#</th><th className="px-3 py-2 font-medium">Quando</th><th className="px-3 py-2 text-right font-medium">Em</th></tr>
          </thead>
          <tbody>
            {occ.map((o, i) => (
              <tr key={i} className="border-t border-white/[0.06]">
                <td className="px-3 py-2 text-white/40">{i + 1}</td>
                <td className="px-3 py-2"><WhenLabel w={o} /></td>
                <td className="px-3 py-2 text-right text-white/50">{dayCount(diffDays(today(), span(o)[0]))}</td>
              </tr>
            ))}
          </tbody>
        </table>
    </div>
  )
}

function TagEditor({ tags, all, onChange }: { tags: string[]; all: string[]; onChange: (t: string[]) => void }) {
  const options = [...new Set([...all, ...tags])].sort().map(t => ({ value: t, label: t, icon: 'tag' as const, color: colorFor(t) }))
  return (
    <Select<string> ariaLabel="Etiquetas" multi={tags} options={options} placeholder="Adicionar etiqueta" icon="tag" createNoun="etiqueta"
      onChange={t => onChange(tags.includes(t) ? tags.filter(x => x !== t) : [...tags, t])}
      onCreate={label => { const v = label.replace(/^@/, '').trim(); if (v && !tags.includes(v)) onChange([...tags, v]) }} />
  )
}

function DependencyEditor({ task, ctx }: { task: Task; ctx: Ctx }) {
  const all = ctx.state.tasks
  const deps = task.dependsOn.map(id => all.find(t => t.id === id)).filter(t => !!t)
  const dependents = all.filter(t => t.dependsOn.includes(task.id))
  // Exclude self, its subtasks and anything that (transitively) depends on it, so no cycles.
  const downstream = new Set<string>([task.id])
  for (let grew = true; grew;) {
    grew = false
    for (const t of all) if (!downstream.has(t.id) && (t.dependsOn.some(d => downstream.has(d)) || (t.parentId && downstream.has(t.parentId)))) { downstream.add(t.id); grew = true }
  }
  const options = all.filter(t => !downstream.has(t.id) && !task.dependsOn.includes(t.id))
  const set = (dependsOn: string[]) => ctx.dispatch({ type: 'update', id: task.id, patch: { dependsOn } })
  const waiting = blockers(task, all)
  return (
    <Field label="Depende de" hint={deps.length ? (waiting.length ? `${waiting.length} pendente${waiting.length > 1 ? 's' : ''}` : 'liberada') : undefined}>
      <div className="space-y-1">
        {deps.map(d => (
          <div key={d.id} className="flex items-center gap-2.5 rounded-[10px] border border-white/[0.06] px-3 py-2 text-sm">
            <span className={`size-2 rounded-full ${isDone(d.status) ? 'bg-lagoon' : 'bg-saffron'}`} />
            <button className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => ctx.open(d.id)}>{d.title}</button>
            <span className="text-xs text-white/40">{isDone(d.status) ? 'Concluída' : 'Pendente'}</span>
            <button aria-label={`Remover dependência ${d.title}`} className="text-ink-3 hover:text-white" onClick={() => set(task.dependsOn.filter(x => x !== d.id))}><Icon name="x" className="size-3.5" /></button>
          </div>
        ))}
        <Select<string> ariaLabel="Adicionar dependência" icon="link" searchable value={undefined} placeholder="Adicionar tarefa que precisa vir antes…"
          emptyText="Nenhuma tarefa disponível" onChange={id => set([...task.dependsOn, id])}
          options={options.map(o => {
            const p = ctx.state.projects.find(x => x.id === o.projectId)
            return { value: o.id, label: o.title, icon: 'hash' as const, color: p?.color, hint: p?.name }
          })} />
        <p className="text-xs text-white/40">
          {deps.length ? 'Fica bloqueada até todas acima serem concluídas.' : 'Sem dependências: pode ser feita a qualquer momento.'}
          {dependents.length > 0 && ` Libera: ${dependents.map(d => d.title).join(', ')}.`}
        </p>
      </div>
    </Field>
  )
}

function TaskAutomations({ task, ctx }: { task: Task; ctx: Ctx }) {
  const rules = ctx.state.automations.filter(a => a.trigger.kind === 'task' && a.trigger.taskId === task.id)
  const [title, setTitle] = useState('')
  const [inDays, setInDays] = useState('1')
  const add = () => {
    if (!title.trim()) return
    ctx.dispatch({ type: 'saveAutomation', automation: {
      id: uid(), name: `Após “${task.title}”`, enabled: true, runs: 0, trigger: { kind: 'task', taskId: task.id },
      action: { title: title.trim(), projectId: task.projectId, inDays: inDays === '' ? null : Number(inDays), priority: 4, tags: [] },
    } })
    setTitle('')
  }
  return (
    <Field label="Ao concluir">
      <div className="space-y-1">
        {rules.map(a => (
          <div key={a.id} className="flex items-center gap-2.5 rounded-[10px] border border-white/[0.06] px-3 py-2 text-sm">
            <Icon name="bolt" className={`size-3.5 ${a.enabled ? 'text-saffron' : 'text-ink-4'}`} />
            <span className="min-w-0 flex-1 truncate">Criar “{a.action.title}”{a.action.inDays !== null && <span className="text-white/45"> para {fmtDay(addDays(today(), a.action.inDays))}</span>}</span>
            <button aria-label="Remover automação" className="text-ink-3 hover:text-white" onClick={() => ctx.dispatch({ type: 'removeAutomation', id: a.id })}><Icon name="x" className="size-3.5" /></button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <input className={`${inputCls} min-w-40 flex-1`} value={title} placeholder="Criar tarefa…" aria-label="Tarefa a criar"
            onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} />
          <Select<string> ariaLabel="Data da nova tarefa" compact icon="calendar" value={inDays} onChange={setInDays}
            options={IN_DAYS.map(([v, l]) => ({ value: v === null ? '' : String(v), label: l }))} />
          <button type="button" className={btnPrimary} disabled={!title.trim()} onClick={add}>Criar regra</button>
        </div>
      </div>
    </Field>
  )
}

export function Chip({ color, icon, quiet, children }: { color: string; icon: IconName; quiet?: boolean; children: ReactNode }) {
  return (
    <span className={`flex min-w-0 items-center rounded-md text-white/85 ${quiet ? 'gap-1 px-1.5 text-[11px]' : 'gap-1.5 border px-2 py-0.5 font-medium'}`}
      style={{ background: tint(color, 14), borderColor: tint(color, 40) }}>
      <span className="shrink-0" style={{ color }}><Icon name={icon} className={quiet ? 'size-3' : 'size-3.5'} /></span>
      <span className="truncate">{children}</span>
    </span>
  )
}

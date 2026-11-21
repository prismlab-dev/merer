import { useEffect, useState, type ReactNode } from 'react'
import { type Task, addDays, blockers, diffDays, fmtDay, fmtDuration, isDone, parseISO, span, today, WEEKDAYS } from './lib'
import { TaskList, type Ctx } from './tasks'
import { Icon, PALETTE, PRIORITY, tint, type IconName } from './ui'
import { Header, type View } from './views'
import { NotesWidget } from './notes'

// ---------- pomodoro: persisted so it keeps running while you navigate ----------
const FOCUS = 25 * 60, BREAK = 5 * 60
interface Pomo { mode: 'focus' | 'break'; endsAt: number | null; left: number; date: string; count: number }
const POMO_KEY = 'silus-pomo'
function loadPomo(): Pomo {
  const fresh: Pomo = { mode: 'focus', endsAt: null, left: FOCUS, date: today(), count: 0 }
  try {
    const p = JSON.parse(localStorage.getItem(POMO_KEY) ?? 'null') as Pomo | null
    if (p) return p.date === today() ? p : { ...p, date: today(), count: 0 }
  } catch { /* storage unavailable */ }
  return fresh
}

function usePomodoro() {
  const [p, setP] = useState(loadPomo)
  const [now, setNow] = useState(Date.now)
  useEffect(() => { try { localStorage.setItem(POMO_KEY, JSON.stringify(p)) } catch { /* ignore */ } }, [p])
  useEffect(() => {
    if (!p.endsAt) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [p.endsAt])
  const left = p.endsAt ? Math.max(0, Math.round((p.endsAt - now) / 1000)) : p.left
  useEffect(() => {
    if (p.endsAt && left === 0) setP(x => x.mode === 'focus'
      ? { ...x, mode: 'break', endsAt: null, left: BREAK, count: x.count + 1 }
      : { ...x, mode: 'focus', endsAt: null, left: FOCUS })
  }, [left, p.endsAt])
  const total = p.mode === 'focus' ? FOCUS : BREAK
  return {
    ...p, left, total, running: !!p.endsAt,
    toggle: () => setP(x => x.endsAt ? { ...x, endsAt: null, left } : { ...x, endsAt: Date.now() + x.left * 1000 }),
    reset: () => setP(x => ({ ...x, endsAt: null, left: x.mode === 'focus' ? FOCUS : BREAK })),
    skip: () => setP(x => ({ ...x, endsAt: null, mode: x.mode === 'focus' ? 'break' : 'focus', left: x.mode === 'focus' ? BREAK : FOCUS })),
  }
}

// ---------- pieces ----------
function Card({ title, icon, color, action, className = '', children }: { title: string; icon: IconName; color: string; i: number; action?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`float rounded-[22px] p-4 ${className}`}>
      <header className="mb-4 flex items-center gap-2">
        <span style={{ color }}><Icon name={icon} className="size-4" /></span>
        <h2 className="flex-1 text-[11px] font-medium tracking-wider text-white/45 uppercase">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  )
}

/** Progress bar on transform so it never triggers layout. */
function Bar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
      <div className="h-full origin-left rounded-full" style={{ background: color, transform: `scaleX(${Math.min(1, value)})`, transition: 'transform .5s cubic-bezier(0.23, 1, 0.32, 1)' }} />
    </div>
  )
}

function Stat({ label, value, hint, color }: { label: string; value: ReactNode; hint?: string; color: string }) {
  return (
    <div className="rounded-xl bg-white/[0.02] px-3 py-2.5">
      <div className="text-[11px] text-white/40">{label}</div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums" style={{ color }}>{value}</div>
      {hint && <div className="text-[11px] text-white/35 tabular-nums">{hint}</div>}
    </div>
  )
}

/**
 * Today at a glance: three figures over one bar where each segment is a task.
 */
function DayLoad({ done, planned, late, minutes, onOpen }: { done: number; planned: number; late: number; minutes: number; onOpen: () => void }) {
  const segs = [...Array(done).fill(PALETTE.lagoon), ...Array(late).fill(PALETTE.coral), ...Array(planned).fill(null)] as (string | null)[]
  const figs = [
    { n: planned, unit: planned === 1 ? 'tarefa para hoje' : 'tarefas para hoje', color: 'rgb(from var(--color-white) r g b / .5)' },
    ...(late ? [{ n: late, unit: late === 1 ? 'atrasada' : 'atrasadas', color: PALETTE.coral }] : []),
    { n: minutes ? fmtDuration(minutes) : '—', unit: 'de trabalho planejado', color: PALETTE.iris },
  ]
  return (
    <button type="button" onClick={onOpen} aria-label="Abrir Hoje" className="group block w-full px-1 pb-2 text-left">
      {segs.length > 0 && (
        <div className="mb-3 flex h-[3px] gap-[2px]" aria-hidden>
          {segs.map((c, i) => (
            <span key={i} className="flex-1 overflow-hidden bg-white/[0.1] first:rounded-l-full last:rounded-r-full">
              {c && <span className="block h-full" style={{ background: c }} />}
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] text-white/45">
        {figs.map(f => (
          <span key={f.unit} className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full" style={{ background: f.color }} />
            <b className="font-medium text-white/90 tabular-nums">{f.n}</b>{f.unit}
          </span>
        ))}
        {segs.length > 0 && <span className="ml-auto tabular-nums text-white/35 transition-colors group-hover:text-white/70">{done}/{done + planned + late} feitas</span>}
      </div>
    </button>
  )
}

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
const startOf = (w: Task['when']) => (w ? span(w)[0] + (w.kind === 'time' ? w.time : w.kind === 'slot' ? w.from : '') : '')

export function HomeView({ ctx, go }: { ctx: Ctx; go: (v: View) => void }) {
  const { state } = ctx
  const pomo = usePomodoro()
  const t = today()
  const roots = state.tasks.filter(x => !x.parentId)
  const open = roots.filter(x => !isDone(x.status))
  const doneOn = (d: string) => roots.filter(x => x.completedAt && x.completedAt.slice(0, 10) === d).length

  const overdue = open.filter(x => (x.when && span(x.when)[1] < t) || (x.deadline && x.deadline < t))
  const late = new Set(overdue.map(x => x.id))
  const planned = open.filter(x => !late.has(x.id) && ((x.when && span(x.when)[0] === t) || x.deadline === t))
    .sort((a, b) => (startOf(a.when) || '9') < (startOf(b.when) || '9') ? -1 : 1)
  const undated = open.filter(x => !x.when && !x.deadline)
  const appts = open.filter(x => x.when && (x.when.kind === 'time' || x.when.kind === 'slot') && x.when.date >= t)
    .sort((a, b) => (startOf(a.when) < startOf(b.when) ? -1 : 1)).slice(0, 4)

  // Daily / weekly progress (week = monday → sunday).
  const doneToday = doneOn(t)
  const dayGoal = doneToday + planned.length + overdue.length
  const dow = (parseISO(t).getDay() + 6) % 7
  const week = Array.from({ length: 7 }, (_, i) => addDays(t, i - dow))
  const perDay = week.map(doneOn)
  const weekDone = perDay.reduce((a, b) => a + b, 0)
  const weekOpen = open.filter(x => x.when && span(x.when)[0] <= week[6]).length
  const maxDay = Math.max(1, ...perDay)
  let streak = 0
  for (let d = doneToday ? t : addDays(t, -1); doneOn(d) > 0; d = addDays(d, -1)) streak++

  // Rule-based next actions, most pressing first.
  const tips: { icon: IconName; color: string; text: string; id?: string; inbox?: boolean }[] = []
  const worst = [...overdue].sort((a, b) => a.priority - b.priority)[0]
  if (worst) tips.push({ icon: 'deadline', color: PALETTE.coral, text: `Resolva “${worst.title}”, está atrasada`, id: worst.id })
  const first = planned.find(x => !blockers(x, state.tasks).length)
  if (first) tips.push({ icon: 'timer', color: PALETTE.iris, text: `Comece um pomodoro em “${first.title}”`, id: first.id })
  const stuck = open.find(x => blockers(x, state.tasks).length)
  if (stuck) tips.push({ icon: 'lock', color: PALETTE.saffron, text: `Destrave “${blockers(stuck, state.tasks)[0].title}” para liberar “${stuck.title}”`, id: blockers(stuck, state.tasks)[0].id })
  const soon = open.find(x => x.deadline && !late.has(x.id) && diffDays(t, x.deadline) <= 3 && !planned.includes(x))
  if (soon) tips.push({ icon: 'deadline', color: PALETTE.azure, text: `Prazo de “${soon.title}” é ${fmtDay(soon.deadline!).toLowerCase()}`, id: soon.id })
  const inbox = open.filter(x => x.projectId === 'inbox').length
  if (inbox > 2) tips.push({ icon: 'inbox', color: PALETTE.azure, text: `Organize as ${inbox} tarefas da Entrada`, inbox: true })
  if (!tips.length) tips.push({ icon: 'sparkle', color: PALETTE.lagoon, text: 'Tudo em dia. Planeje o dia de amanhã.' })

  const h = new Date().getHours()
  const hello = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
  const d = parseISO(t)
  const minutes = planned.reduce((s, x) => s + (x.durationMin ?? 0), 0)

  return (
    <>
      <header className="mb-6 px-1">
        <h1 className="text-[28px] font-semibold tracking-[-0.02em]">{hello}.</h1>
        <p className="mt-1 text-sm text-white/45">{d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}.</p>
      </header>

      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,780px)_auto] lg:justify-between">
        <div className="grid items-start gap-3 lg:order-2 lg:w-[340px] xl:w-auto xl:grid-cols-[240px_340px]">
        <NotesWidget ctx={ctx} onOpen={id => go({ kind: 'notes', focus: id })} />
        <aside className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
        <Card i={3} title="Produtividade" icon="trend" color={PALETTE.iris}>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Taxa da semana" color={PALETTE.lagoon} value={`${weekDone + weekOpen ? Math.round((weekDone / (weekDone + weekOpen)) * 100) : 0}%`} hint={`${weekDone} de ${weekDone + weekOpen}`} />
            <Stat label="Sequência" color={PALETTE.saffron} value={`${streak}d`} hint="dias concluindo algo" />
            <Stat label="Foco hoje" color={PALETTE.iris} value={`${pomo.count * 25}min`} hint={`${pomo.count} pomodoros`} />
            <Stat label="Atrasadas" color={overdue.length ? PALETTE.coral : PALETTE.lagoon} value={overdue.length} hint={overdue.length ? 'precisam de atenção' : 'nada pendente'} />
          </div>
        </Card>

        <Card i={1} title="Progresso de hoje" icon="done" color={PALETTE.lagoon}>
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-2xl font-semibold tabular-nums">{doneToday}<span className="text-base text-white/35">/{dayGoal}</span></span>
            <span className="text-white/45 tabular-nums">{dayGoal ? Math.round((doneToday / dayGoal) * 100) : 0}%</span>
          </div>
          <div className="mt-3"><Bar value={dayGoal ? doneToday / dayGoal : 0} color={PALETTE.lagoon} /></div>
          <div className="mt-4 flex h-16 items-end gap-1.5" aria-label={`Concluídas na semana: ${weekDone}`}>
            {week.map((day, i) => (
              <div key={day} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-12 w-full items-end overflow-hidden rounded-md bg-white/[0.03]">
                  <div className="w-full origin-bottom rounded-md" style={{ height: '100%', background: day === t ? PALETTE.lagoon : tint(PALETTE.lagoon, 40), transform: `scaleY(${perDay[i] / maxDay})`, transition: 'transform .5s cubic-bezier(0.23, 1, 0.32, 1)' }} />
                </div>
                <span className={`text-[10px] ${day === t ? 'text-white' : 'text-white/35'}`}>{WEEKDAYS[parseISO(day).getDay()].slice(0, 1).toUpperCase()}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-white/45 tabular-nums">{weekDone} concluídas nesta semana · {weekOpen} ainda abertas</p>
        </Card>

        <Card i={7} title="Próximos compromissos" icon="clock" color={PALETTE.azure}>
          {appts.length ? (
            <ol className="relative">
              {/* timeline rail */}
              <span aria-hidden className="absolute top-3 bottom-3 left-[68px] w-px bg-white/[0.08]" />
              {appts.map((a, i) => {
                const w = a.when as Extract<Task['when'], { kind: 'time' | 'slot' }>
                const start = w.kind === 'time' ? w.time : w.from
                const newDay = i === 0 || (appts[i - 1].when as typeof w).date !== w.date
                const next = i === 0
                const color = PRIORITY[a.priority].color
                return (
                  <li key={a.id}>
                    {newDay && <h3 className={`relative mb-1 pl-[86px] text-xs text-white/45 first-letter:uppercase ${i ? 'mt-3' : ''}`}>{fmtDay(w.date)}</h3>}
                    <button type="button" onClick={() => ctx.open(a.id)}
                      className="group relative flex w-full items-start gap-3 rounded-xl py-2 pr-2 text-left transition-colors hover:bg-white/[0.04]"
                      style={next ? { background: tint(PALETTE.azure, 8) } : undefined}>
                      <span className={`w-[52px] shrink-0 pt-px text-right tabular-nums ${next ? 'text-base font-semibold text-white' : 'text-sm text-white/70'}`}>{start}</span>
                      <span className="relative z-10 mt-[7px] grid size-2.5 shrink-0 place-items-center rounded-full" style={{ background: color, boxShadow: `0 0 0 3px var(--color-surface)${next ? `, 0 0 0 5px ${tint(color, 35)}` : ''}` }} />
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate ${next ? 'text-[15px] font-medium' : 'text-sm text-white/85'}`}>{a.title}</span>
                        <span className="block text-xs text-white/40 tabular-nums">
                          {w.kind === 'slot' ? `até ${w.to}` : a.durationMin ? `${a.durationMin} min` : 'horário marcado'}
                          {next && <span style={{ color: PALETTE.azure }}> · próximo</span>}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          ) : <p className="text-sm text-white/40">Nenhum compromisso com horário. Defina um horário numa tarefa para vê-la aqui.</p>}
        </Card>
        </aside>
        </div>

        <div className="grid gap-3 lg:order-1">
        <DayLoad done={doneToday} planned={planned.length} late={overdue.length} minutes={minutes} onOpen={() => go({ kind: 'today' })} />

        {planned.length > 0 && (
          <Card i={5} title="Planejadas para hoje" icon="today" color={PALETTE.lagoon}
            action={<button type="button" onClick={() => go({ kind: 'today' })} className="text-xs text-white/40 hover:text-white">Ver tudo</button>}>
            <div className="-mt-2"><TaskList tasks={planned.slice(0, 6)} ctx={ctx} showProject empty="Nada planejado para hoje." /></div>
          </Card>
        )}

        {overdue.length > 0 && (
          <Card i={6} title={`Atrasadas · ${overdue.length}`} icon="deadline" color={PALETTE.coral}>
            <div className="-mt-2"><TaskList tasks={overdue.slice(0, 5)} ctx={ctx} showProject /></div>
          </Card>
        )}

        {undated.length > 0 && (
          <Card i={7} title={`Sem data · ${undated.length}`} icon="inbox" color={PALETTE.azure}>
            <div className="-mt-2"><TaskList tasks={undated.slice(0, 6)} ctx={ctx} showProject empty="Toda tarefa aberta tem uma data." /></div>
          </Card>
        )}

        <Card i={4} title="Próximas ações" icon="sparkle" color={PALETTE.saffron}>
          <ul className="space-y-1">
            {tips.slice(0, 4).map(tip => (
              <li key={tip.text}>
                <button type="button" disabled={!tip.id && !tip.inbox} onClick={() => tip.id ? ctx.open(tip.id) : go({ kind: 'project', id: 'inbox' })}
                  className="flex w-full items-center gap-3 rounded-[10px] px-2 py-2 text-left text-sm text-white/80 transition-colors hover:bg-white/[0.04] hover:text-white disabled:pointer-events-none">
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg" style={{ background: tint(tip.color, 14), color: tip.color }}><Icon name={tip.icon} className="size-3.5" /></span>
                  <span className="flex-1">{tip.text}</span>
                  <Icon name="chevron" className="size-4 text-white/25" />
                </button>
              </li>
            ))}
          </ul>
        </Card>

        </div>
      </div>
    </>
  )
}

export function PomodoroView() {
  const pomo = usePomodoro()
  const R = 46, C = 2 * Math.PI * R
  const color = pomo.mode === 'focus' ? PALETTE.iris : PALETTE.lagoon
  const btn = 'press grid size-11 place-items-center rounded-full text-white/50 hover:bg-white/[0.06] hover:text-white'
  return (
    <>
      <Header title="Pomodoro" icon="timer" color={PALETTE.iris} sub={`${pomo.count} hoje · ${pomo.count * 25} min de foco`} />
      <div className="rise mx-auto flex max-w-md flex-col items-center pt-[6vh]">
        <div className="relative size-72 sm:size-80">
          <svg viewBox="0 0 100 100" className="size-full" aria-hidden>
            <circle cx="50" cy="50" r={R} fill="none" stroke="rgb(from var(--color-white) r g b / .06)" strokeWidth={2.5} />
            <circle cx="50" cy="50" r={R} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" transform="rotate(-90 50 50)"
              strokeDasharray={C} strokeDashoffset={C * (pomo.left / pomo.total)} style={{ transition: 'stroke-dashoffset 1s linear, stroke .2s ease' }} />
          </svg>
          <div className="absolute inset-0 grid place-content-center text-center">
            <div className="text-6xl font-semibold tracking-[-0.03em] tabular-nums" role="timer" aria-live="off">{mmss(pomo.left)}</div>
            <div className="mt-1 text-sm" style={{ color }}>{pomo.mode === 'focus' ? 'Foco' : 'Pausa'}</div>
          </div>
        </div>
        <div className="mt-8 flex items-center gap-3">
          <button type="button" onClick={pomo.reset} aria-label="Reiniciar" className={btn}><Icon name="reset" className="size-4" /></button>
          <button type="button" onClick={pomo.toggle}
            className="press inline-flex items-center gap-2 rounded-full px-7 py-3 text-base font-medium text-on hover:brightness-110" style={{ background: color }}>
            <Icon name={pomo.running ? 'pause' : 'play'} className="size-4" />{pomo.running ? 'Pausar' : 'Iniciar'}
          </button>
          <button type="button" onClick={pomo.skip} aria-label="Pular etapa" className={btn}><Icon name="skip" className="size-4" /></button>
        </div>
        <p className="mt-6 text-sm text-white/40">25 min de foco, 5 min de pausa.</p>
      </div>
    </>
  )
}

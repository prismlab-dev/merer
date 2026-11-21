import { useState, type CSSProperties } from 'react'
import { type Note, uid } from './lib'
import type { Ctx } from './tasks'
import { Icon, PALETTE, PROJECT_COLORS, tint } from './ui'
import { Header } from './views'

const blank = (color: string): Note => ({ id: uid(), text: '', color, pinned: false, updatedAt: new Date().toISOString() })
// Deterministic tilt so a slip keeps its angle across renders.
const tilt = (id: string) => ([...id].reduce((h, c) => h + c.charCodeAt(0), 0) % 5 - 2) * 0.6
const ago = (iso: string) => {
  const m = Math.round((Date.now() - +new Date(iso)) / 60000)
  return m < 1 ? 'agora' : m < 60 ? `há ${m} min` : m < 1440 ? `há ${Math.round(m / 60)} h` : new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })
}

/** A paper slip: palette-tinted, taped on top, slightly askew until you touch it. */
function Slip({ note, ctx, compact, autoFocus, onOpen }: { note: Note; ctx: Ctx; compact?: boolean; autoFocus?: boolean; onOpen?: () => void }) {
  const save = (patch: Partial<Note>) => ctx.dispatch({ type: 'saveNote', note: { ...note, ...patch, updatedAt: new Date().toISOString() } })
  const [title, ...rest] = note.text.split('\n')
  return (
    <article style={{ '--c': note.color, '--r': `${tilt(note.id)}deg`, background: `linear-gradient(${tint(note.color, 22)}, ${tint(note.color, 12)}), var(--color-raised)` } as CSSProperties}
      className={`slip group relative mb-3 break-inside-avoid rounded-[4px_4px_14px_4px] px-4 pt-5 pb-3 shadow-[0_18px_30px_-18px_rgba(0,0,0,.9)]`}>
      <span aria-hidden className="absolute -top-1.5 left-1/2 h-3 w-12 -translate-x-1/2 rounded-[2px] opacity-70" style={{ background: tint(note.color, 55) }} />
      {compact ? (
        <button type="button" onClick={onOpen} className="block w-full text-left text-sm leading-snug">
          <p className="font-medium text-white">{title || 'Sem título'}</p>
          {rest.join(' ').trim() && <p className="mt-1 line-clamp-3 text-white/65">{rest.join(' ')}</p>}
        </button>
      ) : (
        <textarea autoFocus={autoFocus} value={note.text} aria-label="Texto da anotação" placeholder="Escreva algo…" rows={Math.max(3, note.text.split('\n').length + 1)}
          onChange={e => save({ text: e.target.value })} onBlur={() => !note.text.trim() && ctx.dispatch({ type: 'removeNote', id: note.id })}
          className="block w-full resize-none bg-transparent text-sm leading-relaxed text-white/85 outline-none placeholder:text-white/35 first-line:font-medium first-line:text-white" />
      )}
      <footer className="mt-2 flex items-center gap-1 text-[11px] text-white/40">
        <span className="flex-1 tabular-nums">{ago(note.updatedAt)}</span>
        {!compact && PROJECT_COLORS.map(c => (
          <button key={c} type="button" aria-label="Mudar cor" aria-pressed={c === note.color} onClick={() => save({ color: c })}
            className="size-3.5 rounded-full opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 aria-pressed:ring-2 aria-pressed:ring-white/60" style={{ background: c }} />
        ))}
        <button type="button" aria-label={note.pinned ? 'Tirar do Início' : 'Fixar no Início'} title={note.pinned ? 'Tirar do Início' : 'Fixar no Início'} onClick={() => save({ pinned: !note.pinned })}
          className={`ml-1 grid size-6 place-items-center rounded-md hover:bg-white/[0.08] hover:text-white ${note.pinned ? 'text-(--c)' : ''}`}><Icon name={note.pinned ? 'pin' : 'unpin'} className="size-3.5" /></button>
        {!compact && <button type="button" aria-label="Apagar anotação" onClick={() => ctx.dispatch({ type: 'removeNote', id: note.id })}
          className="grid size-6 place-items-center rounded-md hover:bg-white/[0.08] hover:text-coral"><Icon name="trash" className="size-3.5" /></button>}
      </footer>
    </article>
  )
}

export function NotesView({ ctx, focus }: { ctx: Ctx; focus?: string }) {
  const [fresh, setFresh] = useState<string | null>(focus ?? null)
  const notes = [...ctx.state.notes].sort((a, b) => Number(b.pinned) - Number(a.pinned))
  const add = () => {
    const n = blank(PROJECT_COLORS[ctx.state.notes.length % PROJECT_COLORS.length])
    ctx.dispatch({ type: 'saveNote', note: n }); setFresh(n.id)
  }
  return (
    <>
      <Header title="Anotações" icon="note" color={PALETTE.orchid} sub={`${notes.length} anotaç${notes.length === 1 ? 'ão' : 'ões'}`}>
        <button type="button" onClick={add} className="press inline-flex items-center gap-1.5 rounded-full bg-iris px-3.5 py-1.5 text-sm font-medium text-on hover:brightness-110">
          <Icon name="plus" className="size-3.5" />Nova anotação
        </button>
      </Header>
      {notes.length ? (
        <div className="columns-1 gap-3 sm:columns-2 lg:columns-3 xl:columns-4">
          {notes.map(n => <Slip key={n.id} note={n} ctx={ctx} autoFocus={n.id === fresh} />)}
        </div>
      ) : (
        <button type="button" onClick={add} className="w-full rounded-2xl border border-dashed border-white/15 py-14 text-sm text-white/50 hover:border-white/30 hover:text-white">
          Nenhuma anotação ainda. Clique para escrever a primeira.
        </button>
      )}
    </>
  )
}

/** Home widget: pinned slips, read-only; click opens the notes page. */
export function NotesWidget({ ctx, onOpen }: { ctx: Ctx; onOpen: (id?: string) => void }) {
  const pinned = ctx.state.notes.filter(n => n.pinned).slice(0, 4)
  return (
    <section>
      {pinned.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          {pinned.map(n => <Slip key={n.id} note={n} ctx={ctx} compact onOpen={() => onOpen(n.id)} />)}
        </div>
      ) : (
        <button type="button" onClick={() => onOpen()} className="w-full rounded-2xl border border-dashed border-white/15 py-6 text-sm text-white/45 hover:text-white">
          Fixe uma anotação para vê-la aqui.
        </button>
      )}
    </section>
  )
}

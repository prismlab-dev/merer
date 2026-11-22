import { useEffect, useState, type CSSProperties } from 'react'
import { Icon, btnGhost } from './ui'
import { supabase } from './auth'

const THEMES = {
  escuros: [
    { id: 'prisma', name: 'Prisma' },
    { id: 'abissal', name: 'Abissal' },
    { id: 'brasa', name: 'Brasa' },
    { id: 'musgo', name: 'Musgo' },
    { id: 'meia-noite', name: 'Meia-noite' },
  ],
  claros: [
    { id: 'nuvem', name: 'Nuvem' },
    { id: 'menta', name: 'Menta' },
    { id: 'pessego', name: 'Pêssego' },
    { id: 'lavanda', name: 'Lavanda' },
    { id: 'gelo', name: 'Gelo' },
  ],
}
const ART = [{ id: 'prisma', name: 'Prisma' }, { id: 'nebulosa', name: 'Nebulosa' }, { id: 'malha', name: 'Malha' }, { id: 'ondas', name: 'Ondas' }]
// Photos from Unsplash (free licence), served from public/bg with small copies in public/bg/thumb.
const PHOTOS = [
  { id: 'via-lactea', name: 'Via Láctea' }, { id: 'calmaria', name: 'Calmaria' }, { id: 'nuvens', name: 'Mar de nuvens' },
  { id: 'vale', name: 'Vale nevado' }, { id: 'lago', name: 'Lago' }, { id: 'mirante', name: 'Mirante' },
  { id: 'campos', name: 'Campos' }, { id: 'floresta', name: 'Floresta' }, { id: 'nevoa', name: 'Névoa' },
  { id: 'entardecer', name: 'Entardecer' }, { id: 'praia', name: 'Praia' },
]
const BACKGROUNDS = [...ART, ...PHOTOS]
const isPhoto = (id: string) => PHOTOS.some(p => p.id === id)
/** Attributes for a `.bd` element showing background `id`. */
export const bgProps = (id: string, thumb = false) => isPhoto(id)
  ? { 'data-photo': '', style: { '--img': `url(/bg/${thumb ? 'thumb/' : ''}${id}.jpg)` } as CSSProperties }
  : { 'data-bg': id }

export type Look = { theme: string; bg: string }
const KEY = 'prism:look'
const read = (): Look => {
  let l: Look = { theme: 'prisma', bg: 'prisma' }
  try { l = { ...l, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } } catch { /* private mode */ }
  return BACKGROUNDS.some(b => b.id === l.bg) ? l : { ...l, bg: 'prisma' } // a removed background falls back
}
const apply = (l: Look) => { document.documentElement.dataset.theme = l.theme }
apply(read()) // before first paint, so a light theme never flashes dark

export function useLook() {
  const [look, setLook] = useState(read)
  useEffect(() => { apply(look); try { localStorage.setItem(KEY, JSON.stringify(look)) } catch { /* private mode */ } }, [look])
  return [look, setLook] as const
}

const ring = (on: boolean) => on ? 'ring-2 ring-iris ring-offset-2 ring-offset-surface' : 'ring-1 ring-white/[0.08] hover:ring-white/25'

export function SettingsDialog({ email, look, onChange, onClose }: { email: string; look: Look; onChange: (l: Look) => void; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/60 px-3 py-[8vh] backdrop-blur-[2px]" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Configurações" className="rise w-full max-w-xl rounded-2xl border border-white/[0.08] bg-surface shadow-[0_24px_50px_-24px_rgba(0,0,0,0.9)]">
        <header className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Configurações</h2>
          <button type="button" autoFocus aria-label="Fechar" onClick={onClose} className="grid size-8 place-items-center rounded-full text-ink-2 hover:bg-white/[0.06] hover:text-white"><Icon name="x" /></button>
        </header>

        <div className="space-y-6 px-5 pt-4 pb-5">
          <section aria-label="Tema">
            <h3 className="mb-3 text-[15px] font-semibold text-white">Tema</h3>
            <div role="radiogroup" aria-label="Tema" className="grid grid-cols-5 gap-x-2.5 gap-y-3">
              {[...THEMES.escuros, ...THEMES.claros].map(t => {
                const on = look.theme === t.id
                return (
                  <button key={t.id} type="button" role="radio" aria-checked={on} onClick={() => onChange({ ...look, theme: t.id })} className="min-w-0 text-left">
                    {/* The swatch carries its own data-theme, so it paints with that theme's tokens. */}
                    <span data-theme={t.id} className={`press flex h-10 items-end overflow-hidden rounded-lg bg-canvas px-1.5 pt-1.5 transition-shadow ${ring(on)}`}>
                      <span className="flex h-full w-full items-center justify-between gap-1 rounded-t-md border border-b-0 border-white/[0.08] bg-surface px-1.5">
                        <span className="h-1 w-1/2 rounded-full bg-white/60" />
                        <span className="flex gap-0.5"><span className="size-1.5 rounded-full bg-iris" /><span className="size-1.5 rounded-full bg-lagoon" /><span className="size-1.5 rounded-full bg-coral" /></span>
                      </span>
                    </span>
                    <span className={`mt-2 block truncate text-xs ${on ? 'font-medium text-white' : 'text-white/55'}`}>{t.name}</span>
                  </button>
                )
              })}
            </div>
          </section>

          <section aria-label="Fundo" className="border-t border-white/[0.06] pt-5">
            <h3 className="mb-3 text-[15px] font-semibold text-white">Fundo</h3>
            <div role="radiogroup" aria-label="Fundo" className="grid grid-cols-3 gap-x-2.5 gap-y-3 sm:grid-cols-5">
              {BACKGROUNDS.map(b => {
                const on = look.bg === b.id
                return (
                  <button key={b.id} type="button" role="radio" aria-checked={on} onClick={() => onChange({ ...look, bg: b.id })} className="min-w-0 text-left">
                    <span {...bgProps(b.id, true)} className={`bd press relative block aspect-[16/10] rounded-lg transition-shadow ${ring(on)}`} />
                    <span className={`mt-2 block truncate text-xs ${on ? 'font-medium text-white' : 'text-white/55'}`}>{b.name}</span>
                  </button>
                )
              })}
            </div>
          </section>

          <section aria-label="Conta" className="flex items-center justify-between gap-3 border-t border-white/[0.06] pt-5">
            <span className="min-w-0 truncate text-sm text-white/60">{email}</span>
            <button type="button" className={btnGhost} onClick={() => supabase.auth.signOut()}>Sair</button>
          </section>
        </div>
      </div>
    </div>
  )
}

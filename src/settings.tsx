import { useEffect, useState, type CSSProperties } from 'react'
import { Icon } from './ui'

const THEMES = {
  escuros: [
    { id: 'prisma', name: 'Prisma', note: 'Grafite com íris' },
    { id: 'abissal', name: 'Abissal', note: 'Fundo do mar, verde-água' },
    { id: 'brasa', name: 'Brasa', note: 'Carvão quente, laranja' },
    { id: 'musgo', name: 'Musgo', note: 'Floresta à noite, lima' },
    { id: 'meia-noite', name: 'Meia-noite', note: 'Índigo com rosa' },
  ],
  claros: [
    { id: 'nuvem', name: 'Nuvem', note: 'Cinza frio, violeta' },
    { id: 'menta', name: 'Menta', note: 'Verde suave, esmeralda' },
    { id: 'pessego', name: 'Pêssego', note: 'Rosado, framboesa' },
    { id: 'lavanda', name: 'Lavanda', note: 'Lilás, roxo' },
    { id: 'gelo', name: 'Gelo', note: 'Azul glacial, cobalto' },
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

export function SettingsDialog({ look, onChange, onClose }: { look: Look; onChange: (l: Look) => void; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/60 px-3 py-[8vh] backdrop-blur-[2px]" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Aparência" className="rise w-full max-w-2xl rounded-2xl border border-white/[0.08] bg-surface shadow-[0_24px_50px_-24px_rgba(0,0,0,0.9)]">
        <header className="flex items-center justify-between px-5 pt-4">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Aparência</h2>
          <button type="button" autoFocus aria-label="Fechar" onClick={onClose} className="grid size-8 place-items-center rounded-full text-ink-2 hover:bg-white/[0.06] hover:text-white"><Icon name="x" /></button>
        </header>

        <div className="space-y-6 px-5 pt-3 pb-6">
          {Object.entries(THEMES).map(([group, list]) => (
            <section key={group} aria-label={`Temas ${group}`}>
              <h3 className="mb-2.5 text-sm text-white/60">Temas {group}</h3>
              <div role="radiogroup" className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {list.map(t => {
                  const on = look.theme === t.id
                  return (
                    <button key={t.id} type="button" role="radio" aria-checked={on} onClick={() => onChange({ ...look, theme: t.id })} className="group text-left">
                      {/* The swatch carries its own data-theme, so it paints with that theme's tokens. */}
                      <span data-theme={t.id} className={`press relative block h-[72px] overflow-hidden rounded-xl bg-canvas transition-shadow ${ring(on)}`}>
                        <span className="absolute inset-x-2 top-2 bottom-0 rounded-t-lg border border-b-0 border-white/[0.08] bg-surface p-2">
                          <span className="block h-1.5 w-3/5 rounded-full bg-white/70" />
                          <span className="mt-1.5 block h-1.5 w-2/5 rounded-full bg-white/25" />
                          <span className="absolute right-2 bottom-2 flex gap-1">
                            <span className="size-2.5 rounded-full bg-iris" /><span className="size-2.5 rounded-full bg-lagoon" /><span className="size-2.5 rounded-full bg-coral" />
                          </span>
                        </span>
                      </span>
                      <span className={`mt-1.5 block text-sm ${on ? 'font-medium text-white' : 'text-white/75'}`}>{t.name}</span>
                      <span className="block text-xs text-white/40">{t.note}</span>
                    </button>
                  )
                })}
              </div>
            </section>
          ))}

          <section aria-label="Fundo">
            <h3 className="text-sm text-white/60">Fundo</h3>
            <p className="mb-2.5 text-xs text-white/40">Os quatro primeiros usam as cores do tema; as fotos ganham um véu na cor do tema.</p>
            <div role="radiogroup" className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {BACKGROUNDS.map(b => {
                const on = look.bg === b.id
                return (
                  <button key={b.id} type="button" role="radio" aria-checked={on} onClick={() => onChange({ ...look, bg: b.id })} className="text-left">
                    <span {...bgProps(b.id, true)} className={`bd press relative block aspect-[16/10] rounded-xl transition-shadow ${ring(on)}`} />
                    <span className={`mt-1.5 block text-sm ${on ? 'font-medium text-white' : 'text-white/75'}`}>{b.name}</span>
                  </button>
                )
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

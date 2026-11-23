// Words for saved views: labels for every choice and the sentence that describes one.
import { type SavedView, type ViewDue, type ViewGroup, type ViewSort, type ViewStatus, viewGroup } from './lib'
import type { State } from './store'
import { PRIORITY, PROJECT_COLORS, colorFor } from './ui'

export const STATUS: Record<ViewStatus, string> = { open: 'abertas', moving: 'em andamento', blocked: 'bloqueadas', done: 'concluídas', all: 'abertas e concluídas' }
export const DUE: Record<ViewDue, string> = { any: 'em qualquer data', late: 'atrasadas', today: 'para hoje', week: 'para os próximos 7 dias', none: 'sem data' }
export const GROUP: Record<ViewGroup, string> = { none: 'sem agrupar', section: 'por seção', project: 'por projeto', person: 'por pessoa', tag: 'por etiqueta', priority: 'por prioridade', date: 'por data' }
export const SORT: Record<ViewSort, string> = { date: 'data', deadline: 'prazo final', priority: 'prioridade', title: 'nome' }

const join = (xs: string[], or = 'ou') => xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${or} ${xs[xs.length - 1]}`

// Something deleted (or out of reach) stays in the view, visibly, instead of silently widening it.
export function viewWords(v: SavedView, s: State) {
  const projects = v.projects.map(id => s.projects.find(p => p.id === id)?.name ?? 'projeto removido')
  const people = v.people.map(id => id ? s.people.find(p => p.id === id)?.name ?? id.split('@')[0] : 'ninguém')
  const priorities = [...v.priorities].sort().map(p => PRIORITY[p].label.toLowerCase())
  return {
    projects: join(projects), people: join(people), tags: join(v.tags, v.tagMode === 'all' ? 'e' : 'ou'), priorities: join(priorities),
    name: [...projects, ...people, ...v.tags].slice(0, 3).join(', ') || 'Nova visualização', // offered until the user types one
  }
}

export function describeView(v: SavedView, s: State) {
  const w = viewWords(v, s), g = viewGroup(v)
  return [
    `Tarefas ${STATUS[v.status]}`, v.due !== 'any' && DUE[v.due], w.projects && `de ${w.projects}`, w.people && `para ${w.people}`, w.tags && `com ${w.tags}`,
    w.priorities && `prioridade ${w.priorities}`, `${{ list: 'em lista', board: 'em colunas', table: 'em tabela' }[v.layout]}${g === 'none' ? '' : ' ' + GROUP[g]}`,
  ].filter(Boolean).join(', ')
}

export const viewColor = (v: SavedView, s: State) =>
  v.color ?? s.projects.find(p => p.id === v.projects[0])?.color ?? (v.tags[0] ? colorFor(v.tags[0]) : PROJECT_COLORS[1])

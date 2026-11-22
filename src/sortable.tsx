import { useState, type CSSProperties, type ReactNode } from 'react'
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, pointerWithin, type CollisionDetection, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// Drag starts after 5px so a plain click still opens the row; Space picks it up from the keyboard (Enter stays "open").
const KEYS = { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] }

export function Sortable({ ids, onMove, children }: { ids: string[]; onMove: (from: string, to: string) => void; children: ReactNode }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes: KEYS }),
  )
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => over && active.id !== over.id && onMove(String(active.id), String(over.id))}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>{children}</SortableContext>
    </DndContext>
  )
}

export function useRow(id: string) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style: CSSProperties = {
    // Vertical lists only: dropping x keeps a sideways drag from overflowing (and scrolling) the container.
    transform: CSS.Translate.toString(transform && { ...transform, x: 0 }), transition,
    ...(isDragging && { position: 'relative', zIndex: 10, cursor: 'grabbing' }),
  }
  // Drop dnd-kit's role/tabIndex so the row keeps its own.
  const { role: _r, tabIndex: _t, ...aria } = attributes
  return { ref: setNodeRef, style, handle: { ...aria, ...listeners }, dragging: isDragging }
}

// Innermost zone wins: a card dropped on another card targets that card, not the column around it.
const innermost: CollisionDetection = args => pointerWithin(args).sort((a, b) => area(a.data?.droppableContainer.rect.current) - area(b.data?.droppableContainer.rect.current))
const area = (r?: { width: number; height: number } | null) => r ? r.width * r.height : Infinity

/** Free drag between drop zones (e.g. days): onDrop(itemId, zoneId). */
export function Board({ onDrop, children }: { onDrop: (item: string, zone: string) => void; children: ReactNode }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { keyboardCodes: KEYS }),
  )
  return (
    <DndContext sensors={sensors} collisionDetection={innermost} onDragEnd={({ active, over }) => over && onDrop(String(active.id), String(over.id))}>
      {children}
    </DndContext>
  )
}

/** drop: the item is also a drop target (onDrop gets its id), for reordering within a zone. */
export function useDrag(id: string, drop = false) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id })
  const { setNodeRef: setDropRef } = useDroppable({ id, disabled: !drop })
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    ...(isDragging && { position: 'relative', zIndex: 10, cursor: 'grabbing' }),
  }
  const { role: _r, tabIndex: _t, ...aria } = attributes
  return { ref: (el: HTMLElement | null) => { setNodeRef(el); setDropRef(el) }, style, handle: { ...aria, ...listeners }, dragging: isDragging }
}

/** fill: the drop target grows to its parent's height (flex column) while the highlight stays around the content. */
export function Drop({ id, active, fill, children }: { id: string; active?: boolean; fill?: boolean; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  const on = active ?? isOver
  if (fill) return (
    // The whole lane lights up: accent wash that fades down the column, no box around it.
    <div ref={setNodeRef} className="relative -mx-2 flex-1 px-2">
      <span aria-hidden className={`pointer-events-none absolute inset-0 bg-linear-to-b from-iris/20 via-iris/[0.06] to-transparent transition-opacity duration-200 motion-reduce:transition-none ${on ? 'opacity-100' : 'opacity-0'}`} />
      <div className="relative">{children}</div>
    </div>
  )
  return <div ref={setNodeRef} className={`-mx-2 rounded-2xl px-2 transition-colors ${on ? 'bg-iris/[0.07] shadow-[inset_0_0_0_1px_rgb(from_var(--color-iris)_r_g_b/.35)]' : ''}`}>{children}</div>
}

/**
 * Columns of sortable cards with a live preview: while a card is held, the others make room and it hops into
 * whichever column it hovers. onDrop(id, col, ids) gets the card's final column and that column's order.
 * Ids starting with "sec:" are whole-column drags (useDrag); they land via onColDrop(id, overCol).
 */
export function Kanban({ cols, onDrop, onColDrop, overlay, children }: {
  cols: Record<string, string[]>
  onDrop: (id: string, col: string, ids: string[]) => void
  onColDrop: (id: string, col: string) => void
  overlay: (id: string) => ReactNode
  children: (cols: Record<string, string[]>, over: string | null) => ReactNode
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes: KEYS }),
  )
  const [live, setLive] = useState<Record<string, string[]> | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const view = live ?? cols
  const colOf = (id: string, c = view) => id in c ? id : Object.keys(c).find(k => c[k].includes(id)) ?? null
  const reset = () => { setLive(null); setActive(null); setOver(null) }
  return (
    <DndContext sensors={sensors} collisionDetection={innermost}
      onDragStart={({ active: a }) => { const id = String(a.id); setActive(id); if (!id.startsWith('sec:')) setLive(cols) }}
      onDragOver={({ active: a, over: o }) => {
        const id = String(a.id), to = o && colOf(String(o.id))
        setOver(to)
        if (!to || id.startsWith('sec:')) return
        const from = colOf(id)
        if (!from || from === to) return
        // Hop columns now so the card shows where it will land; it takes the hovered card's slot (or the end).
        const dest = view[to].filter(x => x !== id), at = dest.indexOf(String(o!.id))
        dest.splice(at < 0 ? dest.length : at, 0, id)
        setLive({ ...view, [from]: view[from].filter(x => x !== id), [to]: dest })
      }}
      onDragEnd={({ active: a, over: o }) => {
        const id = String(a.id), to = o && colOf(String(o.id))
        if (id.startsWith('sec:')) { if (to) onColDrop(id.slice(4), to) }
        else {
          const col = colOf(id)
          if (col) {
            const ids = [...view[col]], i = ids.indexOf(id), j = o ? ids.indexOf(String(o.id)) : -1
            if (j >= 0 && i !== j) ids.splice(j, 0, ...ids.splice(i, 1))
            onDrop(id, col, ids)
          }
        }
        reset()
      }}
      onDragCancel={reset}>
      {children(view, active && !active.startsWith('sec:') ? over : null)}
      <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }}>{active && !active.startsWith('sec:') ? overlay(active) : null}</DragOverlay>
    </DndContext>
  )
}

/** One Kanban column's cards (render them with useRow). */
export const KanbanCol = ({ id, ids, children }: { id: string; ids: string[]; children: ReactNode }) =>
  <SortableContext id={id} items={ids} strategy={verticalListSortingStrategy}>{children}</SortableContext>

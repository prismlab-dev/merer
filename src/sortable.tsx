import type { CSSProperties, ReactNode } from 'react'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, pointerWithin, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
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

/** Free drag between drop zones (e.g. days): onDrop(itemId, zoneId). */
export function Board({ onDrop, children }: { onDrop: (item: string, zone: string) => void; children: ReactNode }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { keyboardCodes: KEYS }),
  )
  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={({ active, over }) => over && onDrop(String(active.id), String(over.id))}>
      {children}
    </DndContext>
  )
}

export function useDrag(id: string) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id })
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    ...(isDragging && { position: 'relative', zIndex: 10, cursor: 'grabbing' }),
  }
  const { role: _r, tabIndex: _t, ...aria } = attributes
  return { ref: setNodeRef, style, handle: { ...aria, ...listeners }, dragging: isDragging }
}

export function Drop({ id, children }: { id: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return <div ref={setNodeRef} className={`-mx-2 rounded-2xl px-2 transition-colors ${isOver ? 'bg-iris/[0.07] shadow-[inset_0_0_0_1px_rgb(from_var(--color-iris)_r_g_b/.35)]' : ''}`}>{children}</div>
}

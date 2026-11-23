// Run: npx tsx src/store.check.ts (store imports extensionless modules, so plain node can't load it)
import assert from 'node:assert/strict'
import { blankTask, isDone, today } from './lib.ts'
import { rebase, reducer, type State } from './store.ts'

// Recurring parent with subtask-driven status: finishing the last subtask rolls it and reopens the subtasks.
const x = blankTask({ id: 'x', status: { kind: 'subtasks', done: 0, total: 0 }, when: { kind: 'date', date: today() },
  recurrence: { every: 1, unit: 'week', weekdays: [], anchor: 'schedule', until: null } })
let s: State = { tasks: [x], projects: [], people: [], automations: [], notes: [], toast: null }
for (const id of ['a', 'b']) s = reducer(s, { type: 'add', task: blankTask({ id, parentId: 'x' }) })
const get = (id: string) => s.tasks.find(t => t.id === id)!
assert.deepEqual(get('x').status, { kind: 'subtasks', done: 0, total: 2 })

s = reducer(s, { type: 'update', id: 'a', patch: { status: { kind: 'check', done: true } } })
assert.deepEqual(get('x').status, { kind: 'subtasks', done: 1, total: 2 })

s = reducer(s, { type: 'update', id: 'b', patch: { status: { kind: 'check', done: true } } })
assert.equal(get('x').completions, 1)
assert.deepEqual(get('x').status, { kind: 'subtasks', done: 0, total: 2 })
assert.ok(!isDone(get('a').status) && !isDone(get('b').status))
console.log('store ok')

// Team merge: a task created elsewhere survives this tab's pending edit, and local edits/deletes still apply.
{
  const a = blankTask({ id: 'a', title: 'A' }), b = blankTask({ id: 'b' })
  const base = { tasks: [a, b], projects: [], automations: [] }
  const local = { ...base, tasks: [{ ...a, title: 'A2' }] } // edited a, deleted b
  const remote = { ...base, tasks: [a, b, blankTask({ id: 'ext' })] } // the script added ext
  assert.deepEqual(rebase(base, local, remote).tasks.map(t => t.id + (t.title ?? '')), ['aA2', 'ext'])
}

// Team merge, field by field: two people editing different fields of one task both keep theirs.
{
  const a = blankTask({ id: 'a', title: 'A', priority: 4 })
  const base = { tasks: [a], projects: [], automations: [] }
  const m = rebase(base, { ...base, tasks: [{ ...a, title: 'A2' }] }, { ...base, tasks: [{ ...a, priority: 1 }] })
  assert.deepEqual([m.tasks[0].title, m.tasks[0].priority], ['A2', 1])
}
// A project deleted remotely takes along a task just added to it here.
{
  const p = { id: 'p', name: 'P', color: '#fff', sections: [] } as unknown as State['projects'][number]
  const base = { tasks: [], projects: [p], automations: [] }
  const m = rebase(base, { ...base, tasks: [blankTask({ id: 'n', projectId: 'p' })] }, { ...base, projects: [] })
  assert.deepEqual([m.projects.length, m.tasks.length], [0, 0])
}
// A local reorder survives a remote edit; a locally deleted tag color doesn't come back.
{
  const a = blankTask({ id: 'a' }), b = blankTask({ id: 'b' })
  const base = { tasks: [a, b], projects: [], automations: [], tagColors: { x: '#111', y: '#222' } }
  const m = rebase(base, { ...base, tasks: [b, a], tagColors: { y: '#222' } }, { ...base, tasks: [{ ...a, title: 'R' }, b] })
  assert.deepEqual(m.tasks.map(t => t.id + (t.title ?? '')), ['b', 'aR'])
  assert.deepEqual(m.tagColors, { y: '#222' })
}
// Status travels with its completion time; a new task moved to the top stays there.
{
  const a = blankTask({ id: 'a', status: { kind: 'progress', value: 0 } })
  const base = { tasks: [a], projects: [], automations: [] }
  const done = { ...a, status: { kind: 'progress' as const, value: 100 }, completedAt: 'x' }
  const m = rebase(base, { ...base, tasks: [{ ...a, status: { kind: 'progress', value: 50 } }] }, { ...base, tasks: [done] })
  assert.deepEqual([m.tasks[0].status, m.tasks[0].completedAt], [{ kind: 'progress', value: 50 }, null])
  const n = blankTask({ id: 'n' })
  assert.deepEqual(rebase(base, { ...base, tasks: [n, a] }, base).tasks.map(t => t.id), ['n', 'a'])
}
console.log('rebase ok')

// Run: npx tsx src/store.check.ts (store imports extensionless modules, so plain node can't load it)
import assert from 'node:assert/strict'
import { blankTask, isDone, today } from './lib.ts'
import { reducer, type State } from './store.ts'

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

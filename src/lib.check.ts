// Run: node src/lib.check.ts
import assert from 'node:assert/strict'
import { moveWhen, nextDate, occurrences, parseQuick, stepStatus, isDone, blankTask, blankView, blockers, dateBucket, onDay, projections, tableDays, viewGroup, viewTasks, type Recurrence } from './lib.ts'

const r = (p: Partial<Recurrence>): Recurrence => ({ every: 1, unit: 'day', weekdays: [], anchor: 'schedule', until: null, ...p })
assert.equal(nextDate(r({ unit: 'month' }), '2026-01-31'), '2026-02-28') // clamps month end
assert.equal(nextDate(r({ unit: 'week', weekdays: [1, 4] }), '2026-11-19'), '2026-11-23') // thu → mon
assert.equal(nextDate(r({ every: 3 }), '2026-12-30'), '2027-01-02')
assert.deepEqual(moveWhen({ kind: 'window', start: '2026-11-01', end: '2026-11-05' }, '2026-11-10'), { kind: 'window', start: '2026-11-10', end: '2026-11-14' })
assert.equal(occurrences({ kind: 'date', date: '2026-11-01' }, r({ until: '2026-11-03' }), 10).length, 3)

const p = parseQuick('Revisar contrato amanhã 14h p1 #Casa @contas +ana 1,5h', '2026-11-19')
assert.deepEqual(p, { title: 'Revisar contrato', date: '2026-11-20', time: '14:00', priority: 1, project: 'Casa', tags: ['contas'], people: ['ana'], durationMin: 90 })

let s = stepStatus({ kind: 'stages', stages: ['a', 'b', 'c'], current: 0 })
s = stepStatus(s); assert.ok(isDone(s))
assert.equal((stepStatus({ kind: 'progress', value: 40 }) as { value: number }).value, 50)

// recurring dependency: blocks until it rolls past the dependent's date
const x = blankTask({ id: 'x', recurrence: r({ unit: 'month' }), when: { kind: 'date', date: '2026-11-19' } })
const y = blankTask({ id: 'y', dependsOn: ['x'], when: { kind: 'date', date: '2026-11-20' } })
assert.equal(blockers(y, [x, y]).length, 1)
assert.equal(blockers(y, [{ ...x, when: { kind: 'date', date: '2026-12-19' } }, y]).length, 0)

// saved views: every filter narrows, tags obey their mode, a subtask hides behind a listed parent
const mk = (id: string, p: object = {}) => blankTask({ id, title: id, projectId: 'x', ...p })
const vt = [
  mk('a', { assignees: ['ana'], tags: ['dev', 'ui'], priority: 1, when: { kind: 'date', date: '2026-11-19' } }),
  mk('b', { assignees: ['ana'], tags: ['dev'], projectId: 'y', deadline: '2026-11-22' }),
  mk('c', { status: { kind: 'check', done: true } }),
  mk('a1', { parentId: 'a', assignees: ['ana'] }), mk('a2', { parentId: 'a', assignees: ['bia'] }),
]
const ids = (v: Parameters<typeof blankView>[0]) => viewTasks(blankView({ sort: 'title', ...v }), vt, '2026-11-20').map(t => t.id)
assert.deepEqual(ids({ projects: ['x'], people: ['ana'], tags: ['dev', 'ui'] }), ['a'])
assert.deepEqual(ids({ tags: ['dev', 'ui'], tagMode: 'any' }), ['a', 'b'])
assert.deepEqual(ids({ people: ['bia'] }), ['a2']) // parent isn't hers: the subtask stands alone
assert.deepEqual(ids({}), ['a', 'a1', 'a2', 'b']) // a's status isn't its subtasks: the list doesn't nest them, so they stand alone
assert.deepEqual(ids({ group: 'project' }), ['a', 'b']) // grouped by project, every parent nests its subtasks
assert.deepEqual(ids({ group: 'person', layout: 'board' }), ['a', 'a1', 'a2', 'b']) // by person, a subtask goes to its own person's group
assert.deepEqual(ids({ status: 'done' }), ['c'])
assert.deepEqual(ids({ due: 'late' }), ['a'])
assert.deepEqual(ids({ due: 'week' }), ['b'])
assert.equal(dateBucket(vt[0], '2026-11-20'), 'late')
assert.equal(viewGroup(blankView({ layout: 'board', projects: ['x'] })), 'section')
assert.equal(viewGroup(blankView({ group: 'section' })), 'project')
console.log('lib ok')
assert.equal(viewGroup(blankView({ layout: 'table', group: 'date' })), 'project')
const wt = blankTask({ when: { kind: 'window', start: '2026-11-23', end: '2026-11-25' } })
assert.ok(onDay(wt, '2026-11-24') && !onDay(wt, '2026-11-26') && onDay({ ...wt, deadline: '2026-11-26' }, '2026-11-26'))
assert.deepEqual(tableDays([2, 3, 4, 5], '2026-11-25'), ['2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27']) // wed: this week's tue–fri
assert.deepEqual(tableDays([2, 3], '2026-11-28'), ['2026-12-01', '2026-12-02']) // sat: next week
const rep = blankTask({ id: 'r', when: { kind: 'date', date: '2026-11-24' }, recurrence: r({ unit: 'week', weekdays: [2, 4] }) })
assert.deepEqual(projections([rep]).map(t => t.when!.kind === 'date' && t.when!.date), ['2026-11-26', '2026-12-01', '2026-12-03']) // tue → thu, tue, thu

// A projected repeat moves its deadline along with its date.
{
  const { projections, blankTask: bt } = await import('./lib.ts')
  const t = bt({ id: 'r', when: { kind: 'date', date: '2026-11-24' }, deadline: '2026-11-25',
    recurrence: { every: 1, unit: 'week', weekdays: [], anchor: 'schedule', until: null } })
  assert.equal(projections([t], 1)[0].deadline, '2026-12-02')
  console.log('projections ok')
}

// Three levels grouped by project: the grandchild stands alone instead of vanishing.
{
  const g = [blankTask({ id: 'p', title: 'p', projectId: 'x' }), blankTask({ id: 'c', title: 'c', projectId: 'x', parentId: 'p' }), blankTask({ id: 'gc', title: 'gc', projectId: 'x', parentId: 'c' })]
  assert.deepEqual(viewTasks(blankView({ group: 'project', sort: 'title' }), g).map(t => t.id), ['gc', 'p'])
  console.log('grandchild ok')
}

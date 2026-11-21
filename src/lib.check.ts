// Run: node src/lib.check.ts
import assert from 'node:assert/strict'
import { moveWhen, nextDate, occurrences, parseQuick, stepStatus, isDone, blankTask, blockers, type Recurrence } from './lib.ts'

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
console.log('lib ok')

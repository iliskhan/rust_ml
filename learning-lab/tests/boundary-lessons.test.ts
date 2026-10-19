import assert from 'node:assert/strict';
import test from 'node:test';
import { BoundaryLessonStore, boundaryLessonStorageKey, createLessonRecord, currentLessonAttempt, decodeLessonRecord, newThresholdAttempt, type BoundaryLessonLock } from '../src/boundaryLessonStorage.ts';
import { checkThresholdLesson, createLessonAttempt, hiddenComparisonMismatches, hiddenLessonMismatches, lessonEvidence, thresholdLessonQuestion, thresholdObservationMismatches, type LessonObservation } from '../src/boundaryLessonMath.ts';
import { initialBoundarySettings } from '../src/boundaryExperiment.ts';

function memory() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}
const locks = new Map<string, Promise<unknown>>();
const testLock: BoundaryLessonLock = <T>(name: string, action: () => T): Promise<T> => {
  const next = (locks.get(name) ?? Promise.resolve()).then(action);
  locks.set(name, next.catch(() => undefined));
  return next;
};
class TestStore extends BoundaryLessonStore {
  constructor(storage: Pick<Storage, 'getItem' | 'setItem'>, scope: string) { super(storage, scope, testLock); }
}
test('no-code roundtrip preserves identity, draft, prediction, answer exposure, help and scope separately from workspace', async () => {
  const storage = memory(), store = new TestStore(storage, 'guest');
  const record = createLessonRecord('guest');
  record.mode = 'threshold';
  Object.assign(record.attempts[1], { prediction: 'До действия', explanation: 'Мой текст', predictionBeforeAction: true, answers: ['0'], exposed: true, help: true });
  assert.equal(await store.save(record), true);
  const restored = new TestStore(storage, 'guest');
  assert.deepEqual(restored.record, { ...record, revision: 1 });
  assert.equal(currentLessonAttempt(restored.record, 'threshold').instanceId, 'boundary-threshold-v1-0');
  assert.notEqual(boundaryLessonStorageKey('guest'), 'rustml-boundary-v1');
  assert.equal(new TestStore(storage, 'account:17').record.attempts[1].exposed, false);
  assert.throws(() => decodeLessonRecord(storage.values.get(store.key)!, 'account:17'), /scope/);
  const wrongVersion = JSON.parse(storage.values.get(store.key)!); wrongVersion.version = 2;
  assert.throws(() => decodeLessonRecord(JSON.stringify(wrongVersion), 'guest'), /версию/);
  const foreign = new TestStore(memory(), 'guest');
  assert.equal(await foreign.save(createLessonRecord('account:17')), false);
  assert.match(foreign.error!, /Scope/);
});
test('changing forms and reload never silently creates a new unseen instance', async () => {
  const storage = memory(), store = new TestStore(storage, 'guest');
  let record = createLessonRecord('guest');
  record.attempts[1].exposed = true; record.attempts[1].help = true;
  record = { ...record, mode: 'hidden' }; await store.save(record);
  const returned = { ...store.record, mode: 'threshold' as const }; await store.save(returned);
  const restored = new TestStore(storage, 'guest');
  assert.equal(restored.record.attempts.length, 2);
  assert.equal(currentLessonAttempt(restored.record, 'threshold').exposed, true);
  assert.equal(currentLessonAttempt(restored.record, 'threshold').help, true);
});
test('new numerical case has a distinct list and identity; historical exposure survives repeated New', async () => {
  let record = createLessonRecord('guest'); record.attempts[1].exposed = true;
  const old = structuredClone(record.attempts[1]);
  const lists = new Set<string>();
  for (let i = 0; i < 10000; i++) lists.add(JSON.stringify(thresholdLessonQuestion(i).probabilities));
  assert.equal(lists.size, 10000);
  record = newThresholdAttempt(record); record = newThresholdAttempt(record);
  assert.deepEqual(record.attempts[1], old);
  assert.equal(currentLessonAttempt(record, 'threshold').instanceId, 'boundary-threshold-v1-2');
  assert.equal(currentLessonAttempt(record, 'threshold').exposed, false);
  assert.notDeepEqual(thresholdLessonQuestion(0).probabilities, thresholdLessonQuestion(1).probabilities);
  assert.throws(() => createLessonAttempt('threshold', 10000), /закончились/);
  const broken = createLessonRecord('guest'); broken.attempts.push(createLessonAttempt('threshold', 2));
  assert.throws(() => decodeLessonRecord(JSON.stringify(broken), 'guest'), /история/);
});
test('damaged, denied and quota-limited storage remain intact and never claim independent evidence', async () => {
  for (const raw of ['{oops', JSON.stringify({ ...createLessonRecord('guest'), version: 999 }), JSON.stringify({ ...createLessonRecord('guest'), attempts: [] })]) {
    const storage = memory(); storage.setItem(boundaryLessonStorageKey('guest'), raw);
    const store = new TestStore(storage, 'guest');
    assert.equal(store.verified, false); assert.ok(store.error);
    store.record.attempts[1].checked = true;
    assert.equal(await store.save(store.record), false);
    assert.equal(storage.getItem(store.key), raw);
    assert.match(lessonEvidence(store.record.attempts[1], store.verified), /не установлена/);
  }
  const denied = new TestStore({ getItem() { throw new Error('denied'); }, setItem() { assert.fail('must not write'); } }, 'guest');
  assert.equal(denied.verified, false);
  const quota = new TestStore({ getItem() { return null; }, setItem() { throw new Error('quota exceeded'); } }, 'guest');
  quota.record.attempts[1].explanation = 'Не терять';
  assert.equal(await quota.save(quota.record), false);
  assert.equal(quota.record.attempts[1].explanation, 'Не терять');
  assert.match(quota.error!, /quota/);
});
test('stale writers and external deletion cannot overwrite or renew the stored history', async () => {
  const storage = memory(), a = new TestStore(storage, 'guest'), b = new TestStore(storage, 'guest');
  a.record.attempts[1].exposed = true; assert.equal(await a.save(a.record), true);
  const expected = storage.getItem(a.key);
  assert.equal(await b.save(b.record), false); assert.match(b.error!, /другой вкладке/);
  assert.equal(storage.getItem(a.key), expected);
  a.observeExternalChange(null); assert.equal(a.verified, false);
  assert.equal(await a.save(a.record), false);
});
test('simultaneous tabs serialize under a shared lock; unsupported locking never writes', async () => {
  const storage = memory(), a = new TestStore(storage, 'guest'), b = new TestStore(storage, 'guest');
  a.record.attempts[1].exposed = true;
  b.record.attempts[1].help = true;
  const results = await Promise.all([a.save(a.record), b.save(b.record)]);
  assert.deepEqual(results, [true, false]);
  assert.equal(new TestStore(storage, 'guest').record.attempts[1].exposed, true);
  assert.equal(b.verified, false);
  const unsupported = new BoundaryLessonStore(storage, 'other', async () => { throw new Error('Web Locks unavailable'); });
  assert.equal(await unsupported.save(unsupported.record), false);
  assert.equal(storage.getItem(unsupported.key), null);
  assert.equal(unsupported.verified, false);
});
test('queued drafts keep the latest answer with monotonic revisions', async () => {
  const storage = memory(), store = new TestStore(storage, 'guest');
  const first = createLessonRecord('guest'); first.attempts[1].prediction = 'п';
  const last = structuredClone(first); last.attempts[1].prediction = 'прогноз'; last.attempts[1].help = true;
  assert.deepEqual(await Promise.all([store.save(first), store.save(last)]), [true, true]);
  const restored = new TestStore(storage, 'guest');
  assert.equal(restored.record.revision, 2);
  assert.equal(restored.record.attempts[1].prediction, 'прогноз');
  assert.equal(restored.record.attempts[1].help, true);
});
test('pending or failed disclosure never enters confirmed visibility; queued drafts preserve committed exposure', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const storage = memory();
  const delayed: BoundaryLessonLock = async (_name, action) => { await gate; return action(); };
  const store = new BoundaryLessonStore(storage, 'guest', delayed);
  const disclosure = createLessonRecord('guest'); disclosure.attempts[1].exposed = true; disclosure.attempts[1].help = true;
  const pending = store.save(disclosure);
  assert.equal(store.confirmed.attempts[1].exposed, false);
  assert.equal(store.confirmed.attempts[1].help, false);
  assert.equal(new TestStore(storage, 'guest').record.attempts[1].exposed, false);
  const draft = createLessonRecord('guest'); draft.attempts[1].explanation = 'Ввожу, пока ожидается lock';
  const queued = store.save(draft);
  release();
  assert.equal(await pending, true); assert.equal(await queued, true);
  assert.equal(store.confirmed.attempts[1].exposed, true);
  assert.equal(store.confirmed.attempts[1].help, true);
  assert.equal(new TestStore(storage, 'guest').record.attempts[1].exposed, true);
  assert.equal(new TestStore(storage, 'guest').record.attempts[1].explanation, draft.attempts[1].explanation);
  const failed = new TestStore({ getItem: () => null, setItem() { throw new Error('quota'); } }, 'guest');
  assert.equal(await failed.save(disclosure), false);
  assert.equal(failed.confirmed.attempts[1].exposed, false);
  assert.equal(failed.confirmed.attempts[1].help, false);
});
test('objective answers include threshold equality; exposure and help never become mastery', async () => {
  for (let i = 0; i < 200; i++) {
    const q = thresholdLessonQuestion(i);
    const answers = [...q.answers, 'same', 'training'];
    assert.equal(checkThresholdLesson(i, answers), true);
    answers[0] = '1'; assert.equal(checkThresholdLesson(i, answers), false);
    assert.deepEqual(q.answers, q.thresholds.flatMap(t => q.probabilities.map(p => p >= t ? '1' : '0')));
  }
  const attempt = createLessonAttempt('threshold'); attempt.checked = true;
  assert.match(lessonEvidence(attempt, true), /не подтверждены/);
  attempt.exposed = true; assert.match(lessonEvidence(attempt, true), /образцом/);
  attempt.exposed = false; attempt.help = true; assert.match(lessonEvidence(attempt, true), /помощь/);
});
test('hidden-layer comparison rejects unequal seeds, budget and noncanonical controls', async () => {
  const settings = { ...initialBoundarySettings, kind: 'circles' as const, config: { layers: [] } };
  assert.deepEqual(hiddenLessonMismatches(settings), []);
  assert.ok(hiddenLessonMismatches({ ...settings, lambda: .2 }).length);
  const a: LessonObservation = { name: 'A', step: 700, settings, threshold: .5, probe: [.2, .5], probability: .5, params: [1, 2, 3], trainLoss: .69, validationLoss: .7 };
  const b: LessonObservation = { ...structuredClone(a), name: 'B', settings: { ...settings, config: { layers: [{ width: 8, activation: 'tanh' }] } } };
  assert.deepEqual(hiddenComparisonMismatches(a, b), []);
  assert.match(hiddenComparisonMismatches(a, { ...b, step: 699 }).join(), /700/);
  assert.match(hiddenComparisonMismatches(a, { ...b, settings: { ...b.settings, seed: 77 } }).join(), /seed данных/);
  assert.deepEqual(thresholdObservationMismatches(a, { ...a, threshold: .7 }, 'threshold'), []);
  assert.match(thresholdObservationMismatches(a, { ...a, threshold: .7, step: 701 }, 'threshold').join(), /шаг обучения/);
  assert.deepEqual(thresholdObservationMismatches(a, { ...a, probe: [.3, .5] }, 'input'), []);
  assert.deepEqual(thresholdObservationMismatches(a, { ...a, step: 701 }, 'training'), []); // a zero gradient can leave every parameter unchanged
  assert.match(thresholdObservationMismatches(a, { ...a, step: 702 }, 'training').join(), /ровно один/);
});

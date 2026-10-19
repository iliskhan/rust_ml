import { createLessonAttempt, type BoundaryLessonAttempt, type BoundaryLessonForm, type BoundaryLessonMode, type LessonObservation } from './boundaryLessonMath.ts';

export type BoundaryLessonRecord = {
  format: 'rustml-boundary-lessons'; version: 1; scope: string; revision: number;
  mode: BoundaryLessonMode; attempts: BoundaryLessonAttempt[];
};
type StorageAccess = Pick<Storage, 'getItem' | 'setItem'>;
export type BoundaryLessonLock = <T>(name: string, action: () => T) => Promise<T>;
async function browserLock<T>(name: string, action: () => T): Promise<T> {
  if (typeof navigator === 'undefined' || !navigator.locks) throw new Error('Безопасное сохранение между вкладками недоступно в этом браузере. Черновик остаётся в памяти.');
  return navigator.locks.request(name, action);
}
export const boundaryLessonStorageKey = (scope: string) => `rustml-boundary-lessons-v1:${encodeURIComponent(scope)}`;
export function createLessonRecord(scope: string): BoundaryLessonRecord {
  return { format: 'rustml-boundary-lessons', version: 1, scope, revision: 0, mode: 'free', attempts: [createLessonAttempt('hidden'), createLessonAttempt('threshold')] };
}
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function text(value: unknown) { return typeof value === 'string' && value.length <= 20000; }
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function seed(value: unknown) { return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 4294967295; }
function observation(value: unknown): value is LessonObservation {
  if (!object(value) || !text(value.name) || !Number.isInteger(value.step) || (value.step as number) < 0 || !finite(value.threshold) || value.threshold < 0 || value.threshold > 1 || !finite(value.probability) || value.probability < 0 || value.probability > 1) return false;
  if (!Array.isArray(value.params) || value.params.length > 10000 || !value.params.every(finite) || !Array.isArray(value.probe) || value.probe.length !== 2 || !value.probe.every(v => finite(v) && v >= 0 && v <= 1)) return false;
  if (!['trainLoss', 'validationLoss'].every(key => value[key] === null || (finite(value[key]) && (value[key] as number) >= 0))) return false;
  const s = value.settings;
  if (!object(s) || !['circles', 'moons', 'spiral'].includes(String(s.kind)) || !seed(s.seed) || !object(s.config) || !Array.isArray(s.config.layers) || s.config.layers.length > 3 || !s.config.layers.every(layer => object(layer) && Number.isInteger(layer.width) && (layer.width as number) >= 1 && (layer.width as number) <= 16 && ['tanh', 'relu', 'sigmoid'].includes(String(layer.activation))) || !['sgd', 'momentum', 'adam'].includes(String(s.method)) || !finite(s.lr) || s.lr < .001 || s.lr > .2) return false;
  if (s.config.features !== undefined && !['raw', 'radial'].includes(String(s.config.features))) return false;
  if (s.initSeed !== undefined && !seed(s.initSeed) || s.batchSeed !== undefined && !seed(s.batchSeed)) return false;
  if (s.batchSize !== undefined && (!Number.isInteger(s.batchSize) || (s.batchSize as number) < 1 || (s.batchSize as number) > 96)) return false;
  if (s.lambda !== undefined && (!finite(s.lambda) || s.lambda < 0 || s.lambda > 1)) return false;
  if (s.data !== undefined && (!object(s.data) || s.data.version !== 2 || ![24, 48, 96].includes(s.data.trainSize as number) || !finite(s.data.labelNoise) || s.data.labelNoise < 0 || s.data.labelNoise > .2)) return false;
  return true;
}
export function decodeLessonRecord(raw: string, scope: string): BoundaryLessonRecord {
  if (raw.length > 4 * 1024 * 1024) throw new Error('Учебная запись превышает 4 МБ. Прежняя запись сохранена без изменений.');
  const value: unknown = JSON.parse(raw);
  if (!object(value) || value.format !== 'rustml-boundary-lessons' || value.version !== 1 || value.scope !== scope || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 || !['free', 'hidden', 'threshold'].includes(String(value.mode)) || !Array.isArray(value.attempts) || value.attempts.length < 2 || value.attempts.length > 10001) throw new Error('Учебная запись повреждена, имеет другую версию или scope. Прежняя запись сохранена без изменений.');
  const ids = new Set<string>();
  const counts = { hidden: 0, threshold: 0 };
  for (const a of value.attempts) {
    if (!object(a) || !['hidden', 'threshold'].includes(String(a.form)) || a.version !== 1 || !Number.isInteger(a.index) || (a.index as number) < 0 || (a.index as number) > 9999 || a.instanceId !== `boundary-${a.form}-v1-${a.index}` || ids.has(a.instanceId as string) || !text(a.prediction) || !text(a.explanation) || !Array.isArray(a.answers) || a.answers.length > 8 || !a.answers.every(text) || !['predictionBeforeAction', 'exposed', 'help'].every(k => typeof a[k] === 'boolean') || ![null, true, false].includes(a.checked as null | boolean) || !Array.isArray(a.observations) || a.observations.length > 5 || !a.observations.every(observation)) throw new Error('Учебная запись повреждена. Прежняя запись сохранена без изменений.');
    ids.add(a.instanceId as string);
    const form = a.form as BoundaryLessonForm;
    if (a.index !== counts[form]++ || (form === 'hidden' && a.index !== 0)) throw new Error('Нарушена история учебных экземпляров. Прежняя запись сохранена без изменений.');
  }
  if (!value.attempts.some(a => a.form === 'hidden' && a.index === 0) || !value.attempts.some(a => a.form === 'threshold' && a.index === 0)) throw new Error('В учебной записи отсутствует исходный экземпляр.');
  return value as BoundaryLessonRecord;
}

export function currentLessonAttempt(record: BoundaryLessonRecord, form: BoundaryLessonForm) {
  return record.attempts.filter(a => a.form === form).at(-1)!;
}
export function newThresholdAttempt(record: BoundaryLessonRecord): BoundaryLessonRecord {
  return { ...record, attempts: [...record.attempts, createLessonAttempt('threshold', currentLessonAttempt(record, 'threshold').index + 1)] };
}

/** Once persisted, exposure/help cannot be undone by a draft queued before disclosure finished. */
export function retainLessonDisclosure(record: BoundaryLessonRecord, confirmed: BoundaryLessonRecord): BoundaryLessonRecord {
  const previous = new Map(confirmed.attempts.map(attempt => [attempt.instanceId, attempt]));
  return { ...record, attempts: record.attempts.map(attempt => ({ ...attempt,
    exposed: attempt.exposed || !!previous.get(attempt.instanceId)?.exposed,
    help: attempt.help || !!previous.get(attempt.instanceId)?.help,
  })) };
}

/** Serialize compare/write under one cross-tab Web Lock; stale or damaged history is never replaced. */
export class BoundaryLessonStore {
  readonly key: string;
  record: BoundaryLessonRecord;
  confirmed: BoundaryLessonRecord;
  error: string | null = null;
  verified = true;
  private raw: string | null = null;
  private storage: StorageAccess;
  private scope: string;
  private lock: BoundaryLessonLock;
  private queue: Promise<unknown> = Promise.resolve();
  private revision = 0;
  constructor(storage: StorageAccess, scope: string, lock: BoundaryLessonLock = browserLock) {
    this.storage = storage;
    this.scope = scope;
    this.lock = lock;
    this.key = boundaryLessonStorageKey(scope);
    this.record = createLessonRecord(scope);
    this.confirmed = structuredClone(this.record);
    try {
      this.raw = storage.getItem(this.key);
      if (this.raw !== null) this.record = decodeLessonRecord(this.raw, scope);
      this.confirmed = structuredClone(this.record);
      this.revision = this.record.revision;
      if (lock === browserLock && (typeof navigator === 'undefined' || !navigator.locks)) throw new Error('Безопасное сохранение между вкладками недоступно в этом браузере. Черновик остаётся в памяти.');
    } catch (error) { this.fail(error); }
  }
  private fail(error: unknown) {
    this.verified = false;
    this.error = error instanceof Error ? error.message : 'Хранилище учебного опыта недоступно.';
  }
  save(record: BoundaryLessonRecord): Promise<boolean> {
    this.record = record;
    const snapshot = structuredClone(record);
    const operation = this.queue.then(() => {
      if (!this.verified) return false;
      return this.lock(this.key, () => {
      if (!this.verified) return false;
      if (record.scope !== this.scope) throw new Error('Scope учебной записи изменился. Запись в другой профиль запрещена.');
      if (this.storage.getItem(this.key) !== this.raw) throw new Error('Учебная запись изменена в другой вкладке. Запись остановлена; черновик остаётся в памяти. Перезагрузите страницу для чтения сохранённой версии.');
      const next = { ...retainLessonDisclosure(snapshot, this.raw === null ? createLessonRecord(this.scope) : decodeLessonRecord(this.raw, this.scope)), revision: this.revision + 1 };
      const raw = JSON.stringify(next);
      decodeLessonRecord(raw, record.scope);
      this.storage.setItem(this.key, raw);
      this.raw = raw;
      this.confirmed = structuredClone(next);
      this.revision = next.revision;
      this.record = this.record === record ? next : retainLessonDisclosure(this.record, next);
      return true;
      });
    }).catch(error => { this.fail(error); return false; });
    this.queue = operation;
    return operation;
  }
  observeExternalChange(raw: string | null) {
    if (raw !== this.raw) this.fail(new Error('Учебная запись изменена или удалена в другой вкладке. Черновик остаётся в памяти; автосохранение остановлено.'));
  }
}

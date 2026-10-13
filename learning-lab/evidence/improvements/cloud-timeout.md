# Общий deadline облачных запросов — 2026-10-13

Задача: ограничить ожидание Auth refresh → fetch → JSON в createPracticeCloud,
сохранить caller AbortSignal, CAS/idempotency и сессию при timeout/network error.
Авторитетный общий план остаётся у родительского чата; PLAN.md/PROGRESS.md не изменены.

Checkout: `C:/Users/lomaster/.codex/worktrees/8e9e/rust_ml`, ветка
`codex/cloud-request-deadline`, база `1e3ba80b9056489ec2aceacfdfaef383b52d8936`.
Перед началом рабочая копия была чистой и detached; собственная ветка создана.
Окружение проверки: Windows, Node 24.19.0, pnpm 11.25.0, TypeScript 5.9.3.

## Изменения и доказательства

- Один deadline 30 секунд на весь request, включая ожидание shared refresh и JSON.
  Promise.race завершает ожидание даже при fetch/body, игнорирующих AbortSignal.
  Внутренний сигнал отменяет транспорт; caller abort передаётся ему. Сигнал
  повторно проверяется в continuation после await до записи сессии и следующего fetch.
- Timeout имеет безопасный код `request_timeout`, отмена — `request_aborted`;
  статус 0. Сообщение timeout прямо сообщает неизвестный результат и предлагает
  проверить облачное состояние перед повтором. Нет автоматических повторов POST.
- Shared refresh возвращает только данные. Отменённый участник не пишет токены;
  живые участники принимают одну ротацию. Запрос удерживается до завершения всех
  участников и самого refresh, затем освобождается; поздний результат без живых
  участников не меняет storage. Таймеры и caller listeners удаляются в finally.
- Родительский readonly review выявил две промежуточные гонки: освобождение
  refresh до persistence и отмена между helper await и continuation вызывающего
  кода. Исправлены; тесты перебирают 0–24 и 0–40 microtask-переходов соответственно.
- Новый `practice-cloud-timeout.test.ts`: 20 тестов с node:test mock timers и
  promise barriers, без коротких real-time sleeps. Покрыты зависшие fetch/body,
  already/mid/synchronous abort, общий refresh, поздние Auth успех/401, сохранение
  сессии, явное восстановление после ошибки, CAS POST и grader idempotency key.
- В существующем cloud-тесте внутри `practice-grading.test.ts` обновлена только
  проверка caller cancellation: прежняя identity-проверка исходного объекта
  заменена проверкой сигналов и реальной отмены catalog/session/help/draft.
  Grading runtime, pins, fixtures и backend не менялись.

## Выполненные проверки

Команды запускались из `C:/Users/lomaster/.codex/worktrees/8e9e/rust_ml/learning-lab`.
`node` ниже — полный путь
`C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`.

```powershell
& $node --test tests/practice-cloud*.test.ts
# PASS: 33/33, fail/cancelled/skipped 0
& $node --test tests/practice-cloud*.test.ts tests/practice-grading.test.ts tests/practice-progress-sync.test.ts
# PASS: 55/55, fail/cancelled/skipped 0
& $node node_modules/typescript/bin/tsc --noEmit
# PASS: exit 0, после финальных правок cloud и тестов
```

`git -c safe.directory=C:/Users/lomaster/.codex/worktrees/8e9e/rust_ml diff --check`
также PASS. Зависимости установлены существующим `pnpm install --frozen-lockfile`:
первый sandbox запуск получил npm EACCES и был остановлен; разрешённый запуск
вне sandbox завершился exit 0. Manifest/lockfile не изменены.

SHA256 окончательного cloud.ts:
`2AAFD3EAFE75A028E584C7BF7FCB4891EF39FCC00A94E69E0E97BE6468C15A18`.
SHA256 нового timeout-теста:
`6C621C94662EAE632502D9EEC9A11B44FD523AB107E18BABB5D87FD862C38705`.

## Границы и передача

Срок относится к каждому request, а не ко всему многостраничному catalog или
пользовательскому сценарию из нескольких requests. Shared refresh сохраняет
собственный deadline и может продолжаться после отмены отдельного участника;
он не пишет storage самостоятельно. Timeout/abort не доказывает отмену серверной
мутации: клиент не повторяет её автоматически; revision/key сохранены.

UI и hosted/backend в этой задаче не проверялись и не менялись. Следующий шаг
родителя: проверить diff/review, объединить собственную ветку, выполнить общий
frontend suite/build и UI desktop/mobile. Grader остаётся disabled; pending
approval не обходился. SHA commit/push и совпадение remote будут в итоговом ответе.

# Учебный прогресс

`PracticeProgress` — отдельный компонент. В `PracticeWorkspace` он открывается
кнопкой «Показать мой прогресс» через lazy `PracticeLearningProgress`.
Родитель использует проверенный owner из `usePracticeAccount`, читает метаданные
через `cloud.progressCatalog(practiceRelease)` и передаёт конкретное упражнение
и язык в `PracticeSection`. После перехода фокус получает редактор.

```tsx
<PracticeProgress
  ownerId={account.user?.id}
  cloud={account.cloud}
  accountCatalog={serverCatalog}
  onOpenExercise={({ topicId, scope }) => openPractice(topicId, scope.exerciseId, scope.language)}
/>
```

`store` необязателен (по умолчанию `browserPracticeStore()`), `topics` и `releaseId`
по умолчанию берутся из текущего `all-catalog`. Родитель обязан передать текущий
`ownerId` сразу при смене/выходе аккаунта. Компонент сам читает локальное хранилище
и вызывает только существующий авторизованный `cloud.progress()`.

`accountCatalog` имеет форму `{ releaseKey: practiceRelease, releaseId: SQL_UUID, topicIds: { semanticTopicId: SQL_UUID } }`.
Это публичные метаданные того же выпуска, полученные из серверного каталога;
нельзя вычислять/угадывать UUID в UI. `cloud.progressCatalog()` читает публичные
`practice_topics` с inner-фильтром выпуска, стабильной пагинацией и проверкой
уникальности ID/ключей. Без карты компонент
показывает понятное сообщение и не запрашивает прогресс. Карта другого releaseKey
сразу отвергается. SQL менять не требуется.

В ответе `practice_topic_progress` обязательно проверяются фактические
`user_id`, `release_id`, `topic_id`, `language`, `is_primary_language` и целочисленные
`required_total/required_passed/required_completed`. CloudProgress type и SQL view
содержат user/release; API использует `select=*`.
Неизвестные темы/другие owner/release отбрасываются, неверные числа и дубли вызывают
error state. Старые и поздние ответы другого владельца не отображаются.

Локальные знаменатели — упражнения текущего каталога. Серверные знаменатели —
обязательные requirement-группы из SQL; A/B и независимость уже учитывает view.
`required_passed` и `required_completed` показываются отдельно. Отсутствие строки
не означает освоение или нулевое число требований: явно показан охват серверных тем.
Основной язык сервера берётся только из `is_primary_language`; он может отличаться
от локального маршрута. Formative quiz, открытая помощь и черновики не дают mastery.
История хранит до 100 последних ответов на упражнение; сводка считает сохранённые ответы.

После успешной записи LocalPracticeStore отправляет `rustml-practice-change` в
текущую вкладку. Компонент также слушает `storage`, смену языка и возврат фокуса.
Эти события обновляют локальную сводку; облачная загрузка выполняется при смене
аккаунта/каталога либо по кнопке «Обновить прогресс», без запроса на каждый ввод кода.
Навигация в упражнение полностью принадлежит родителю через `onOpenExercise`.

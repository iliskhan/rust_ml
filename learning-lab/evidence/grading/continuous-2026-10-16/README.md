# Постоянная работа grader — 2026-10-16

Production работает без календарного отключения и ручного продления. Применена
только SQL007; migrations001–006, manifests, runtime и deployment не повторялись.
API/worker контракт и права сохранены. Runtime Vercel9a78fa5 остаётся прежним.

| Проверка | Наблюдаемый результат |
| --- | --- |
| [Локальные SQL-проверки](local-validation.json) | Новые131/131 и прежние89/89 PASS; независимый review и повтор131 PASS |
| [Rehearsal](rehearsal.json) | SQL007 внутри транзакции, ROLLBACK и исходное состояние подтверждены |
| [Production apply](production-apply.json) | COMMIT подтверждён15:16:22UTC; enabled=true, end=infinity; baseline24/720000 сохранён |
| [Hosted acceptance](hosted-acceptance.json) | Rollback probe PASS; настоящий JavaScript grade2/2 PASS; ledger1claim/2creations/60000cpu-ms |
| Очистка и отсутствие возврата квоты | Auth GET404; sessions/drafts/attempts/jobs=0, собственных VM0; запись резерва осталась |
| [Trusted snapshot](trusted-snapshot.json) | Тот же ID, status=created, expiresAt=null; изменений snapshot не было |
| [Public UI](public-ui.json) | Кнопка проверки доступна,1280×720 без page overflow; [скриншот](public-practice.png) |

Лимиты приложения сохранены:1000созданий/3600000CPU-ms,2одновременных lease,
ограничения отправок и очередь20. Каждая успешная выдача claim, включая retry,
пишет неизменяемый private ledger. Запись учитывается до claim_deadline_at+31день;
истёкшие записи автоматически перестают занимать бюджет при submit/claim.
Планировщик или ручное обнуление не нужны. Lifetime counters только растут:
после проверки26creations/780000cpu-ms. Удаление аккаунта не возвращает бюджет.

Это консервативное резервирование приложения, а не измеритель фактического
биллинга Vercel. При исчерпании своего лимита новые исполнения временно
отклоняются до выхода старых резервов из окна. Ограничения поставщика
сохраняются; увеличение тарифа или расходов не выполнялось.
[Официальные ограничения Sandbox](https://vercel.com/docs/sandbox/pricing).

Rollback probe использует security-definer функции через owner connection,
повышает lifetime и добавляет истёкшие/насыщающие резервы только в транзакции;
не запускает VM. Настоящий grade отдельно вызвал публичный production API,
используя JWT нового одноразового аккаунта. Учётная запись удалена после теста.
Секреты не входят в evidence/Git и не передавались в Vercel.

Предыдущая [проверка трёх языков, isolation и cron](../production-2026-10-16/README.md)
остаётся свидетельством неизменённого runtime. Её прежнее конечное окно
заменено SQL007. Серверный зачёт относится к открытым примерам задачи.

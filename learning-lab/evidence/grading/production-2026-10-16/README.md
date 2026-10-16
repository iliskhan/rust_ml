# Production grader — приёмка 2026-10-16

Серверная приёмка завершена, admission включён; GitHub repository variable
`VITE_PRACTICE_GRADER_URL` указывает на
`https://rustml-grader.vercel.app/api/practice-grade`.
Production deployment `dpl_4Q2md3L5USs5viDSAq6DBPU81qsA` READY, код grader9a78fa5.

| Проверка | Наблюдаемый результат |
| --- | --- |
| [Реальные решения](hosted-real-code.json) | Python4/4, JS2/2, Rust4/4 PASS; намеренно неверный Python0/4 FAIL без прироста прогресса |
| Persistence, immutable source, помощь, RLS | Все4 grades прочитаны новым клиентом; revision заморожена; чужие submit/resume404, прямые writes запрещены |
| [Dedicated logins](dedicated-logins.json) | Два настоящих TLS login,18 запретов;22 группы PASS, без owner credential |
| [SQL fencing](sql-fencing.json) | 32/32 PASS: expiry, generation/token rotation, stale/mixed отказ, idempotent finish, off-admission key replay; ROLLBACK |
| [Provider isolation](provider-isolation.json) | deny-all, nonroot, env whitelist, root/sudo denial, prlimits, output_limit, compile_error;3/3 PASS |
| [Production cron](reaper.json) | HTTP200 complete, eligible1/deleted1/failed0, exact VM404, snapshot сохранён |
| [Локальная валидация](release-validation.json) | Node24.19/Rust1.87/Python;562/562,0skip, typecheck/build PASS на9a78fa5 |
| [Public UI](public-ui.json) | Кнопка доступна после входа; desktop/mobile390/320 без page overflow; скриншоты рядом |
| [Admission](admission-enabled.json) | enabled=true, reservations24creations/720000cpu-ms сохранены |

`hosted-real-code.json` честно сохраняет общий FAIL прежнего монолитного скрипта:
после всех четырёх успешных функциональных проверок он пытался SET ROLE, которого
у Supabase owner нет. Это ограничение тестового подключения. Исправленный отдельный
SQL-only запуск использовал нового одноразового Auth user и те же security-definer
функции без расширения grants. Он прошёл32 проверки и подтвердил ROLLBACK;
реальные dedicated login permissions проверены отдельно. Эти документы вместе
закрывают серверные гейты; SQL fixture не считается реальным исполнением кода.

Все тестовые Auth identities удалены с GET404, sessions/drafts/attempts/jobs=0;
свои Sandbox отсутствуют, trusted snapshot сохранён. Исходные migrations001–006
не повторялись. Секреты не печатались/не коммитились; owner/admin keys в Vercel
не передавались. Промежуточный network_error при чтении статуса Rust в предыдущем
запуске не воспроизвёлся после добавления диагностики; его причина не установлена.

Hobby не имеет billing cycle: https://vercel.com/docs/plans/hobby.
Приложению задан ограниченный window2026-10-16T12:48:07.965Z–2026-11-15T12:48:07.965Z,
1000 creations/3600000cpu-ms. Это не provider quota reset. После истечения окна
новые отправки закрываются до проверки rolling usage и продления; reservations
не сбрасываются автоматически. Public examples можно захардкодить: результат
подтверждает эти примеры, а не обобщение и не полное понимание темы.

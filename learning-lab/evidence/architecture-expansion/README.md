# Десять лабораторий архитектур — приёмка 2026-10-12

Checkout: `C:/Users/lomaster/.codex/worktrees/6209/rust_ml`, ветка
`codex/ui-ux-learning-lab`, начальная чистая база
`417fb4ffb9ffe1139498ec64b67e876d11c17703`. Windows, PowerShell, bundled Node
v24.19.0. Проверялось рабочее дерево этого пакета; состав исходников записан в
`source-manifest.json`. Все вычисления локальные, без новых зависимостей и изменений Rust-ядра.

## Реализация

В `#advanced` доступны все десять принятых направлений:

1. Полный tiny Transformer: 208 параметров, causal attention, два LayerNorm,
   residual, FFN, embeddings и CE; аналитический backward и SGD.
2. Unicode character BPE: корпус, частоты пар, обученные merge, применение к
   новому тексту, словарь/ID. Неизвестные символы сохраняются без ID.
3. ReLU/GELU/SwiGLU: gate/up/product/down, производные и бюджет параметров.
4. LoRA и полная адаптация одной матрицы: настоящий SGD, train/held-out, ранг.
5. ViT: изменяемые пиксели, патчи, общая проекция, позиции, attention.
6. MoE: scores, top-1/2, capacity, перенормировка оставшихся маршрутов, FFN.
7. MLA KV-ядро: общий latent, отдельный RoPE, реконструкция и absorbed расчёт.
8. Online attention: плитки, running max, нормировка, аккумулятор, сравнение
   с полным attention и явно ограниченная модель памяти.
9. SSM ZOH/selectivity, SSD-память, gated delta, attention и учебная смесь.
10. U-Net/DiT: вычисляемые маленькие предикторы шума на сетке с timestep.

Три 3D опыта используют настоящие координаты выходов FFN, LoRA и состояния SSM;
параллельно доступны числа/плоские графики. ViT/MoE/MLA/SSM/U-Net/DiT имеют
ручные веса: это ограниченные вычисляемые механизмы, а не обученные промышленные
модели. В SSM нет полного блока Mamba-2, в DiT используется additive conditioning.
Все ограничения указаны в самих лабораториях.

## Численные проверки и review

Команды из `learning-lab` (полный путь runtime указан выше):

```
node --test tests/*.test.ts
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build
```

Результат: **293/293 PASS**, TypeScript PASS, production build PASS.
Логи: `test-output.txt`, `build-output.txt`. После последнего полного suite менялись
только UI/CSS и документация; финальные tsc/build выполнены повторно.
Vite предупреждает о главном chunk 508.30 kB (154.31 kB gzip); сборка успешна.
Новые лаборатории загружаются отдельными lazy chunks.

Независимый review: `review-training-token.md`, `review-sequence-vision.md`.
624 дополнительных central-difference проверок tiny Transformer (максимальная
ошибка 6.66e−11), 324 attention, 50 gated-delta, 216 MoE, 36 MLA fixtures,
24 граничных запуска LoRA. Численные детали авторов: `tiny-transformer-note.md`,
`token-adaptation-note.md`, `vision-routing-note.md`.

Исправления после review:

- MoE: после capacity повторный stable softmax по принятым logits исключает
  0/0 при underflow прежней вероятности. Регрессия с входами величины 2000 входит
  в 293 теста. Общий suite и финальная сборка прошли после исправления.
- MLA: схема явно включает изменяемый масштаб `c=s·xW_down`.
- Браузер: исправлены контраст выбранной attention-плитки, положение checkbox,
  мобильный перенос чисел в таблицах; таблицы доступны с клавиатуры.
- LoRA: после начала обучения видно, как снова открыть опыт первого шага.

## Настоящий браузер

Codex IAB, production preview `http://127.0.0.1:5183/#advanced`.
Проверены **все 10 глав на 1280×720 и 320×800**. После сборок страница
перезагружалась; затронутые исправления перепроверены на финальной сборке.
Смена глав сохраняет обучение и другие настройки до reload.

| Лаборатория | Наблюдение / выполненное действие | Скриншоты |
|---|---|---|
| Tiny Transformer | 120 SGD: 16/16 групп изменились, train CE .04175, validation .38737; mobile ещё один шаг → 121, CE .04078/.38984 | `tiny-desktop.png`, `tiny-mobile.png` |
| BPE | Enter выполняет merge 3→4; кириллица, emoji и newline восстанавливаются точно; применённые правила не меняются от нового текста | `bpe-desktop.png`, `bpe-mobile.png` |
| SwiGLU | Трасса/производные и 3D выход; ArrowRight меняет поворот 35→36; численная альтернатива доступна | `ffn-3d-desktop.png`, `ffn-mobile.png` |
| LoRA | +50 эпох меняет обе кривые; 3D сравнивает base/target/full/LoRA; подсказка reset подтверждена на финальной сборке | `lora-desktop.png`, `lora-3d-mobile.png` |
| ViT | Выбор патча 4/3 подсвечивает четыре исходных пикселя; x₀₀ 0→1 меняет проекцию/attention/output | `vit-desktop.png`, `vit-mobile.png` |
| MoE | Capacity 4→1: принято 3/8 маршрутов, остальные отброшены; top-1: 3/4; полностью отброшенный токен даёт [0;0] | `moe-desktop.png`, `moe-mobile.png` |
| MLA | Позиция 2: 12/36 скаляров, позиция 3:16/48; absorbed output совпадает; масштаб .5 отображён в схеме | `mla-desktop.png`, `mla-mobile.png` |
| Online | Финальная плитка совпадает с полным ответом; error 1.11e−16 (causal), 2.22e−16 (без mask); плитки доступны Enter | `online-desktop.png`, `online-mobile.png` |
| SSM / delta | Rewrite при α=β=1: SSD [-3;-1.5;.75], delta [-1;-.5;.25]; 3D h₀/h₁/h₂ и numeric table | `ssm-3d-desktop.png`, `ssm-mobile.png` |
| U-Net/DiT | Клавиша меняет t, оба предсказания/MSE пересчитываются: t=.65 → .4265/.19979, t=.55 → .42964/.21858 | `denoisers-desktop.png`, `denoisers-mobile.png` |

На каждом mobile-экране document.scrollWidth=305 при innerWidth=320 (15px занимает
полоса прокрутки): общей горизонтальной прокрутки нет. Широкие числовые таблицы
прокручиваются локально; MLA region clientWidth=233, scrollWidth=481, ArrowRight
действительно изменяет scrollLeft. Числа не разрываются внутри векторов.
Последний запрос console warn/error вернул `[]`. Временный viewport override сброшен.

Озвучивание не проверялось по решению пользователя, повторно подтверждённому
во время этой работы. Native text zoom в этот пакет не включён и не заявляется.
Это UI/математика TypeScript-пакета, не повторная проверка неизменённого Rust-ядра.

## Доставка

Обязательные проверки пройдены. Code commit
`1e51996f9bd7f7682cbf31e35a71117e2723c733` отправлен обычным push;
`rev-parse HEAD` и `ls-remote origin refs/heads/codex/ui-ux-learning-lab`
вернули одинаковый SHA. Этот итог доставки также записан в корневом PROGRESS.md.

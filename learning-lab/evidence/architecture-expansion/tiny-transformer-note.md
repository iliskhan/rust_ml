# Полностью обучаемый tiny Transformer

Состояние: математика и UI реализованы; targeted tests и TypeScript проходят. Интеграция,
общий build, desktop/mobile browser и Git checkpoint — у основного агента.

Checkout: `C:/Users/lomaster/.codex/worktrees/6209/rust_ml`, исходный HEAD `417fb4f`.
Дата проверки: 2026-10-12 (Europe/Moscow).

## Область и API

- `src/TinyTransformerLab.tsx`: именованный React export `TinyTransformerLab`, без props.
- `src/tiny-transformer-lab.css`: только стили внутри `.tiny-transformer-lab`.
- `src/tinyTransformerMath.ts`: `initialTinyParameters`, `tinyTransformerTrace`,
  `tinyTokenContributions`, `tinyEvaluate`, `tinySgdStep`; константы `TINY_GROUPS`,
  `TINY_PARAMETER_COUNT`, `TINY_TRAIN`, `TINY_VALIDATION`, `TINY_VOCAB`.
- `tests/tinyTransformerMath.test.ts`: шесть математических тестов.

Полный один pre-LN causal Transformer: E+обучаемые P, LayerNorm с gamma/beta,
Q/K/V/O, residual, второй LayerNorm, FFN 4→8→4 tanh с bias, residual, голова U+b,
устойчивая log-sum-exp CE. Всего 208 trainable параметров в 16 группах.
Скалярный reverse-mode tape использует аналитические локальные производные; все
общие параметры представлены одним узлом, и их градиенты суммируются.

## Доказательства

Из `learning-lab`:

```powershell
& 'C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --test tests/tinyTransformerMath.test.ts
& 'C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' node_modules/typescript/bin/tsc --noEmit
```

Результат: 6/6 тестов, exit 0; typecheck exit 0.

- Все 208 градиентов сравниваются с центральными разностями (epsilon=1e−5,
  абсолютный допуск 2e−7), включая оба LayerNorm, FFN и embeddings.
- Проверены CE derivative `(p-y)/T` и Jacobian attention softmax.
- Изменение будущих токенов не меняет прежние logits; будущий positional embedding
  не получает вклад от ранней потери.
- Вклады отдельных loss суммируются в градиент общего веса; проверены все группы
  и повторяющиеся token embeddings.
- Устойчивая CE остаётся конечной при крайне малой вероятности цели.
- За 120 шагов с seed=17, η=0,08 и чередованием **только train**:
  train CE 1,5378726607 → 0,0417524480, accuracy 25% → 100%;
  validation CE 1,5305300358 → 0,3873682136, accuracy 25% → 75%.
  Изменились все 16 групп параметров. Начальный массив не мутируется.

Train: АБВГА и БВГАБ. Validation: ВГАБВ и ГАБВГ. Последовательности различны,
но переходы и правило знакомы; UI прямо ограничивает вывод восемью отложенными
целями и не заявляет общего понимания языка. Validation не входит в SGD.

## UI и оставшаяся проверка

Есть 1/20/120 шагов, η, сброс, история обеих потерь и точности, selector стадии,
позиции и любого из 208 весов; таблицы actual backward, causal attention,
по-token-loss вкладов в общий вес, next SGD и сдвига каждой группы параметров.
Таблицы прокручиваются с клавиатуры, controls нативные; CSS складывает колонки
до 850 px. Визуальную корректность на 320 px должен подтвердить основной агент
в настоящем браузере. Не считать один typecheck проверкой внешнего вида.

Следующий шаг: подключить `TinyTransformerLab` в `AdvancedArchitecturesCourse`,
выполнить общий build/test и проверить desktop/mobile через браузер.

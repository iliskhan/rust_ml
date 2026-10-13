# Статус возможностей RustML

Обновлено: 2026-10-14. Числа тестов, команды и состояние проверок записываются в
[PROGRESS.md](PROGRESS.md); этот документ описывает границы реализации.

| Область | Состояние |
|---|---|
| CPU Tensor, динамические shapes, создание и reshape | Реализовано; границы форм и выделения проверены |
| Поэлементные операции и broadcasting | Реализованы для разных рангов, скаляров и пустых осей; integer arithmetic проверяемая |
| Tensor matmul и transpose | Реализованы для 2D |
| Scalar/elementwise autograd | Add/sub/mul, ReLU и среднее всех элементов; общие ветки, повторный backward, редукция градиентов и контроль мутаций |
| Публичный facade rustml | Реэкспорты core/tensor/autograd/nn и интеграционные тесты |
| NN/Linear, loss и SGD | CPU Linear, MSE точных непустых форм и шаг SGD одного параметра; пример y=2x+1 |
| Небольшой MLP | Композиция Linear/ReLU/Linear, воспроизводимые веса по seed, пример XOR; без общего Module/Sequential |
| Autograd matmul | Реализован для 2D, производные проверены конечными разностями f64 |
| Higher-order derivatives | Не реализованы; grad возвращает Tensor без derivative graph |
| Model serialization | Не реализована; serde у вспомогательных типов её не заменяет |
| GPU/distributed training | Не реализованы |
| Benchmark против PyTorch, измеренное покрытие | Не выполнялись; проценты и преимущество не заявлены |
| GitHub CI на Windows/Linux | Настроен; результат каждого опубликованного набора фиксируется в PROGRESS.md |
| Публикация crates | Не подготовлена: изолированная упаковка требует переноса workspace-relative README/examples |

## Критерии

- Tensor: реальные результаты broadcasting, нулевые оси, разные ранги, неверные формы и integer ошибки.
- Autograd: аналитические производные, finite differences f64, общие ветки, повторный backward,
  zero_grad и запрет небезопасной мутации. Проверять число и форму градиента, а не только `is_some()`.
- Примеры: выполнять main, а не ограничиваться компиляцией example targets.
- Публичный API: тест через rustml и компилируемые фрагменты README.
- Готовность сборки: debug/release, doctests, fmt, strict Clippy и rustdoc.

Метки «Milestone 1–2 полностью завершены» из прежней версии были слишком широкими:
они не учитывали ошибки broadcasting и общих подграфов. Текущее ядро и минимальный
Linear и небольшой MLP проверяются отдельными сценариями. GPU и production framework не заявлены.

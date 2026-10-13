# RustML

Учебная CPU-библиотека для изучения Rust и автоматического дифференцирования.
Реализованы численное ядро и небольшая обучаемая модель `Linear + MSE + SGD`.
Это ещё не готовый фреймворк для обучения нейросетей.

## Интерактивный учебник

В `learning-lab/` находятся русские интерактивные уроки: нейрон и слои, потери, backprop,
SGD/momentum/Adam, обучение XOR, Dense/CNN/RNN/LSTM/GRU/Transformer.
Есть подробный маршрут Transformer и связанные математические основы: можно открыть
градиент, углубиться в производную и вернуться к прежнему месту и настройкам.
Карта курса показывает глубину и границы каждой темы. Вычисления работают самостоятельно
на TypeScript в браузере; состояние экспериментов сохраняется до перезагрузки вкладки.

Для Windows установите Node.js 24+ и pnpm 11.25.0, затем из корня проекта выполните:

```powershell
.\learn.cmd
```

Скрипт устанавливает зависимости по lockfile, запускает сервер на `http://127.0.0.1:5180/`
и открывает браузер. Для остановки нажмите Ctrl+C. Если порт занят: `.\learn.cmd --port 5181`.
Запуск на других системах и проверки — в [learning-lab/README.md](learning-lab/README.md).
Rust для запуска учебника не требуется; Cargo-команды ниже проверяют Rust-библиотеку.

## Начало работы

Проверяемая минимальная версия Rust — 1.87. Toolchain разработки закреплён в
`rust-toolchain.toml`; зависимости workspace — в `Cargo.lock`.

```sh
cargo test --workspace --all-features --locked
cargo test --workspace --all-features --release --locked
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features --locked -- -D warnings
cargo doc --workspace --all-features --no-deps --locked
```

Запускаемые примеры зарегистрированы в manifests соответствующих crates:

```sh
cargo run --locked --example basic_tensor_ops
cargo run --locked --example autograd_test
cargo run --locked --example milestone_check
cargo run --locked --example scalar_demo
cargo run -p rustml-nn --locked --example linear_regression
```

## Использование

Поэлементные операции поддерживают broadcasting: недостающие ведущие оси считаются
единичными, а размер `1` совместим с размером другой оси.

```rust
use rustml::Tensor;

let a = Tensor::<f32>::zeros([2, 3]);
let b = Tensor::from_vec(vec![1.0f32, 2.0, 3.0], [3])?;
let c = (&a + &b)?;
assert_eq!(c.shape().dims(), &[2, 3]);
assert_eq!(c.data()[[1, 2]], 3.0);
# Ok::<(), rustml::RustMLError>(())
```

`Variable` строит граф для `f32`/`f64`; `Tensor` хранит числа и не ведёт граф.
`backward()` вычисляет градиенты. Изменение весов — отдельный шаг оптимизатора.

```rust
use rustml::Variable;

let x = Variable::scalar(2.0f64, true);
let squared = (&x * &x)?;
let y = (&squared + 3.0)?;
y.backward()?;
assert_eq!(x.grad().unwrap().item()?, 4.0);
# Ok::<(), rustml::RustMLError>(())
```

Для тензорного результата `backward()` дифференцирует сумму его элементов.
`backward_with_grad()` принимает начальный градиент точной формы результата.
Повторный backward накапливает новые вклады; `zero_grad()` очищает градиент одной переменной.

## Контракты и ограничения

- Shapes проверяются во время исполнения; generic dtype не гарантирует совместимость форм при компиляции.
- Integer tensor arithmetic возвращает ошибку при переполнении и недопустимом делении.
  Floating-point arithmetic сохраняет IEEE-754 `NaN`/`Inf`.
- Для внешних форм используйте fallible `try_zeros`, `try_ones`, `from_vec` и проверяемый подсчёт размера.
  Удобные `zeros`/`ones` сохраняют явно документированный panic-контракт.
- Копия `Variable` разделяет идентичность и градиент. Изменение допускается только у уникального листа,
  который больше не удерживается графом; иначе возвращается ошибка. `detach()` создаёт независимую переменную.
- Реализованы CPU tensor matmul/transpose, autograd для add/sub/mul, 2D matmul и среднего.
  `Linear`, `mse_loss` и `Sgd` обучают линейную регрессию; MSE требует одинаковых
  непустых форм. SGD обновляет один уникальный leaf-параметр и очищает его градиент.
  Перед обновлением нужно освободить граф; следующий проход строит новый граф.
  MLP, batched matmul и сохранение моделей ещё предстоят.
- `cuda`/`opencl` в core — только зарезервированные варианты устройств, не GPU-исполнение.
  Производные высших порядков и конкурентный backward с мутацией не заявлены.

## Структура

| Crate | Ответственность |
|---|---|
| `rustml-core` | Числовые типы, ошибки и CPU device |
| `rustml-tensor` | Хранение ndarray, формы и операции |
| `rustml-autograd` | Variable, граф и первые производные |
| `rustml-nn` | CPU Linear, MSE и SGD |
| `rustml` | Общий публичный вход и реэкспорты |

## Документация и обучение

- [PROGRESS.md](PROGRESS.md) — проверенные результаты, окружение и следующий шаг.
- [PLAN.md](PLAN.md) — последовательность разработки и исследованные источники.
- [MILESTONE_STATUS.md](MILESTONE_STATUS.md) — реализованные возможности и границы.
- [LEARNING_GUIDE.md](LEARNING_GUIDE.md) — математика и устройство кода.
- [FUTURE_API_IMPROVEMENTS.md](FUTURE_API_IMPROVEMENTS.md) — отложенные решения API.
- [.cursor/rules/teaching-mode.mdc](.cursor/rules/teaching-mode.mdc) — учебный формат;
  реализация помощником допускается по явному запросу пользователя.

Лицензия: MIT OR Apache-2.0, на выбор; тексты — [LICENSE-MIT](LICENSE-MIT) и [LICENSE-APACHE](LICENSE-APACHE).

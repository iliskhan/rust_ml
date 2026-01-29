# 🦀 RustML - Machine Learning библиотека на Rust

> **Образовательный проект:** Изучение Rust через создание ML библиотеки (аналог TensorFlow/PyTorch)

---

## 🗺️ Быстрая навигация

| Файл | Описание |
|------|----------|
| 📍 **[PROGRESS.md](PROGRESS.md)** | **← НАЧНИ ЗДЕСЬ!** Где мы сейчас, что сделано, что дальше |
| 📋 [PLAN.md](PLAN.md) | Полный план разработки по фазам и milestone'ам |
| 📚 [LEARNING_GUIDE.md](LEARNING_GUIDE.md) | Детальный разбор математики и Rust реализации |
| 📊 [MILESTONE_STATUS.md](MILESTONE_STATUS.md) | Технический статус завершенных milestone'ов |
| 🎓 [.cursor/rules/](.cursor/rules/) | Правила разработки для AI ассистента |

---

## ⚡ Быстрый старт

```bash
# Запустить все тесты
cargo test

# Примеры использования
cargo run --example basic_tensor_ops     # Тензорные операции
cargo run --example autograd_test        # Автоматическое дифференцирование
cargo run --example milestone_check      # Проверка критериев milestone'ов
cargo run --example scalar_demo          # Scalar + Variable операции
```

---

## 🎯 Текущий прогресс

```
✅ Milestone 1: Базовые тензоры (месяц 1-2)
✅ Milestone 2: Автоматическое дифференцирование (месяц 3-4)
🔄 Milestone 3: Базовые NN слои (месяц 5-6) ← В ПРОЦЕССЕ
   ├── ✅ matmul, transpose
   └── ⏳ MatMulOp для autograd
```

**Подробности:** см. [PROGRESS.md](PROGRESS.md)

---

## 🏗️ Архитектура

```
rustml/
├── rustml-core/       # Базовые типы (Device, DType, Error, Backend)
├── rustml-tensor/     # Tensor operations, Broadcasting, Shape
├── rustml-autograd/   # Computational graph, Autograd, Variable
├── rustml-nn/         # (планируется) Neural Network layers
├── rustml-optim/      # (планируется) Optimizers (SGD, Adam, etc.)
└── rustml/            # Main crate (re-exports)
```

---

## 🧪 Что уже работает

### Тензорные операции:
```rust
use rustml_tensor::Tensor;

let a = Tensor::zeros([2, 3]);
let b = Tensor::ones([2, 3]);
let c = &a + &b;  // Element-wise addition
assert_eq!(c.shape(), [2, 3]);
```

### Автоматическое дифференцирование:
```rust
use rustml_autograd::Variable;
use rustml_tensor::Tensor;

let x = Variable::new(Tensor::scalar(2.0f32), true);
let y = &x * &x + 3.0;  // y = x² + 3
y.backward();
assert_eq!(x.grad().unwrap().item(), 4.0); // dy/dx = 2x = 4
```

---

## 📚 Ресурсы для изучения

### Официальная документация:
- [The Rust Programming Language](https://doc.rust-lang.org/book/)
- [Rust by Example](https://doc.rust-lang.org/rust-by-example/)

### ML на Rust:
- [ndarray](https://docs.rs/ndarray/) - многомерные массивы
- [candle](https://github.com/huggingface/candle) - ML фреймворк от HuggingFace
- [burn](https://github.com/tracel-ai/burn) - еще один ML фреймворк

---

## 🎓 Режим обучения

**Важно:** Этот проект создается в формате обучения:
- Код пишется **вручную** (не генерируется AI)
- AI выступает как **учитель/наставник**
- Каждая задача разбирается с математической и технической стороны

**Подробности:** [.cursor/rules/teaching-mode.md](.cursor/rules/teaching-mode.md)

---

## 📊 Статистика

- **Crates:** 5 (core, tensor, autograd, nn, main)
- **Исходных файлов:** 15+
- **Тесты:** 45 passing
- **Примеры:** 4 working
- **Строк кода:** ~1800+

---

## 🚀 Планы на будущее

- [ ] Neural Network слои (Linear, Conv2d, RNN, LSTM)
- [ ] Optimizers (SGD, Adam, AdamW, RMSprop)
- [ ] GPU поддержка (CUDA, OpenCL)
- [ ] Data loaders и augmentation
- [ ] Pretrained models
- [ ] Serialization (сохранение/загрузка моделей)

---

## 📝 Лицензия

Образовательный проект для изучения Rust и ML.

---

**🎯 Начни с [PROGRESS.md](PROGRESS.md) чтобы увидеть где мы сейчас!**


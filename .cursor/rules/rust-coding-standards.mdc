---
description: "Rust coding standards specific to ML library development"
globs: ["**/*.rs"]
alwaysApply: true
---

# 🦀 RustML - Rust Coding Standards

## Ownership и Memory Management
- **ПРИОРИТЕТ на zero-copy** операции где возможно
- Используй `&Tensor` для readonly операций
- `&mut Tensor` только для in-place модификация
- `Arc<Tensor>` для shared ownership между threads
- **ИЗБЕГАЙ** `clone()` больших тензоров - используй views/slices

## Error Handling
- **ВСЕГДА** используй `Result<T, E>` для fallible операций
- Создавай специфичные error types для каждого модуля:
```rust
#[derive(Debug, thiserror::Error)]
pub enum TensorError {
    #[error("Dimension mismatch: expected {expected}, got {actual}")]
    DimensionMismatch { expected: usize, actual: usize },
    #[error("Invalid device: {0}")]
    InvalidDevice(String),
}
```
- Используй `anyhow` для error propagation в examples
- `thiserror` для библиотечных error types

## Type Safety для ML
- **Максимально используй** систему типов для safety
- Phantom types для compile-time проверок размерностей:
```rust
pub struct Tensor<T, const DIMS: usize> {
    data: Vec<T>,
    shape: [usize; DIMS],
}
```
- Const generics для фиксированных размеров где возможно
- Sealed traits для internal APIs

## Performance Requirements
- **Измеряй ДО оптимизации** - используй `criterion` для benchmarks
- Inline малые функции с `#[inline]`
- SIMD оптимизации через `std::simd` где appropriate
- `unsafe` код ТОЛЬКО после профилирования и детального обоснования

## Naming Conventions
- `snake_case` для functions и variables
- `PascalCase` для types и traits
- `SCREAMING_SNAKE_CASE` для constants
- Verbs для actions (`compute_gradient`, `apply_transform`)
- Predicates начинаются с `is_` или `has_`

## Documentation Requirements
- **ОБЯЗАТЕЛЬНО** rustdoc для всех public APIs
- Examples в docstrings для non-trivial functions
- Performance characteristics (O(n), memory usage) в документации

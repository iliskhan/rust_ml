# 🔮 Планируемые улучшения API

## Проблема: Orphan Rule и Scalar + Variable

### Текущее состояние (Milestone 2):
```rust
let x = Variable::scalar(2.0, true);
let y = (&x + 3.0)?;      // ✅ Работает
let z = (3.0 + &x)?;      // ❌ НЕ работает (orphan rule)
```

### Решение для Milestone 3+:

#### 1. Добавить `Scalar<T>` wrapper type
```rust
pub struct Scalar<T: DType>(pub T);

impl<T: DType> Add<&Variable<T>> for Scalar<T> {
    type Output = Result<Variable<T>>;
    fn add(self, var: &Variable<T>) -> Self::Output {
        var + self.0
    }
}

// Использование:
use rustml_autograd::Scalar;
let y = (Scalar(3.0) + &x)?;  // ✅
```

#### 2. Convenience макрос для естественного синтаксиса
```rust
#[macro_export]
macro_rules! var_add {
    ($lhs:expr, $rhs:expr) => {{
        // Автоматически определяем порядок операндов
        let lhs = $lhs;
        let rhs = $rhs;
        // Умная логика для Variable + Scalar и Scalar + Variable
        $crate::ops::add_flexible(lhs, rhs)
    }};
}

// Использование выглядит естественно:
let y = var_add!(3.0, &x);  // ✅
let z = var_add!(&x, 3.0);  // ✅
```

#### 3. Builder pattern для сложных выражений
```rust
// Для более сложных случаев:
let expr = Expression::new()
    .add_scalar(3.0)
    .add_var(&x)
    .mul_scalar(2.0)
    .build()?;
```

## Приоритет реализации:

### Milestone 3 (NN слои):
- [ ] Добавить `Scalar<T>` wrapper
- [ ] Базовые convenience макросы
- [ ] From<T> для Variable (для scalar promotion)

### Milestone 4 (Advanced):
- [ ] Полноценная Expression DSL
- [ ] Operator overloading через макросы
- [ ] Syntax sugar для common patterns

## Почему не сейчас?

1. **Milestone 1-2 фокус:** Базовая функциональность работает
2. **API стабильность:** Пусть пользователи попробуют current API
3. **Приоритеты:** NN layers важнее syntactic sugar
4. **Итеративный подход:** Добавим когда станет clear bottleneck

## Альтернативные подходы других библиотек:

### PyTorch (Python):
```python
x = torch.tensor(2.0, requires_grad=True)
y = 3.0 + x  # Работает благодаря __radd__
```

### Candle (Rust):
```rust
// Candle решает это через Tensor::new для scalars
let x = Tensor::new(2.0)?;
let y = Tensor::new(3.0)?.add(&x)?;  // Explicit
```

### Burn (Rust):
```rust
// Burn использует backend-agnostic подход
let x = Tensor::from_data([2.0]);
let y = x.add_scalar(3.0);  // Method call
```

## Наш подход:
Балансируем между:
- ✅ **Type safety** (Rust strengths)
- ✅ **Ergonomics** (developer experience)
- ✅ **Explicitness** (понятность кода)

**Решение:** Предоставить оба варианта:
- `variable + scalar` - always works
- `Scalar(value) + variable` - для symmetry
- `var_add!` макрос - для convenience

---

**Статус:** Planned for Milestone 3+  
**Приоритет:** Medium (после core NN functionality)  
**Сложность:** Low (straightforward implementation)

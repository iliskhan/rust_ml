# 📚 RustML: Полный разбор реализации

## Оглавление
1. [Milestone 1: Базовые тензоры - Математика и реализация](#milestone-1-базовые-тензоры)
2. [Milestone 2: Автоматическое дифференцирование - Математика и реализация](#milestone-2-автодифф)
3. [Bonus: Scalar wrapper - Решение orphan rule](#bonus-scalar-wrapper)

---

# Milestone 1: Базовые тензоры

## 🎯 Цель
Создать структуру данных для многомерных массивов (тензоров) с поддержкой арифметических операций.

---

## 📐 Математическая сторона

### Что такое тензор?

**Простое определение:** Тензор - это многомерный массив чисел.

**Примеры:**
- **Скаляр** (0D тензор): просто число `5`
- **Вектор** (1D тензор): `[1, 2, 3]`
- **Матрица** (2D тензор): `[[1, 2], [3, 4]]`
- **3D тензор**: `[[[1, 2], [3, 4]], [[5, 6], [7, 8]]]`

### Shape (форма) тензора

**Shape** - это размеры тензора по каждой оси.

```
Скаляр:        shape = []
Вектор [1,2,3]: shape = [3]
Матрица 2×3:    shape = [2, 3]
3D тензор:      shape = [2, 4, 3]
```

### Арифметические операции

#### Element-wise операции
Операции применяются **поэлементно**:

```
[1, 2] + [3, 4] = [1+3, 2+4] = [4, 6]

[[1, 2],   [[5, 6],   [[6, 8],
 [3, 4]] +  [7, 8]] =  [10, 12]]
```

**Правило:** Тензоры должны иметь одинаковую shape!

#### Broadcasting
Что если shape разные, но **совместимые**?

```python
# Вектор + скаляр
[1, 2, 3] + 10 = [11, 12, 13]

# Скаляр "растягивается" (broadcast) до [10, 10, 10]
```

**Правила broadcasting** (как в NumPy):
1. Сравниваем shape справа налево
2. Измерения совместимы если:
   - Они равны, или
   - Одно из них равно 1, или
   - Одного измерения нет

```
Пример 1: OK
  [2, 3, 4]
      [4]     → broadcast до [1, 1, 4] → OK

Пример 2: ERROR
  [2, 3, 4]
      [3]     → несовместимо по последней оси (4 ≠ 3)
```

---

## 💻 Реализация в Rust

### Архитектура (4 crate'а)

```
rustml/
├── rustml-core/       # Базовые типы (Device, DType, Error)
├── rustml-tensor/     # Tensor structure + операции
├── rustml-autograd/   # Автодифф (Variable, Graph)
└── rustml/            # Главный crate (re-exports)
```

**Зачем несколько crates?**
- **Модульность:** Можно использовать только tensor без autograd
- **Компиляция:** Быстрее компилируется (параллельно)
- **Переиспользование:** rustml-core могут использовать другие
- **Организация:** Четкое разделение ответственности

---

### 1. `rustml-core` - Фундамент

#### 1.1 `DType` trait - Типы данных

**Математика:** В ML используем разные типы чисел:
- `f32`, `f64` - для весов, градиентов (floating point)
- `i32`, `i64` - для индексов, меток классов
- `u32`, `u64` - для счетчиков, размеров

**Реализация:**
```rust
pub trait DType: Copy + Clone + Send + Sync + 'static {
    const SIZE: usize;      // Размер в байтах
    const NAME: &'static str;  // Имя типа для debug
    
    // Арифметика
    // + Add, Sub, Mul, Div из std::ops
    // + Zero, One для 0 и 1
}
```

**Зачем trait?**
- **Обобщенность:** `Tensor<T: DType>` работает с любым типом
- **Type safety:** Rust проверяет в compile time
- **Производительность:** Нет runtime overhead

#### 1.2 `Device` trait - Где выполнять вычисления

**Концепция:**
- CPU - обычная память
- GPU (CUDA, Metal) - видеокарта (позже)
- TPU - специализированные процессоры (будущее)

**Реализация:**
```rust
pub trait Device: Debug + Send + Sync {
    fn name(&self) -> &str;
    fn is_cpu(&self) -> bool;
    // Позже: allocate, deallocate, copy_to, etc.
}

pub struct Cpu;  // Пока только CPU
```

**Зачем нужно:**
- Абстракция над hardware
- Готовность к GPU поддержке
- Можем переключать backend без изменения кода

#### 1.3 `RustMLError` - Обработка ошибок

**Rust подход:** Нет exceptions, есть `Result<T, E>`

```rust
pub enum RustMLError {
    DimensionMismatch { expected: String, got: String },
    InvalidShape { shape: Vec<usize>, operation: String },
    DeviceMismatch { expected: String, got: String },
    // ...
}

pub type Result<T> = std::result::Result<T, RustMLError>;
```

**Зачем `thiserror`:**
```rust
#[derive(Error, Debug)]
#[error("Dimension mismatch: expected {expected}, got {got}")]
pub struct DimensionMismatch {
    expected: String,
    got: String,
}
```
Автоматически генерирует `Display` и `Error` impl.

---

### 2. `rustml-tensor` - Тензоры

#### 2.1 `Shape` struct

**Задача:** Хранить и проверять размерности.

```rust
pub struct Shape {
    dims: Vec<usize>,  // [2, 3, 4] означает 2×3×4
}

impl Shape {
    pub fn new(dims: Vec<usize>) -> Self;
    pub fn ndim(&self) -> usize;  // Количество измерений
    pub fn size(&self) -> usize;  // Общее количество элементов
    
    // Broadcasting
    pub fn can_broadcast_with(&self, other: &Shape) -> bool;
    pub fn broadcast_with(&self, other: &Shape) -> Result<Shape>;
}
```

**Важная функция - `can_broadcast_with`:**
```rust
// Проверяем справа налево
let a = Shape::new(vec![2, 3, 4]);
let b = Shape::new(vec![4]);

// 4 == 4 → OK!
// 3 vs отсутствует → OK (дополняем до 1)
// 2 vs отсутствует → OK
```

#### 2.2 `Tensor<T>` struct

**Главная структура данных:**

```rust
pub struct Tensor<T: DType> {
    data: ArrayD<T>,              // Данные (из ndarray crate)
    shape: Shape,                 // Форма
    device: Arc<dyn Device>,      // Где находятся данные
    requires_grad: bool,          // Нужны ли градиенты (для autograd)
}
```

**Почему `ArrayD` из `ndarray`:**
- Mature library (как NumPy для Rust)
- Оптимизированные операции
- Поддержка strided arrays (view без копирования)
- Мы используем как backend, оборачиваем своим API

**Почему `Arc<dyn Device>`:**
- `Arc` - Atomic Reference Counting (shared ownership)
- `dyn Device` - trait object (динамическая диспетчеризация)
- Можем передавать между потоками (Send + Sync)

#### 2.3 Конструкторы

```rust
impl<T: DType> Tensor<T> {
    // Создать из вектора
    pub fn from_vec(data: Vec<T>, shape: impl IntoShape) -> Result<Self>
    
    // Все нули
    pub fn zeros(shape: impl IntoShape) -> Self
    
    // Все единицы
    pub fn ones(shape: impl IntoShape) -> Self
    
    // Скаляр
    pub fn scalar(value: T) -> Self
}
```

**`impl IntoShape` - trait для удобства:**
```rust
pub trait IntoShape {
    fn into_shape(self) -> Shape;
}

// Можем вызывать:
Tensor::zeros([2, 3])      // из array
Tensor::zeros(vec![2, 3])  // из Vec
Tensor::zeros(Shape::new(vec![2, 3]))  // явно
```

#### 2.4 Арифметические операции

**Operator overloading в Rust:**
```rust
use std::ops::Add;

impl<T: DType> Add for &Tensor<T> {
    type Output = Result<Tensor<T>>;
    
    fn add(self, other: &Tensor<T>) -> Self::Output {
        // 1. Проверить shape
        if self.shape() != other.shape() {
            return Err(dimension_mismatch(...));
        }
        
        // 2. Выполнить операцию element-wise
        let result_data = &self.data + &other.data;  // ndarray делает работу
        
        // 3. Создать новый Tensor
        Ok(Tensor {
            data: result_data,
            shape: self.shape.clone(),
            device: self.device.clone(),
            requires_grad: false,  // Пока без autograd
        })
    }
}
```

**Почему `&Tensor` а не `Tensor`:**
```rust
// С &Tensor (reference):
let c = &a + &b;  // a и b остаются валидными ✅

// Без &Tensor (move):
let c = a + b;    // a и b moved, больше нельзя использовать ❌
```

**Zero-copy philosophy:** Не копируем данные без необходимости.

---

### 3. Ключевые Rust концепции

#### 3.1 Ownership (Владение)

**Правило:** Каждое значение имеет одного владельца.

```rust
let a = Tensor::ones([2, 3]);
let b = a;  // a moved в b
// println!("{:?}", a);  // ERROR! a больше не валиден
```

**Решение - borrowing:**
```rust
let a = Tensor::ones([2, 3]);
let b = &a;  // Заимствуем (borrow), не перемещаем
println!("{:?}", a);  // OK! a все еще валиден
```

#### 3.2 Generic types (Обобщенные типы)

```rust
struct Tensor<T: DType> {  // T - type parameter
    data: Vec<T>,
}

// Компилятор генерирует отдельный код для каждого типа:
// Tensor<f32>, Tensor<i32>, etc.
// Это называется monomorphization - zero runtime cost!
```

#### 3.3 Trait bounds

```rust
impl<T: DType> Tensor<T> { ... }
//     ^^^^^^^ trait bound
```

Означает: "этот impl работает для всех T, которые реализуют DType"

**Compile-time checking:**
```rust
Tensor::<f32>::zeros([2, 3]);  // ✅ f32 реализует DType
Tensor::<String>::zeros([2, 3]);  // ❌ String НЕ реализует DType
```

---

## 🎓 Что получили в Milestone 1

### Математически:
✅ Многомерные массивы (тензоры)
✅ Element-wise арифметика (+, -, *, /)
✅ Broadcasting compatibility проверки
✅ Shape manipulations (reshape)

### В коде:
✅ Type-safe generic Tensor<T>
✅ Zero-copy operations (через &)
✅ Proper error handling
✅ Device abstraction готова к GPU
✅ 16 unit tests

---

# Milestone 2: Автоматическое дифференцирование

## 🎯 Цель
Автоматически вычислять градиенты для любой композиции операций.

---

## 📐 Математическая сторона

### Что такое градиент?

**Градиент** - это производная многомерной функции.

**1D случай (производная):**
```
f(x) = x²
f'(x) = 2x

При x = 3:
f'(3) = 6  (насколько быстро растет функция)
```

**Многомерный случай:**
```
f(x, y) = x² + 3y

∂f/∂x = 2x  (производная по x)
∂f/∂y = 3   (производная по y)

Градиент ∇f = [∂f/∂x, ∂f/∂y] = [2x, 3]
```

### Зачем в ML?

**Обучение нейросетей = оптимизация весов**

```
Loss = error(prediction, target)

Хотим: минимизировать Loss
Как: двигаться в направлении -∇Loss (gradient descent)

weights = weights - learning_rate * ∇Loss
```

### Chain Rule (правило цепочки)

**Главное правило автодиффа!**

```
y = f(g(x))
dy/dx = (df/dg) * (dg/dx)
```

**Пример:**
```
h(x) = sin(x²)

Разбиваем:
u = x²         → du/dx = 2x
h = sin(u)     → dh/du = cos(u)

Chain rule:
dh/dx = (dh/du) * (du/dx) = cos(u) * 2x = 2x * cos(x²)
```

### Computational Graph

**Представляем вычисление как граф:**

```
x = 2
y = x * x      [MulOp]
z = y + 3      [AddOp]

Граф:
  x(2)
   ↓
  [*]  ← MulOp(x, x)
   ↓
  y(4)
   ↓
  [+3] ← AddScalarOp(y, 3)
   ↓
  z(7)
```

### Forward и Backward Pass

**Forward pass** - вычисляем значения (слева направо)
**Backward pass** - вычисляем градиенты (справа налево)

```
Forward:
x=2 → y=x*x=4 → z=y+3=7

Backward (chain rule):
∂z/∂z = 1
∂z/∂y = ∂z/∂z * ∂(y+3)/∂y = 1 * 1 = 1
∂z/∂x = ∂z/∂y * ∂(x*x)/∂x = 1 * 2x = 4

Gradient: ∂z/∂x = 4 ✅
```

### Основные правила дифференцирования

```
∂(a + b)/∂a = 1
∂(a + b)/∂b = 1

∂(a * b)/∂a = b
∂(a * b)/∂b = a

∂(a - b)/∂a = 1
∂(a - b)/∂b = -1

∂(a / b)/∂a = 1/b
∂(a / b)/∂b = -a/b²
```

---

## 💻 Реализация в Rust

### 3. `rustml-autograd` crate

#### 3.1 `Variable<T>` - Тензор с градиентом

**Оборачиваем Tensor для tracking градиентов:**

```rust
pub struct Variable<T: DType> {
    pub data: Tensor<T>,                      // Значение
    pub grad: Arc<RwLock<Option<Tensor<T>>>>, // Градиент
    pub requires_grad: bool,                  // Нужно ли считать grad
    pub(crate) graph_node: Option<Arc<GraphNode<T>>>, // Узел графа
}
```

**Почему такая структура:**

1. **`data: Tensor<T>`** - хранит значение
2. **`grad: Arc<RwLock<Option<Tensor<T>>>>`**:
   - `Option` - градиента может не быть (None)
   - `RwLock` - можем изменять из backward pass (interior mutability)
   - `Arc` - shared ownership (граф может иметь несколько ссылок)

3. **`requires_grad: bool`** - оптимизация (не строим граф для констант)

4. **`graph_node`** - связь с computational graph

#### 3.2 Computational Graph структура

**Узел графа:**
```rust
pub struct GraphNode<T: DType> {
    pub op: Box<dyn Operation<T>>,       // Операция
    pub inputs: Vec<Arc<Variable<T>>>,   // Входные переменные
    pub output: Tensor<T>,               // Результат (кэш)
}
```

**Operation trait:**
```rust
pub trait Operation<T: DType>: Debug + Send + Sync {
    fn backward(&self, grad_output: &Tensor<T>) -> Result<()>;
}
```

Каждая операция знает как распространить градиент назад!

#### 3.3 Пример: AddOp (сложение)

**Математика:**
```
z = x + y

∂z/∂x = 1
∂z/∂y = 1
```

**Реализация:**
```rust
pub struct AddOp<T: DType> {
    left: Arc<Variable<T>>,   // Ссылка на x
    right: Arc<Variable<T>>,  // Ссылка на y
}

impl<T: DType> Operation<T> for AddOp<T> {
    fn backward(&self, grad_output: &Tensor<T>) -> Result<()> {
        // Градиент по left (x)
        if self.left.requires_grad {
            let mut grad = self.left.grad.write().unwrap();
            match &*grad {
                Some(existing) => {
                    // Accumulate gradient
                    *grad = Some((existing + grad_output)?);
                }
                None => {
                    *grad = Some(grad_output.clone());
                }
            }
        }
        
        // Градиент по right (y) - аналогично
        // ...
        
        Ok(())
    }
}
```

**Почему accumulate:**
```
y = x + x  (x используется дважды!)

∂y/∂x = ∂(x+x)/∂x = 1 + 1 = 2

Нужно СУММИРОВАТЬ градиенты от всех использований!
```

#### 3.4 Пример: MulOp (умножение)

**Математика:**
```
z = x * y

∂z/∂x = y
∂z/∂y = x
```

**Реализация:**
```rust
pub struct MulOp<T: DType> {
    left: Arc<Variable<T>>,
    right: Arc<Variable<T>>,
}

impl<T: DType> Operation<T> for MulOp<T> {
    fn backward(&self, grad_output: &Tensor<T>) -> Result<()> {
        // ∂z/∂x = y * grad_output (chain rule!)
        if self.left.requires_grad {
            let grad_x = (&self.right.data * grad_output)?;
            // accumulate как в AddOp...
        }
        
        // ∂z/∂y = x * grad_output
        if self.right.requires_grad {
            let grad_y = (&self.left.data * grad_output)?;
            // accumulate...
        }
        
        Ok(())
    }
}
```

#### 3.5 Forward pass - построение графа

**При вызове операции:**
```rust
impl<T: DType> Add for &Variable<T> {
    type Output = Result<Variable<T>>;
    
    fn add(self, other: &Variable<T>) -> Self::Output {
        // 1. Выполнить вычисление
        let result_data = (&self.data + &other.data)?;
        
        // 2. Создать узел графа (если нужно)
        let graph_node = if self.requires_grad || other.requires_grad {
            Some(Arc::new(GraphNode {
                op: Box::new(AddOp {
                    left: Arc::new(self.clone()),
                    right: Arc::new(other.clone()),
                }),
                inputs: vec![Arc::new(self.clone()), Arc::new(other.clone())],
                output: result_data.clone(),
            }))
        } else {
            None  // Не нужно tracking для констант
        };
        
        // 3. Вернуть новую Variable
        Ok(Variable {
            data: result_data,
            grad: Default::default(),
            requires_grad: self.requires_grad || other.requires_grad,
            graph_node,
        })
    }
}
```

#### 3.6 Backward pass - вычисление градиентов

```rust
impl<T: DType> Variable<T> {
    pub fn backward(&self) -> Result<()> {
        // 1. Инициализировать градиент выхода = 1
        // (для loss это означает ∂loss/∂loss = 1)
        let initial_grad = Tensor::ones(self.data.shape().clone());
        
        // 2. Если есть граф - запустить backward
        if let Some(node) = &self.graph_node {
            node.op.backward(&initial_grad)?;
        }
        
        Ok(())
    }
}
```

**Рекурсивное распространение:**
```
z.backward() вызывает:
  → AddOp::backward(grad=1)
    → обновляет x.grad и y.grad
      → если у x или y есть graph_node, продолжается рекурсивно
```

---

### 4. Ключевые Rust концепции (продолжение)

#### 4.1 Interior Mutability (RwLock)

**Проблема:**
```rust
fn backward(&self, ...) {  // &self - immutable reference
    self.grad = ...;       // ERROR! Cannot mutate through &
}
```

**Решение - RwLock:**
```rust
pub grad: Arc<RwLock<Option<Tensor<T>>>>,

// В backward:
let mut grad = self.grad.write().unwrap();  // Получаем mutable guard
*grad = Some(new_value);  // Теперь можем изменить!
```

**RwLock** = Readers-Writer Lock:
- Много читателей одновременно
- Или один писатель
- Безопасно для многопоточности

#### 4.2 Trait Objects (dyn Trait)

```rust
pub op: Box<dyn Operation<T>>,
```

- `dyn Operation<T>` - "любой тип, реализующий Operation<T>"
- `Box` - хранится в куче (размер неизвестен в compile time)
- Динамическая диспетчеризация (vtable)

**Альтернатива - enum:**
```rust
enum OperationType {
    Add(AddOp),
    Mul(MulOp),
    // Нужно добавлять каждую новую операцию!
}
```

**dyn Trait** более гибкий - можно добавлять операции без изменения core кода.

#### 4.3 Arc (Atomic Reference Counting)

```rust
let node = Arc::new(GraphNode { ... });
let ref1 = node.clone();  // ref count = 2
let ref2 = node.clone();  // ref count = 3
// Когда все ссылки уйдут из scope, память освободится
```

**Зачем:**
- Граф - это shared structure (много ссылок на один узел)
- Arc - thread-safe (в отличие от Rc)
- Автоматическое управление памятью

---

## 🎓 Что получили в Milestone 2

### Математически:
✅ Автоматическое дифференцирование
✅ Chain rule implementation
✅ Gradient accumulation
✅ Поддержка сложных выражений

### В коде:
✅ Computational graph construction
✅ Forward pass (automatic)
✅ Backward pass (automatic)
✅ Memory management (Arc + RwLock)
✅ Extensible (trait objects)
✅ 12 unit tests для autograd

---

# Bonus: Scalar Wrapper

## Проблема: Orphan Rule

**Хотим:**
```rust
let y = (3.0 + &x)?;  // scalar + variable
```

**Orphan rule говорит:** Нельзя реализовать чужой trait (Add) для чужого типа (f32).

## Решение: Wrapper Type

```rust
pub struct Scalar<T: DType>(pub T);

// Теперь Scalar - НАШ тип!
impl<T: DType> Add<&Variable<T>> for Scalar<T> {
    fn add(self, var: &Variable<T>) -> Result<Variable<T>> {
        var + self.0  // Просто делегируем
    }
}
```

**Использование:**
```rust
let y = (Scalar(3.0) + &x)?;  // ✅ Работает!
```

---

# 📊 Итоговая архитектура

```
┌─────────────────────────────────────────────┐
│           rustml (facade)                   │
│     Re-exports всего из других crates       │
└─────────────────────────────────────────────┘
                    ↑
        ┌───────────┼───────────┐
        │           │           │
┌───────▼────┐ ┌───▼──────┐ ┌─▼─────────────┐
│ rustml-    │ │ rustml-  │ │ rustml-       │
│ core       │ │ tensor   │ │ autograd      │
│            │ │          │ │               │
│ • DType    │ │ • Tensor │ │ • Variable    │
│ • Device   │ │ • Shape  │ │ • GraphNode   │
│ • Error    │ │ • Ops    │ │ • Operations  │
│ • Backend  │ │          │ │ • Scalar      │
└────────────┘ └──────────┘ └───────────────┘
```

**Зависимости:**
- `rustml-tensor` зависит от `rustml-core`
- `rustml-autograd` зависит от `rustml-core` и `rustml-tensor`
- `rustml` зависит от всех

---

# 🎯 Ключевые takeaways

## Математика:
1. **Тензор** = многомерный массив
2. **Градиент** = производная многомерной функции
3. **Chain rule** = основа автодиффа
4. **Computational graph** = представление вычисления

## Rust:
1. **Ownership** → Zero-copy через references
2. **Generics** → Type-safe без runtime cost
3. **Traits** → Абстракция и extensibility
4. **Arc + RwLock** → Shared mutable state (thread-safe)
5. **Result<T, E>** → Explicit error handling

## Дизайн:
1. **Модульность** → Несколько crates
2. **Абстракция** → Device, DType traits
3. **Extensibility** → dyn Operation trait
4. **Performance** → ndarray backend, zero-copy
5. **Type safety** → Compile-time проверки

---

**Далее:** Milestone 3 - Neural Network Layers 🚀

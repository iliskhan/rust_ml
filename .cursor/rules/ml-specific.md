---
description: "Machine Learning specific coding rules and patterns"
globs: ["**/autograd/**/*.rs", "**/nn/**/*.rs", "**/optim/**/*.rs"]
alwaysApply: true
---

# 🧠 RustML - ML-Specific Rules

## Tensor Operations Safety
```rust
// ВСЕГДА проверяй dimensions перед операциями
fn matmul<T: DType>(a: &Tensor<T>, b: &Tensor<T>) -> Result<Tensor<T>, TensorError> {
    if a.shape()[1] != b.shape()[0] {
        return Err(TensorError::DimensionMismatch {
            expected: a.shape()[1],
            actual: b.shape()[0],
        });
    }
    // implementation...
}
```

## Autograd System Rules
- **Computational graph** должен быть acyclic
- **Memory management** для gradients критичен
- **Lazy evaluation** для больших graphs
- **Clear semantics** для detach/no_grad contexts

## Neural Network Patterns
```rust
// Стандартный pattern для NN modules
pub trait Module {
    type Input;
    type Output;
    type Error;
    
    fn forward(&self, input: Self::Input) -> Result<Self::Output, Self::Error>;
    fn parameters(&self) -> Vec<&Tensor<f32>>;
    fn named_parameters(&self) -> Vec<(String, &Tensor<f32>)>;
}

// Builder pattern для model construction
let model = Sequential::new()
    .add(Linear::new(784, 128)?)
    .add(ReLU::new())
    .add(Dropout::new(0.2))
    .add(Linear::new(128, 10)?);
```

## Numerical Stability
- **NaN/Inf handling** в каждой mathematical operation
- **Epsilon values** для numerical comparisons
- **Overflow protection** для accumulations
- **Gradient clipping** support встроен

## Optimizer Interface
```rust
pub trait Optimizer {
    fn step(&mut self, parameters: &mut [Tensor<f32>]) -> Result<(), OptimizerError>;
    fn zero_grad(&mut self);
    fn learning_rate(&self) -> f32;
    fn set_learning_rate(&mut self, lr: f32);
}
```

## Data Type Constraints
- **f32** по умолчанию для training (speed vs precision balance)
- **f64** для высокая precision где критично
- **Support mixed precision** training
- **Integer types** только для indices и discrete data

## Memory Efficiency Patterns
- **In-place operations** где mathematical возможно
- **View semantics** для slicing без копирования
- **Reference counting** для shared tensors
- **Lazy cloning** с copy-on-write

## GPU Integration Rules
- **Async operations** для GPU kernels
- **Memory pool** для GPU allocations
- **Synchronization points** четко marked
- **Fallback to CPU** если GPU unavailable

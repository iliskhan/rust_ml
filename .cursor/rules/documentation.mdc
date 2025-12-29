---
description: "Documentation standards for RustML library"
globs: ["**/*.rs", "**/examples/**/*", "**/README.md"]
alwaysApply: true
---

# 📚 RustML - Documentation Standards

## Rustdoc Requirements
- **ОБЯЗАТЕЛЬНО** rustdoc для всех public APIs
- **Examples** в docstrings для non-trivial functions
- **Link related functions** с `[function_name]`
- **Type safety guarantees** explicitly documented

## API Documentation Template
```rust
/// Computes matrix multiplication between two tensors.
///
/// # Arguments
/// * `a` - Left tensor with shape `[M, K]`
/// * `b` - Right tensor with shape `[K, N]`
///
/// # Returns
/// Result tensor with shape `[M, N]`
///
/// # Errors
/// * `TensorError::DimensionMismatch` if inner dimensions don't match
/// * `TensorError::DeviceMismatch` if tensors on different devices
///
/// # Performance
/// - Time complexity: O(M × N × K)
/// - Memory usage: allocates M × N elements
/// - Uses SIMD optimizations when available
///
/// # Example
/// ```rust
/// use rustml::Tensor;
/// let a = Tensor::randn([2, 3]);
/// let b = Tensor::randn([3, 4]);
/// let result = a.matmul(&b)?;
/// assert_eq!(result.shape(), &[2, 4]);
/// ```
pub fn matmul<T: DType>(a: &Tensor<T>, b: &Tensor<T>) -> Result<Tensor<T>, TensorError>
```

## Example Standards
- **Working examples** в `examples/` directory
- **Progression от простых к сложным** use cases
- **Comments объясняют** design decisions и trade-offs
- **Realistic scenarios**, не toy problems

## Error Message Guidelines
```rust
// ХОРОШО: конкретное и actionable сообщение
return Err(TensorError::DimensionMismatch {
    operation: "matrix multiplication",
    expected: format!("[{}, K] × [K, {}]", m, n),
    actual: format!("[{}, {}] × [{}, {}]", a_rows, a_cols, b_rows, b_cols),
    hint: "Ensure inner dimensions match: a.shape()[1] == b.shape()[0]".to_string(),
});

// ПЛОХО: generic message
return Err(TensorError::InvalidDimensions);
```

## Documentation Testing
- **cargo test --doc** должен проходить always
- **Examples должны быть runnable** и показывать real usage
- **Performance examples** с benchmark results где applicable

## README Structure для каждого Crate
```markdown
# Crate Name

Brief description и main use case.

## Features
- Feature 1 с example
- Feature 2 с example

## Quick Start
[Working code example]

## Performance
[Benchmark results if applicable]

## Safety
[Memory safety guarantees]
```

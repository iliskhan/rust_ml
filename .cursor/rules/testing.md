---
description: "Testing strategy and requirements for ML library"
globs: ["**/tests/**/*.rs", "**/*test*.rs", "**/src/**/*.rs"]
alwaysApply: true
---

# 🧪 RustML - Testing Rules

## Test Coverage Requirements
- **Каждый public function** должен иметь unit tests
- **Target coverage**: >80% для core modules, >90% для tensor operations
- **Edge cases** обязательны: empty tensors, zero dimensions, NaN/Inf values

## Mathematical Property Testing
```rust
// ОБЯЗАТЕЛЬНО для mathematical operations
#[cfg(test)]
mod tests {
    use proptest::prelude::*;
    
    proptest! {
        #[test]
        fn tensor_add_commutative(a in tensor_strategy(), b in tensor_strategy()) {
            let result1 = &a + &b;
            let result2 = &b + &a;
            assert_eq!(result1, result2);
        }
    }
}
```

## Test Organization
```
crate/
├── src/
│   ├── lib.rs
│   └── ops.rs          # Code с #[cfg(test)] mod tests
├── tests/              # Integration tests
│   ├── tensor_ops.rs
│   └── autograd.rs
└── benches/            # Performance tests
    └── tensor_bench.rs
```

## Required Test Categories

### Unit Tests (в каждом module)
- Basic functionality
- Error conditions
- Boundary values
- Type safety

### Integration Tests (в tests/)
- End-to-end workflows
- Cross-module interactions
- API ergonomics
- Backward compatibility

### Property Tests
- Mathematical properties (commutativity, associativity)
- Invariants (shape preservation, gradient correctness)
- Fuzzing для edge cases

### Performance Tests
- Regression benchmarks
- Memory usage tests
- Comparative benchmarks vs. competitors

## Documentation Tests
- **ВСЕ примеры** в rustdoc должны компилироваться
- `cargo test --doc` должен проходить на CI
- Examples должны быть realistic, не toy code

## Test Naming Conventions
- `test_` prefix для unit tests
- Descriptive names: `test_tensor_add_broadcasts_correctly`
- Group related tests в mod blocks

## Assertions для ML Code
```rust
// Используй approximate equality для floating point
assert_relative_eq!(result, expected, epsilon = 1e-6);

// Shape assertions
assert_eq!(tensor.shape(), &[2, 3, 4]);

// Gradient checks
assert!(tensor.requires_grad());
```

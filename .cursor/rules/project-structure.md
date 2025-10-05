---
description: "RustML project structure and workspace organization rules"
globs: ["**/*.rs", "**/Cargo.toml", "**/lib.rs"]
alwaysApply: true
---

# 📁 RustML - Project Structure Rules

## Workspace Organization
- **ROOT workspace** с несколькими crates для модульности
- Каждый компонент = отдельный crate с четким назначением
- Следуем Rust workspace conventions строго

## Mandatory Crate Structure
```
rustml/                 # Main workspace
├── rustml-core/        # Базовые типы (Tensor, Device, DType)
├── rustml-tensor/      # Tensor operations и broadcasting  
├── rustml-autograd/    # Automatic differentiation
├── rustml-nn/          # Neural network layers
├── rustml-optim/       # Optimizers (SGD, Adam, etc.)
├── rustml-data/        # Data loading и preprocessing
├── rustml-vision/      # Computer vision специфика
├── rustml-nlp/         # NLP компоненты
├── rustml-gpu/         # GPU backends (CUDA/OpenCL)
└── rustml/             # Main crate (re-exports всего)
```

## Directory Naming Rules
- **snake_case** для всех directories
- Префикс `rustml-` для всех crates
- Группировка по функциональности, не по технологии

## File Organization within Crates
```
crate-name/
├── src/
│   ├── lib.rs          # Main entry point
│   ├── error.rs        # Error types (если нужны)
│   └── модули/         # Логические группы функций
├── tests/              # Integration tests
├── benches/            # Benchmarks
├── examples/           # Usage examples
└── Cargo.toml         # Dependencies и metadata
```

## Dependency Management
- **Минимальные** inter-crate dependencies
- Используй feature flags для optional functionality
- Четкое разделение между dev-dependencies и обычными

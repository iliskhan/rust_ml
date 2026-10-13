#![doc = include_str!("../../README.md")]

pub use rustml_autograd as autograd;
pub use rustml_core as core;
pub use rustml_nn as nn;
pub use rustml_nn::{mse_loss, Linear, Sgd};
pub use rustml_tensor as tensor;

pub use rustml_autograd::{IntoScalar, Scalar, Variable};
pub use rustml_core::{
    cpu, Backend, BackendRegistry, Cpu, CpuBackend, DType, DataType, Device, DeviceKind,
    FloatDType, Result, RustMLError,
};
pub use rustml_tensor::ops::TensorOps;
pub use rustml_tensor::shape::IntoShape;
pub use rustml_tensor::tensor::TensorView;
pub use rustml_tensor::{Dimension, Shape, Tensor};

/// Version of the RustML facade crate.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

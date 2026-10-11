//! # RustML Core
//!
//! Core types and traits for the RustML machine learning library.
//!
//! This crate provides the fundamental building blocks:
//! - Device abstraction for CPU/GPU computation
//! - Data type system for tensors
//! - Error handling
//! - Backend traits

pub mod backend;
pub mod device;
pub mod dtype;
pub mod error;

// Re-export main types
pub use backend::{Backend, BackendRegistry, CpuBackend};
pub use device::{cpu, Cpu, Device, DeviceKind};
pub use dtype::{DType, DataType, FloatDType};
pub use error::{Result, RustMLError};

/// Current version of RustML Core
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_types() {
        // Basic smoke test для core types
        let cpu = Cpu::new();
        assert_eq!(cpu.kind(), DeviceKind::Cpu);

        // DType basic checks
        assert_eq!(f32::SIZE, 4);
        assert_eq!(f64::SIZE, 8);
    }
}

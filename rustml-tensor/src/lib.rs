//! # RustML Tensor
//!
//! Tensor operations and data structures for RustML.
//!
//! This crate provides:
//! - Tensor data structure с type safety
//! - Basic arithmetic operations
//! - Indexing и slicing
//! - Broadcasting rules

pub mod ops;
pub mod shape;
pub mod tensor;

// Re-export main types
pub use shape::{Dimension, Shape};
pub use tensor::Tensor;

/// Current version of RustML Tensor
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg(test)]
mod tests {
    use super::*;
    // No additional imports needed for basic test

    #[test]
    fn test_basic_tensor_creation() {
        // Базовый тест создания тензора
        let shape = Shape::new(vec![2, 3]);
        assert_eq!(shape.dims(), &[2, 3]);
        assert_eq!(shape.numel(), 6);
    }
}

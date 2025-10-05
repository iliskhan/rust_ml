//! Error handling для RustML library
//!
//! Централизованная система ошибок для всех компонентов библиотеки.

use thiserror::Error;

/// Main error type for RustML operations
#[derive(Debug, Error)]
pub enum RustMLError {
    /// Dimension mismatch in tensor operations
    #[error("Dimension mismatch: expected {expected}, got {actual}")]
    DimensionMismatch { expected: String, actual: String },
    
    /// Invalid shape for tensor operation
    #[error("Invalid shape: {shape:?} for operation {operation}")]
    InvalidShape { shape: Vec<usize>, operation: String },
    
    /// Device mismatch between tensors
    #[error("Device mismatch: tensor on {tensor_device}, expected {expected_device}")]
    DeviceMismatch { tensor_device: String, expected_device: String },
    
    /// Data type mismatch
    #[error("Data type mismatch: expected {expected}, got {actual}")]
    DataTypeMismatch { expected: String, actual: String },
    
    /// Memory allocation failed
    #[error("Memory allocation failed: requested {size} bytes")]
    AllocationFailed { size: usize },
    
    /// Invalid index access
    #[error("Index out of bounds: index {index} for dimension {dim} of size {size}")]
    IndexOutOfBounds { index: usize, dim: usize, size: usize },
    
    /// Backend error
    #[error("Backend error: {message}")]
    BackendError { message: String },
    
    /// Numerical error (NaN, Inf, etc.)
    #[error("Numerical error: {message}")]
    NumericalError { message: String },
    
    /// Generic I/O error
    #[error("I/O error: {0}")]
    IoError(#[from] std::io::Error),
}

/// Convenience Result type for RustML operations
pub type Result<T> = std::result::Result<T, RustMLError>;

impl RustMLError {
    /// Create dimension mismatch error с удобным API
    pub fn dimension_mismatch<T: std::fmt::Debug>(expected: T, actual: T) -> Self {
        Self::DimensionMismatch {
            expected: format!("{:?}", expected),
            actual: format!("{:?}", actual),
        }
    }
    
    /// Create invalid shape error
    pub fn invalid_shape(shape: &[usize], operation: &str) -> Self {
        Self::InvalidShape {
            shape: shape.to_vec(),
            operation: operation.to_string(),
        }
    }
    
    /// Create backend error
    pub fn backend_error(message: impl Into<String>) -> Self {
        Self::BackendError {
            message: message.into(),
        }
    }
}

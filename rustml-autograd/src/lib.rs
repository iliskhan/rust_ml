//! # RustML Autograd
//!
//! Автоматическое дифференцирование для RustML.
//!
//! Этот crate предоставляет:
//! - Variable для tracking градиентов
//! - Computational graph representation
//! - Forward и backward pass execution
//! - Memory management для градиентов

mod graph;
pub mod ops;
pub mod scalar;
pub mod variable;

// Re-export main types
pub use scalar::{IntoScalar, Scalar};
pub use variable::Variable;

/// Current version of RustML Autograd
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg(test)]
mod tests {
    use super::*;
    use rustml_tensor::Tensor;

    #[test]
    fn test_basic_variable_creation() {
        let tensor = Tensor::<f32>::scalar(2.0);
        let var = Variable::new(tensor, true);
        assert!(var.requires_grad());
    }
}

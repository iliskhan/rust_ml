//! # RustML Autograd
//!
//! Автоматическое дифференцирование для RustML.
//! 
//! Этот crate предоставляет:
//! - Variable для tracking градиентов
//! - Computational graph representation
//! - Forward и backward pass execution
//! - Memory management для градиентов

pub mod variable;
pub mod graph;
pub mod ops;
pub mod scalar;

// Re-export main types
pub use variable::Variable;
pub use graph::{Node, GraphNode, ComputationGraph};
pub use scalar::{Scalar, IntoScalar};

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
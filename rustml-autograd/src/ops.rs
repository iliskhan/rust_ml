//! Operations для Variables с automatic differentiation
//!
//! Реализует arithmetic operations между Variables с gradient tracking

use crate::{Variable, graph::{AddOp, MulOp, AddScalarOp, GraphNode}};
use rustml_core::{DType, Result};
use rustml_tensor::Tensor;
use std::ops::{Add, Mul};
use std::sync::Arc;

// ========================================
// Helper functions для создания operations
// ========================================

/// Создать Variable из результата операции с graph node
fn create_result_variable<T: DType>(
    result_tensor: Tensor<T>,
    requires_grad: bool,
    graph_node: Option<Arc<GraphNode<T>>>,
) -> Variable<T> {
    let mut var = Variable::new(result_tensor, requires_grad);
    if let Some(node) = graph_node {
        var.set_graph_node(node);
    }
    var
}

// ========================================
// Variable + Variable operations
// ========================================

impl<T: DType> Add for &Variable<T> {
    type Output = Result<Variable<T>>;
    
    fn add(self, other: Self) -> Self::Output {
        // Forward pass
        let result_tensor = (self.data() + other.data())?;
        
        // Определяем нужен ли gradient tracking
        let requires_grad = self.requires_grad() || other.requires_grad();
        
        // Создаем graph node если нужен gradient
        let graph_node = if requires_grad {
            let add_op = Box::new(AddOp::new(
                Arc::new(self.clone()),
                Arc::new(other.clone()),
            ));
            let inputs = vec![Arc::new(self.clone()), Arc::new(other.clone())];
            Some(Arc::new(GraphNode::new(add_op, inputs)))
        } else {
            None
        };
        
        Ok(create_result_variable(result_tensor, requires_grad, graph_node))
    }
}

impl<T: DType> Mul for &Variable<T> {
    type Output = Result<Variable<T>>;
    
    fn mul(self, other: Self) -> Self::Output {
        // Forward pass
        let result_tensor = (self.data() * other.data())?;
        
        // Определяем нужен ли gradient tracking
        let requires_grad = self.requires_grad() || other.requires_grad();
        
        // Создаем graph node если нужен gradient
        let graph_node = if requires_grad {
            let mul_op = Box::new(MulOp::new(
                Arc::new(self.clone()),
                Arc::new(other.clone()),
            ));
            let inputs = vec![Arc::new(self.clone()), Arc::new(other.clone())];
            Some(Arc::new(GraphNode::new(mul_op, inputs)))
        } else {
            None
        };
        
        Ok(create_result_variable(result_tensor, requires_grad, graph_node))
    }
}

// ========================================
// Variable + Scalar operations
// ========================================

impl<T: DType> Add<T> for &Variable<T> {
    type Output = Result<Variable<T>>;
    
    fn add(self, scalar: T) -> Self::Output {
        // Forward pass - добавляем scalar ко всем элементам
        let scalar_tensor = Tensor::scalar(scalar);
        let result_tensor = (self.data() + &scalar_tensor)?;
        
        let requires_grad = self.requires_grad();
        
        // Создаем graph node если нужен gradient
        let graph_node = if requires_grad {
            let add_scalar_op = Box::new(AddScalarOp::new(
                Arc::new(self.clone()),
                scalar,
            ));
            let inputs = vec![Arc::new(self.clone())];
            Some(Arc::new(GraphNode::new(add_scalar_op, inputs)))
        } else {
            None
        };
        
        Ok(create_result_variable(result_tensor, requires_grad, graph_node))
    }
}

// Note: Scalar + Variable operation removed due to orphan rule
// Use variable + scalar instead

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_variable_addition() {
        let a = Variable::<f32>::scalar(2.0, false);
        let b = Variable::<f32>::scalar(3.0, false);
        
        let c = (&a + &b).unwrap();
        assert_eq!(c.item().unwrap(), 5.0);
        assert!(!c.requires_grad()); // Neither input required grad
    }
    
    #[test]
    fn test_variable_multiplication() {
        let a = Variable::<f32>::scalar(2.0, false);
        let b = Variable::<f32>::scalar(3.0, false);
        
        let c = (&a * &b).unwrap();
        assert_eq!(c.item().unwrap(), 6.0);
        assert!(!c.requires_grad());
    }
    
    #[test]
    fn test_variable_scalar_addition() {
        let a = Variable::<f32>::scalar(2.0, false);
        
        let c = (&a + 3.0).unwrap();
        assert_eq!(c.item().unwrap(), 5.0);
        assert!(!c.requires_grad());
    }
    
    #[test]
    fn test_gradient_tracking() {
        let a = Variable::<f32>::scalar(2.0, true);  // requires grad
        let b = Variable::<f32>::scalar(3.0, false); // no grad
        
        let c = (&a + &b).unwrap();
        assert!(c.requires_grad()); // Result should require grad
        assert!(c.graph_node().is_some()); // Should have graph node
    }
    
    #[test]
    fn test_no_gradient_tracking() {
        let a = Variable::<f32>::scalar(2.0, false);
        let b = Variable::<f32>::scalar(3.0, false);
        
        let c = (&a + &b).unwrap();
        assert!(!c.requires_grad());
        assert!(c.graph_node().is_none()); // Should not have graph node
    }
}

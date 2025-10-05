//! Computational graph для automatic differentiation
//!
//! Представляет вычислительный граф для tracking операций и gradients

use rustml_core::{DType, Result};
use rustml_tensor::Tensor;
use std::sync::Arc;
use std::fmt;

/// Trait для операций в computational graph
pub trait Node<T: DType>: Send + Sync + fmt::Debug {
    /// Backward pass для этой операции
    fn backward(&self, grad_output: Tensor<T>) -> Result<()>;
    
    /// Имя операции для debugging
    fn name(&self) -> &'static str;
}

/// Graph node содержащий operation и connections
#[derive(Debug)]
pub struct GraphNode<T: DType> {
    /// Операция
    operation: Box<dyn Node<T>>,
    /// Input variables (для backward pass)
    inputs: Vec<Arc<crate::Variable<T>>>,
}

impl<T: DType> GraphNode<T> {
    /// Создать новый graph node
    pub fn new(
        operation: Box<dyn Node<T>>, 
        inputs: Vec<Arc<crate::Variable<T>>>
    ) -> Self {
        Self { operation, inputs }
    }
    
    /// Backward pass через этот node
    pub fn backward(&self, grad_output: Tensor<T>) -> Result<()> {
        self.operation.backward(grad_output)
    }
    
    /// Получить имя операции
    pub fn operation_name(&self) -> &'static str {
        self.operation.name()
    }
}

/// Computational graph manager
#[derive(Debug, Default)]
pub struct ComputationGraph<T: DType> {
    /// Все nodes в графе
    nodes: Vec<Arc<GraphNode<T>>>,
}

impl<T: DType> ComputationGraph<T> {
    /// Создать новый граф
    pub fn new() -> Self {
        Self {
            nodes: Vec::new(),
        }
    }
    
    /// Добавить node в граф
    pub fn add_node(&mut self, node: Arc<GraphNode<T>>) {
        self.nodes.push(node);
    }
    
    /// Очистить граф
    pub fn clear(&mut self) {
        self.nodes.clear();
    }
    
    /// Получить количество nodes
    pub fn len(&self) -> usize {
        self.nodes.len()
    }
    
    /// Проверить пустой ли граф
    pub fn is_empty(&self) -> bool {
        self.nodes.is_empty()
    }
}

// ========================================
// Concrete операции для график
// ========================================

/// Addition operation
#[derive(Debug)]
pub struct AddOp<T: DType> {
    left: Arc<crate::Variable<T>>,
    right: Arc<crate::Variable<T>>,
}

impl<T: DType> AddOp<T> {
    pub fn new(left: Arc<crate::Variable<T>>, right: Arc<crate::Variable<T>>) -> Self {
        Self { left, right }
    }
}

impl<T: DType> Node<T> for AddOp<T> {
    fn backward(&self, grad_output: Tensor<T>) -> Result<()> {
        // d(a + b)/da = 1, d(a + b)/db = 1
        // Градиент просто передается обоим операндам
        
        if self.left.requires_grad() {
            self.left.backward_with_grad(grad_output.clone())?;
        }
        
        if self.right.requires_grad() {
            self.right.backward_with_grad(grad_output)?;
        }
        
        Ok(())
    }
    
    fn name(&self) -> &'static str {
        "Add"
    }
}

/// Multiplication operation
#[derive(Debug)]
pub struct MulOp<T: DType> {
    left: Arc<crate::Variable<T>>,
    right: Arc<crate::Variable<T>>,
}

impl<T: DType> MulOp<T> {
    pub fn new(left: Arc<crate::Variable<T>>, right: Arc<crate::Variable<T>>) -> Self {
        Self { left, right }
    }
}

impl<T: DType> Node<T> for MulOp<T> {
    fn backward(&self, grad_output: Tensor<T>) -> Result<()> {
        // d(a * b)/da = b, d(a * b)/db = a
        
        if self.left.requires_grad() {
            // Градиент левого = right_value * grad_output
            let left_grad = (self.right.data() * &grad_output)?;
            self.left.backward_with_grad(left_grad)?;
        }
        
        if self.right.requires_grad() {
            // Градиент правого = left_value * grad_output  
            let right_grad = (self.left.data() * &grad_output)?;
            self.right.backward_with_grad(right_grad)?;
        }
        
        Ok(())
    }
    
    fn name(&self) -> &'static str {
        "Mul"
    }
}

/// Scalar addition operation (variable + constant)
#[derive(Debug)]
pub struct AddScalarOp<T: DType> {
    input: Arc<crate::Variable<T>>,
    scalar: T,
}

impl<T: DType> AddScalarOp<T> {
    pub fn new(input: Arc<crate::Variable<T>>, scalar: T) -> Self {
        Self { input, scalar }
    }
}

impl<T: DType> Node<T> for AddScalarOp<T> {
    fn backward(&self, grad_output: Tensor<T>) -> Result<()> {
        // d(a + c)/da = 1, где c - константа
        // Градиент просто передается input variable
        
        if self.input.requires_grad() {
            self.input.backward_with_grad(grad_output)?;
        }
        
        Ok(())
    }
    
    fn name(&self) -> &'static str {
        "AddScalar"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Variable;

    #[test]
    fn test_graph_creation() {
        let graph = ComputationGraph::<f32>::new();
        assert!(graph.is_empty());
        assert_eq!(graph.len(), 0);
    }
    
    #[test]
    fn test_add_operation_name() {
        let left = Arc::new(Variable::<f32>::scalar(1.0, true));
        let right = Arc::new(Variable::<f32>::scalar(2.0, true));
        let add_op = AddOp::new(left, right);
        
        assert_eq!(add_op.name(), "Add");
    }
    
    #[test]
    fn test_mul_operation_name() {
        let left = Arc::new(Variable::<f32>::scalar(1.0, true));
        let right = Arc::new(Variable::<f32>::scalar(2.0, true));
        let mul_op = MulOp::new(left, right);
        
        assert_eq!(mul_op.name(), "Mul");
    }
}

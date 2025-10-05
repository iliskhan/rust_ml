//! Variable implementation для automatic differentiation
//!
//! Variable wraps Tensor и добавляет gradient tracking capability

use rustml_core::{DType, RustMLError, Result};
use rustml_tensor::Tensor;
use rustml_tensor::shape::IntoShape;
use crate::graph::GraphNode;
use std::sync::{Arc, RwLock};

/// Variable - основная структура для automatic differentiation
#[derive(Debug, Clone)]
pub struct Variable<T: DType> {
    /// Tensor data
    data: Tensor<T>,
    /// Gradient (если вычислен)
    grad: Arc<RwLock<Option<Tensor<T>>>>,
    /// Требует ли gradient computation
    requires_grad: bool,
    /// Node в computational graph (если есть)
    graph_node: Option<Arc<GraphNode<T>>>,
}

impl<T: DType> Variable<T> {
    /// Создать новый Variable
    pub fn new(data: Tensor<T>, requires_grad: bool) -> Self {
        Self {
            data,
            grad: Arc::new(RwLock::new(None)),
            requires_grad,
            graph_node: None,
        }
    }
    
    /// Создать Variable из scalar значения
    pub fn scalar(value: T, requires_grad: bool) -> Self {
        let tensor = Tensor::scalar(value);
        Self::new(tensor, requires_grad)
    }
    
    /// Получить tensor data
    pub fn data(&self) -> &Tensor<T> {
        &self.data
    }
    
    /// Получить mutable reference на data (только если не требует grad)
    pub fn data_mut(&mut self) -> Result<&mut Tensor<T>> {
        if self.requires_grad {
            return Err(RustMLError::backend_error(
                "Cannot modify data of Variable that requires grad"
            ));
        }
        Ok(&mut self.data)
    }
    
    /// Проверить requires_grad
    pub fn requires_grad(&self) -> bool {
        self.requires_grad
    }
    
    /// Установить requires_grad
    pub fn set_requires_grad(&mut self, requires_grad: bool) {
        self.requires_grad = requires_grad;
        if !requires_grad {
            // Очищаем gradient если больше не нужен
            *self.grad.write().unwrap() = None;
            self.graph_node = None;
        }
    }
    
    /// Получить gradient (если вычислен)
    pub fn grad(&self) -> Option<Tensor<T>> {
        self.grad.read().unwrap().clone()
    }
    
    /// Установить gradient (для internal use)
    pub(crate) fn set_grad(&self, grad: Tensor<T>) {
        *self.grad.write().unwrap() = Some(grad);
    }
    
    /// Очистить gradient
    pub fn zero_grad(&self) {
        *self.grad.write().unwrap() = None;
    }
    
    /// Добавить к gradient (accumulate)
    pub(crate) fn accumulate_grad(&self, grad: Tensor<T>) -> Result<()> {
        let mut current_grad = self.grad.write().unwrap();
        match current_grad.as_mut() {
            Some(existing) => {
                // Добавляем к существующему gradient
                let sum = (existing as &Tensor<T> + &grad)?;
                *existing = sum;
            }
            None => {
                // Устанавливаем новый gradient
                *current_grad = Some(grad);
            }
        }
        Ok(())
    }
    
    /// Получить graph node
    pub(crate) fn graph_node(&self) -> Option<Arc<GraphNode<T>>> {
        self.graph_node.clone()
    }
    
    /// Установить graph node
    pub(crate) fn set_graph_node(&mut self, node: Arc<GraphNode<T>>) {
        self.graph_node = Some(node);
    }
    
    /// Backward pass - вычислить gradients
    pub fn backward(&self) -> Result<()> {
        if !self.requires_grad {
            return Err(RustMLError::backend_error(
                "Variable does not require gradients"
            ));
        }
        
        // Создаем gradient равный 1.0 для scalar или filled ones для tensor
        let initial_grad = if self.data.shape().is_scalar() {
            Tensor::scalar(<T as DType>::one())
        } else {
            Tensor::ones(self.data.shape().dims().to_vec())
        };
        
        // Запускаем backward pass
        self.backward_with_grad(initial_grad)
    }
    
    /// Backward pass с provided gradient
    pub(crate) fn backward_with_grad(&self, grad: Tensor<T>) -> Result<()> {
        // Накапливаем gradient для этой variable
        self.accumulate_grad(grad.clone())?;
        
        // Если есть graph node, продолжаем backward pass
        if let Some(node) = &self.graph_node {
            node.backward(grad)?;
        }
        
        Ok(())
    }
    
    /// Создать detached копию (without gradient tracking)
    pub fn detach(&self) -> Variable<T> {
        Variable::new(self.data.clone(), false)
    }
    
    /// Получить scalar value (только для scalar variables)
    pub fn item(&self) -> Result<T> {
        self.data.item()
    }
}

/// Convenience constructors
impl<T: DType> Variable<T> {
    /// Создать variable заполненный нулями
    pub fn zeros<S: IntoShape>(shape: S, requires_grad: bool) -> Self {
        let tensor = Tensor::zeros(shape);
        Self::new(tensor, requires_grad)
    }
    
    /// Создать variable заполненный единицами
    pub fn ones<S: IntoShape>(shape: S, requires_grad: bool) -> Self {
        let tensor = Tensor::ones(shape);
        Self::new(tensor, requires_grad)
    }
    
    /// Создать variable из vec данных
    pub fn from_vec<S: IntoShape>(
        data: Vec<T>, 
        shape: S, 
        requires_grad: bool
    ) -> Result<Self> {
        let tensor = Tensor::from_vec(data, shape)?;
        Ok(Self::new(tensor, requires_grad))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_variable_creation() {
        let var = Variable::<f32>::scalar(2.0, true);
        assert!(var.requires_grad());
        assert_eq!(var.item().unwrap(), 2.0);
        assert!(var.grad().is_none());
    }
    
    #[test]
    fn test_variable_gradient_management() {
        let var = Variable::<f32>::scalar(2.0, true);
        
        // Initially no gradient
        assert!(var.grad().is_none());
        
        // Set gradient
        let grad_tensor = Tensor::scalar(1.0);
        var.set_grad(grad_tensor);
        assert!(var.grad().is_some());
        assert_eq!(var.grad().unwrap().item().unwrap(), 1.0);
        
        // Clear gradient
        var.zero_grad();
        assert!(var.grad().is_none());
    }
    
    #[test]
    fn test_variable_detach() {
        let var = Variable::<f32>::scalar(2.0, true);
        let detached = var.detach();
        
        assert!(!detached.requires_grad());
        assert_eq!(detached.item().unwrap(), 2.0);
    }
}

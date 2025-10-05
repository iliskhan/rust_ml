//! Основная структура Tensor для RustML

use crate::shape::{Shape, IntoShape};
use rustml_core::{Device, DType, RustMLError, Result, cpu};
use ndarray::{ArrayD, IxDyn};
use std::sync::Arc;

/// Основная структура Tensor
#[derive(Debug, Clone)]
pub struct Tensor<T: DType> {
    /// Данные tensor'а
    data: ArrayD<T>,
    /// Устройство на котором хранится tensor
    device: Arc<dyn Device>,
    /// Требует ли gradient computation
    requires_grad: bool,
}

impl<T: DType> Tensor<T> {
    /// Создать tensor с specified shape и data
    pub fn new(data: ArrayD<T>, device: Arc<dyn Device>) -> Self {
        Self {
            data,
            device,
            requires_grad: false,
        }
    }
    
    /// Создать tensor заполненный zeros
    pub fn zeros<S: IntoShape>(shape: S) -> Self {
        let shape = shape.into_shape();
        let data = ArrayD::zeros(IxDyn(&shape.dims()));
        Self::new(data, Arc::new(cpu()))
    }
    
    /// Создать tensor заполненный ones  
    pub fn ones<S: IntoShape>(shape: S) -> Self {
        let shape = shape.into_shape();
        let data = ArrayD::ones(IxDyn(&shape.dims()));
        Self::new(data, Arc::new(cpu()))
    }
    
    /// Создать tensor из raw data
    pub fn from_vec<S: IntoShape>(data: Vec<T>, shape: S) -> Result<Self> {
        let shape = shape.into_shape();
        
        if data.len() != shape.numel() {
            return Err(RustMLError::dimension_mismatch(
                format!("data length {}", data.len()),
                format!("shape {:?} requires {} elements", shape.dims(), shape.numel())
            ));
        }
        
        let array = ArrayD::from_shape_vec(IxDyn(&shape.dims()), data)
            .map_err(|e| RustMLError::invalid_shape(&shape.dims(), &e.to_string()))?;
            
        Ok(Self::new(array, Arc::new(cpu())))
    }
    
    /// Получить shape tensor'а
    pub fn shape(&self) -> Shape {
        Shape::new(self.data.shape().to_vec())
    }
    
    /// Количество dimensions
    pub fn ndim(&self) -> usize {
        self.data.ndim()
    }
    
    /// Общее количество элементов
    pub fn numel(&self) -> usize {
        self.data.len()
    }
    
    /// Получить устройство
    pub fn device(&self) -> &dyn Device {
        self.device.as_ref()
    }
    
    /// Проверить requires_grad
    pub fn requires_grad(&self) -> bool {
        self.requires_grad
    }
    
    /// Установить requires_grad
    pub fn set_requires_grad(&mut self, requires_grad: bool) {
        self.requires_grad = requires_grad;
    }
    
    /// Получить reference на raw data
    pub fn data(&self) -> &ArrayD<T> {
        &self.data
    }
    
    /// Получить mutable reference на raw data
    pub fn data_mut(&mut self) -> &mut ArrayD<T> {
        &mut self.data
    }
    
    /// Получить Arc clone устройства (для internal use)
    pub(crate) fn device_arc(&self) -> Arc<dyn Device> {
        Arc::clone(&self.device)
    }
    
    /// Создать view tensor'а (zero-copy)
    pub fn view(&self) -> TensorView<'_, T> {
        TensorView {
            data: self.data.view(),
            device: Arc::clone(&self.device),
            requires_grad: self.requires_grad,
        }
    }
    
    /// Reshape tensor (должен сохранять numel)
    pub fn reshape<S: IntoShape>(&self, new_shape: S) -> Result<Self> {
        let new_shape = new_shape.into_shape();
        
        if !self.shape().can_reshape_to(&new_shape) {
            return Err(RustMLError::invalid_shape(
                &new_shape.dims(),
                &format!("cannot reshape from {:?} to {:?}", self.shape().dims(), new_shape.dims())
            ));
        }
        
        let new_data = self.data.clone().into_shape(IxDyn(&new_shape.dims()))
            .map_err(|e| RustMLError::invalid_shape(&new_shape.dims(), &e.to_string()))?;
            
        Ok(Self::new(new_data, Arc::clone(&self.device)))
    }
    
    /// Get scalar value (только для scalar tensors)
    pub fn item(&self) -> Result<T> {
        if !self.shape().is_scalar() {
            return Err(RustMLError::invalid_shape(
                &self.shape().dims(),
                "item() can only be called on scalar tensors"
            ));
        }
        
        Ok(self.data[[]])
    }
}

/// Zero-copy view на tensor data
#[derive(Debug)]
pub struct TensorView<'a, T: DType> {
    data: ndarray::ArrayViewD<'a, T>,
    device: Arc<dyn Device>,
    requires_grad: bool,
}

impl<'a, T: DType> TensorView<'a, T> {
    /// Get shape of view
    pub fn shape(&self) -> Shape {
        Shape::new(self.data.shape().to_vec())
    }
    
    /// Get device
    pub fn device(&self) -> &dyn Device {
        self.device.as_ref()
    }
    
    /// Check requires_grad
    pub fn requires_grad(&self) -> bool {
        self.requires_grad
    }
}

// ========================================
// Convenience constructors
// ========================================

impl<T: DType> Tensor<T> {
    /// Create 1D tensor
    pub fn from_slice(data: &[T]) -> Self {
        let _shape = Shape::new(vec![data.len()]);
        let array = ArrayD::from_shape_vec(IxDyn(&[data.len()]), data.to_vec()).unwrap();
        Self::new(array, Arc::new(cpu()))
    }
    
    /// Create scalar tensor
    pub fn scalar(value: T) -> Self {
        let array = ArrayD::from_shape_vec(IxDyn(&[]), vec![value]).unwrap();
        Self::new(array, Arc::new(cpu()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rustml_core::DeviceKind;

    #[test]
    fn test_tensor_creation() {
        let tensor = Tensor::<f32>::zeros([2, 3]);
        assert_eq!(tensor.shape().dims(), &[2, 3]);
        assert_eq!(tensor.numel(), 6);
        assert_eq!(tensor.device().kind(), DeviceKind::Cpu);
    }
    
    #[test]
    fn test_tensor_from_vec() {
        let data = vec![1.0, 2.0, 3.0, 4.0];
        let tensor = Tensor::from_vec(data, [2, 2]).unwrap();
        assert_eq!(tensor.shape().dims(), &[2, 2]);
        assert_eq!(tensor.numel(), 4);
    }
    
    #[test] 
    fn test_tensor_reshape() {
        let tensor = Tensor::<f32>::ones([2, 3]);
        let reshaped = tensor.reshape([3, 2]).unwrap();
        assert_eq!(reshaped.shape().dims(), &[3, 2]);
        assert_eq!(reshaped.numel(), 6);
    }
    
    #[test]
    fn test_scalar_tensor() {
        let scalar = Tensor::scalar(42.0f32);
        assert!(scalar.shape().is_scalar());
        assert_eq!(scalar.item().unwrap(), 42.0);
    }
    
    #[test]
    fn test_tensor_view() {
        let tensor = Tensor::<f32>::ones([2, 3]);
        let view = tensor.view();
        assert_eq!(view.shape().dims(), &[2, 3]);
    }
}

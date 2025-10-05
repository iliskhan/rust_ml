//! Арифметические операции для tensors

use crate::tensor::Tensor;
use rustml_core::{DType, RustMLError, Result};
use std::ops::{Add, Sub, Mul, Div};

/// Trait для tensor arithmetic operations
pub trait TensorOps<T: DType> {
    /// Element-wise addition
    fn add(&self, other: &Self) -> Result<Self>
    where
        Self: Sized;
        
    /// Element-wise subtraction  
    fn sub(&self, other: &Self) -> Result<Self>
    where
        Self: Sized;
        
    /// Element-wise multiplication
    fn mul(&self, other: &Self) -> Result<Self>
    where
        Self: Sized;
        
    /// Element-wise division
    fn div(&self, other: &Self) -> Result<Self>
    where
        Self: Sized;
        
    /// Matrix multiplication
    fn matmul(&self, other: &Self) -> Result<Self>
    where
        Self: Sized;
}

impl<T: DType> TensorOps<T> for Tensor<T> {
    fn add(&self, other: &Self) -> Result<Self> {
        // Проверяем broadcasting compatibility
        if !self.shape().can_broadcast_with(&other.shape()) {
            return Err(RustMLError::dimension_mismatch(
                format!("{:?}", self.shape().dims()),
                format!("{:?}", other.shape().dims())
            ));
        }
        
        // Для простоты пока требуем exact shape match
        // TODO: implement proper broadcasting
        if self.shape() != other.shape() {
            return Err(RustMLError::dimension_mismatch(
                format!("{:?}", self.shape().dims()),
                format!("{:?} (broadcasting not yet implemented)", other.shape().dims())
            ));
        }
        
        let result_data = self.data() + other.data();
        Ok(Tensor::new(result_data, self.device_arc()))
    }
    
    fn sub(&self, other: &Self) -> Result<Self> {
        if self.shape() != other.shape() {
            return Err(RustMLError::dimension_mismatch(
                format!("{:?}", self.shape().dims()),
                format!("{:?}", other.shape().dims())
            ));
        }
        
        let result_data = self.data() - other.data();
        Ok(Tensor::new(result_data, self.device_arc()))
    }
    
    fn mul(&self, other: &Self) -> Result<Self> {
        if self.shape() != other.shape() {
            return Err(RustMLError::dimension_mismatch(
                format!("{:?}", self.shape().dims()),
                format!("{:?}", other.shape().dims())
            ));
        }
        
        let result_data = self.data() * other.data();
        Ok(Tensor::new(result_data, self.device_arc()))
    }
    
    fn div(&self, other: &Self) -> Result<Self> {
        if self.shape() != other.shape() {
            return Err(RustMLError::dimension_mismatch(
                format!("{:?}", self.shape().dims()),
                format!("{:?}", other.shape().dims())
            ));
        }
        
        let result_data = self.data() / other.data();
        Ok(Tensor::new(result_data, self.device_arc()))
    }
    
    fn matmul(&self, other: &Self) -> Result<Self> {
        let self_shape = self.shape();
        let other_shape = other.shape();
        
        // Проверяем размерности для matrix multiplication
        if self_shape.ndim() < 2 || other_shape.ndim() < 2 {
            return Err(RustMLError::invalid_shape(
                &self_shape.dims(),
                "matmul requires tensors with at least 2 dimensions"
            ));
        }
        
        let self_dims = self_shape.dims();
        let other_dims = other_shape.dims();
        let _m = self_dims[self_dims.len() - 2];
        let k1 = self_dims[self_dims.len() - 1];
        let k2 = other_dims[other_dims.len() - 2];
        let _n = other_dims[other_dims.len() - 1];
        
        if k1 != k2 {
            return Err(RustMLError::dimension_mismatch(
                format!("inner dimensions: {} and {}", k1, k2),
                "inner dimensions must match for matrix multiplication".to_string()
            ));
        }
        
        // Для простых 2D matrices
        if self_shape.ndim() == 2 && other_shape.ndim() == 2 {
            // TODO: implement proper matrix multiplication
            // Пока используем element-wise multiplication как placeholder
            return TensorOps::mul(self, other);
        }
        
        // TODO: implement batched матрицы
        Err(RustMLError::invalid_shape(
            &self_shape.dims(),
            "batched matmul not yet implemented"
        ))
    }
}

// ========================================
// Operator overloading для ergonomic API
// ========================================

impl<T: DType> Add for &Tensor<T> {
    type Output = Result<Tensor<T>>;
    
    fn add(self, other: Self) -> Self::Output {
        TensorOps::add(self, other)
    }
}

impl<T: DType> Sub for &Tensor<T> {
    type Output = Result<Tensor<T>>;
    
    fn sub(self, other: Self) -> Self::Output {
        TensorOps::sub(self, other)
    }
}

impl<T: DType> Mul for &Tensor<T> {
    type Output = Result<Tensor<T>>;
    
    fn mul(self, other: Self) -> Self::Output {
        TensorOps::mul(self, other)
    }
}

impl<T: DType> Div for &Tensor<T> {
    type Output = Result<Tensor<T>>;
    
    fn div(self, other: Self) -> Self::Output {
        TensorOps::div(self, other)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    // No unused imports needed for these tests

    #[test]
    fn test_tensor_basic_creation() {
        let tensor = Tensor::<f32>::zeros([2, 3]);
        assert_eq!(tensor.shape().dims(), &[2, 3]);
        assert_eq!(tensor.numel(), 6);
        assert!(!tensor.requires_grad());
    }
    
    #[test]
    fn test_tensor_arithmetic() {
        let a = Tensor::<f32>::ones([2, 2]);
        let b = Tensor::<f32>::ones([2, 2]);
        
        let c = (&a + &b).unwrap();
        assert_eq!(c.shape().dims(), &[2, 2]);
        
        // Check that result contains 2.0s (1.0 + 1.0)
        for &val in c.data().iter() {
            assert_eq!(val, 2.0);
        }
    }
    
    #[test]
    fn test_tensor_from_vec() {
        let data = vec![1.0, 2.0, 3.0, 4.0];
        let tensor = Tensor::<f32>::from_vec(data, [2, 2]).unwrap();
        assert_eq!(tensor.shape().dims(), &[2, 2]);
        assert_eq!(tensor.data()[[0, 0]], 1.0);
        assert_eq!(tensor.data()[[1, 1]], 4.0);
    }
    
    #[test]
    fn test_scalar_tensor() {
        let scalar = Tensor::scalar(42.0f32);
        assert!(scalar.shape().is_scalar());
        assert_eq!(scalar.item().unwrap(), 42.0);
    }
    
    #[test]
    fn test_dimension_mismatch_error() {
        let a = Tensor::<f32>::ones([2, 3]);
        let b = Tensor::<f32>::ones([3, 2]);
        
        let result = &a + &b;
        assert!(result.is_err());
    }
}

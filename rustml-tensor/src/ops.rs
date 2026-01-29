//! Арифметические операции для tensors

use crate::tensor::Tensor;
use rustml_core::{DType, Result, RustMLError};
use std::ops::{Add, Div, Mul, Sub};

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
                format!("{:?}", other.shape().dims()),
            ));
        }

        // Для простоты пока требуем exact shape match
        // TODO: implement proper broadcasting
        if self.shape() != other.shape() {
            return Err(RustMLError::dimension_mismatch(
                format!("{:?}", self.shape().dims()),
                format!(
                    "{:?} (broadcasting not yet implemented)",
                    other.shape().dims()
                ),
            ));
        }

        let result_data = self.data() + other.data();
        Ok(Tensor::new(result_data, self.device_arc()))
    }

    fn sub(&self, other: &Self) -> Result<Self> {
        if self.shape() != other.shape() {
            return Err(RustMLError::dimension_mismatch(
                format!("{:?}", self.shape().dims()),
                format!("{:?}", other.shape().dims()),
            ));
        }

        let result_data = self.data() - other.data();
        Ok(Tensor::new(result_data, self.device_arc()))
    }

    fn mul(&self, other: &Self) -> Result<Self> {
        if self.shape() != other.shape() {
            return Err(RustMLError::dimension_mismatch(
                format!("{:?}", self.shape().dims()),
                format!("{:?}", other.shape().dims()),
            ));
        }

        let result_data = self.data() * other.data();
        Ok(Tensor::new(result_data, self.device_arc()))
    }

    fn div(&self, other: &Self) -> Result<Self> {
        if self.shape() != other.shape() {
            return Err(RustMLError::dimension_mismatch(
                format!("{:?}", self.shape().dims()),
                format!("{:?}", other.shape().dims()),
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
                "matmul requires tensors with at least 2 dimensions",
            ));
        }

        let self_dims = self_shape.dims();
        let other_dims = other_shape.dims();
        let k1 = self_dims[1];
        let k2 = other_dims[other_dims.len() - 2];

        let m = self_dims[0];
        let n = other_dims[1];

        if k1 != k2 {
            return Err(RustMLError::dimension_mismatch(
                format!("inner dimensions: {} and {}", k1, k2),
                "inner dimensions must match for matrix multiplication".to_string(),
            ));
        }

        // Для простых 2D matrices
        if self_shape.ndim() == 2 && other_shape.ndim() == 2 {
            // TODO: implement proper matrix multiplication
            // Пока используем element-wise multiplication как placeholder
            // return TensorOps::mul(self, other);
            let mut result = Tensor::<T>::zeros([m, n]);
            for i in 0..m {
                for j in 0..n {
                    for k in 0..self_dims[1] {
                        result.data_mut()[[i, j]] =
                            result.data_mut()[[i, j]] + self.data()[[i, k]] * other.data()[[k, j]];
                    }
                }
            }
            return Ok(result);
        }

        // TODO: implement batched матрицы
        Err(RustMLError::invalid_shape(
            &self_shape.dims(),
            "batched matmul not yet implemented",
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

    #[test]
    fn test_matmul_2x2() {
        // A = [[1, 2], [3, 4]]
        // B = [[5, 6], [7, 8]]
        // C = [[19, 22], [43, 50]]
        let a = Tensor::from_vec(vec![1.0f32, 2.0, 3.0, 4.0], [2, 2]).unwrap();
        let b = Tensor::from_vec(vec![5.0f32, 6.0, 7.0, 8.0], [2, 2]).unwrap();

        let c = TensorOps::matmul(&a, &b).unwrap();

        assert_eq!(c.shape().dims(), &[2, 2]);
        assert_eq!(c.data()[[0, 0]], 19.0);
        assert_eq!(c.data()[[0, 1]], 22.0);
        assert_eq!(c.data()[[1, 0]], 43.0);
        assert_eq!(c.data()[[1, 1]], 50.0);
    }

    #[test]
    fn test_matmul_2x3_3x2() {
        // A: [2, 3], B: [3, 2] -> C: [2, 2]
        let a = Tensor::from_vec(vec![1.0f32, 2.0, 3.0, 4.0, 5.0, 6.0], [2, 3]).unwrap();
        let b = Tensor::from_vec(vec![7.0f32, 8.0, 9.0, 10.0, 11.0, 12.0], [3, 2]).unwrap();

        let c = TensorOps::matmul(&a, &b).unwrap();

        assert_eq!(c.shape().dims(), &[2, 2]);
        // C[0][0] = 1*7 + 2*9 + 3*11 = 7 + 18 + 33 = 58
        assert_eq!(c.data()[[0, 0]], 58.0);
    }

    #[test]
    fn test_matmul_dimension_error() {
        let a = Tensor::<f32>::zeros([2, 3]);
        let b = Tensor::<f32>::zeros([4, 2]); // 4 != 3

        assert!(TensorOps::matmul(&a, &b).is_err());
    }
}

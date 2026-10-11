//! Арифметические операции для tensors

use crate::tensor::Tensor;
use rustml_core::{DType, Result, RustMLError};
use std::ops::{Add, Div, Mul, Sub};

/// Tensor arithmetic on available CPU devices.
///
/// Element-wise operations use trailing-axis broadcasting. Integer overflow
/// and integer division by zero return [`RustMLError::NumericalError`] in all
/// build profiles. Floating point operations follow IEEE 754, including NaN
/// and infinity propagation. Results preserve the left operand's device.
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

    /// Multiply two 2D matrices; higher ranks are currently unsupported.
    fn matmul(&self, other: &Self) -> Result<Self>
    where
        Self: Sized;
}

impl<T: DType> Tensor<T> {
    fn check_binary_device(&self, other: &Self) -> Result<()> {
        if self.device().kind() != other.device().kind() {
            return Err(RustMLError::DeviceMismatch {
                tensor_device: other.device().kind().to_string(),
                expected_device: self.device().kind().to_string(),
            });
        }
        self.ensure_cpu()?;
        other.ensure_cpu()
    }

    fn elementwise(
        &self,
        other: &Self,
        operation: &str,
        compute: impl Fn(T, T) -> Option<T>,
    ) -> Result<Self> {
        self.check_binary_device(other)?;
        let shape = self.shape().broadcast_with(&other.shape())?;
        let mut result = Self::try_zeros(shape.clone())?;
        let left = self
            .data()
            .broadcast(ndarray::IxDyn(shape.dims()))
            .ok_or_else(|| RustMLError::invalid_shape(shape.dims(), operation))?;
        let right = other
            .data()
            .broadcast(ndarray::IxDyn(shape.dims()))
            .ok_or_else(|| RustMLError::invalid_shape(shape.dims(), operation))?;
        ndarray::Zip::from(result.data_mut())
            .and(left)
            .and(right)
            .fold(Ok(()), |status: Result<()>, output, &a, &b| {
                status?;
                *output = compute(a, b).ok_or_else(|| RustMLError::NumericalError {
                    message: format!("{} overflow or invalid operands in {}", T::NAME, operation),
                })?;
                Ok(())
            })?;
        Ok(Self::new(result.into_data(), self.device_arc()))
    }
}

impl<T: DType> TensorOps<T> for Tensor<T> {
    fn add(&self, other: &Self) -> Result<Self> {
        self.elementwise(other, "addition", T::checked_add)
    }

    fn sub(&self, other: &Self) -> Result<Self> {
        self.elementwise(other, "subtraction", T::checked_sub)
    }

    fn mul(&self, other: &Self) -> Result<Self> {
        self.elementwise(other, "multiplication", T::checked_mul)
    }

    fn div(&self, other: &Self) -> Result<Self> {
        self.elementwise(other, "division", T::checked_div)
    }

    fn matmul(&self, other: &Self) -> Result<Self> {
        self.check_binary_device(other)?;
        if self.ndim() != 2 || other.ndim() != 2 {
            return Err(RustMLError::invalid_shape(
                if self.ndim() != 2 {
                    self.data().shape()
                } else {
                    other.data().shape()
                },
                "matmul currently requires two 2D tensors",
            ));
        }
        let m = self.data().shape()[0];
        let inner = self.data().shape()[1];
        let n = other.data().shape()[1];
        if inner != other.data().shape()[0] {
            return Err(RustMLError::dimension_mismatch(
                inner,
                other.data().shape()[0],
            ));
        }
        let mut result = Self::try_zeros([m, n])?;
        for i in 0..m {
            for j in 0..n {
                let mut sum = <T as DType>::zero();
                for k in 0..inner {
                    let product = self.data()[[i, k]].checked_mul(other.data()[[k, j]]);
                    sum = product
                        .and_then(|value| sum.checked_add(value))
                        .ok_or_else(|| RustMLError::NumericalError {
                            message: format!("{} overflow in matrix multiplication", T::NAME),
                        })?;
                }
                result.data_mut()[[i, j]] = sum;
            }
        }
        Ok(Self::new(result.into_data(), self.device_arc()))
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

    #[test]
    fn test_all_elementwise_operations_broadcast_rows_columns_and_scalars() {
        let column = Tensor::from_vec(vec![8i32, 16], [2, 1]).unwrap();
        let row = Tensor::from_slice(&[2i32, 4]);
        for (actual, expected) in [
            ((&column + &row).unwrap(), vec![10, 12, 18, 20]),
            ((&column - &row).unwrap(), vec![6, 4, 14, 12]),
            ((&column * &row).unwrap(), vec![16, 32, 32, 64]),
            ((&column / &row).unwrap(), vec![4, 2, 8, 4]),
            ((&row - &column).unwrap(), vec![-6, -4, -14, -12]),
        ] {
            assert_eq!(actual.shape().dims(), &[2, 2]);
            assert_eq!(actual.data().iter().copied().collect::<Vec<_>>(), expected);
        }
        let scalar = Tensor::scalar(2i32);
        assert_eq!(
            (&row * &scalar)
                .unwrap()
                .data()
                .iter()
                .copied()
                .collect::<Vec<_>>(),
            vec![4, 8]
        );
        assert_eq!(
            (&scalar / &row)
                .unwrap()
                .data()
                .iter()
                .copied()
                .collect::<Vec<_>>(),
            vec![1, 0]
        );
        assert_eq!((&scalar + &scalar).unwrap().item().unwrap(), 4);
    }

    #[test]
    fn test_empty_broadcast_all_operations_and_incompatible_shapes() {
        let empty = Tensor::<i32>::zeros([0, 3]);
        let row = Tensor::<i32>::ones([1, 3]);
        let zero = Tensor::scalar(0i32);
        for result in [&empty + &row, &row - &empty, &empty * &zero, &empty / &zero] {
            let result = result.unwrap();
            assert_eq!(result.shape().dims(), &[0, 3]);
            assert_eq!(result.numel(), 0);
        }
        let bad = Tensor::<i32>::zeros([2, 3]);
        for result in [&empty + &bad, &empty - &bad, &empty * &bad, &empty / &bad] {
            assert!(matches!(result, Err(RustMLError::DimensionMismatch { .. })));
        }
    }

    #[test]
    fn test_checked_integer_arithmetic_all_supported_widths() {
        fn check_unsigned<T: DType>(max: T) {
            let high = Tensor::scalar(max);
            let one = Tensor::scalar(<T as DType>::one());
            let zero = Tensor::scalar(<T as DType>::zero());
            let two = (&one + &one).unwrap();
            for result in [&high + &one, &zero - &one, &high * &two, &high / &zero] {
                assert!(matches!(result, Err(RustMLError::NumericalError { .. })));
            }
        }
        fn check_signed<T: DType>(min: T, max: T, minus_one: T) {
            let low = Tensor::scalar(min);
            let high = Tensor::scalar(max);
            let one = Tensor::scalar(<T as DType>::one());
            let zero = Tensor::scalar(<T as DType>::zero());
            let negative = Tensor::scalar(minus_one);
            for result in [
                &high + &one,
                &low - &one,
                &low * &negative,
                &low / &negative,
                &one / &zero,
            ] {
                assert!(matches!(result, Err(RustMLError::NumericalError { .. })));
            }
        }
        check_unsigned(u32::MAX);
        check_unsigned(u64::MAX);
        check_signed(i32::MIN, i32::MAX, -1);
        check_signed(i64::MIN, i64::MAX, -1);
    }

    #[test]
    fn test_float_ieee_values_propagate() {
        let values = Tensor::from_slice(&[1.0f64, 0.0, f64::NAN, f64::MAX]);
        let zero = Tensor::scalar(0.0f64);
        let quotients = (&values / &zero).unwrap();
        assert!(quotients.data()[[0]].is_infinite());
        assert!(quotients.data()[[1]].is_nan());
        assert!(quotients.data()[[2]].is_nan());
        assert!((&values * &Tensor::scalar(2.0)).unwrap().data()[[3]].is_infinite());
        assert!(values.sum_to_shape([]).unwrap().item().unwrap().is_nan());
    }

    #[test]
    fn test_matmul_checked_accumulation_rank_and_empty_inner_axis() {
        let large = Tensor::from_vec(vec![i32::MAX, i32::MAX], [1, 2]).unwrap();
        let ones = Tensor::<i32>::ones([2, 1]);
        assert!(matches!(
            large.matmul(&ones),
            Err(RustMLError::NumericalError { .. })
        ));
        let large = Tensor::from_vec(vec![i32::MAX], [1, 1]).unwrap();
        let two = Tensor::from_vec(vec![2], [1, 1]).unwrap();
        assert!(matches!(
            large.matmul(&two),
            Err(RustMLError::NumericalError { .. })
        ));
        assert!(Tensor::<i32>::ones([1, 2, 2]).matmul(&ones).is_err());
        assert!(ones.matmul(&Tensor::<i32>::ones([1, 1, 1])).is_err());
        let result = Tensor::<i32>::zeros([2, 0])
            .matmul(&Tensor::zeros([0, 3]))
            .unwrap();
        assert_eq!(result.shape().dims(), &[2, 3]);
        assert!(result.data().iter().all(|&value| value == 0));
    }

    #[test]
    fn test_device_metadata_preserved_and_unavailable_devices_rejected() {
        use rustml_core::{Device, DeviceKind};
        use std::sync::Arc;

        #[derive(Debug)]
        struct NamedCpu {
            available: bool,
        }
        impl Device for NamedCpu {
            fn kind(&self) -> DeviceKind {
                DeviceKind::Cpu
            }
            fn is_available(&self) -> bool {
                self.available
            }
            fn name(&self) -> &str {
                "named CPU"
            }
            fn synchronize(&self) -> Result<()> {
                Ok(())
            }
        }
        let device: Arc<dyn Device> = Arc::new(NamedCpu { available: true });
        let a = Tensor::new(Tensor::<i32>::ones([2, 2]).into_data(), Arc::clone(&device));
        for result in [
            (&a + &a).unwrap(),
            a.matmul(&a).unwrap(),
            a.transpose().unwrap(),
            a.reshape([4]).unwrap(),
            a.sum_to_shape([]).unwrap(),
        ] {
            assert_eq!(result.device().name(), "named CPU");
        }
        let unavailable = Tensor::new(a.data().clone(), Arc::new(NamedCpu { available: false }));
        assert!((&a + &unavailable).is_err());
        assert!(unavailable.matmul(&a).is_err());
        assert!(unavailable.transpose().is_err());
        assert!(unavailable.reshape([4]).is_err());
        assert!(unavailable.sum_to_shape([]).is_err());
    }
}

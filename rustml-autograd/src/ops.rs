//! Differentiable arithmetic, ReLU, 2D matrix multiplication and all-element mean.

use crate::{graph::Operation, Variable};
use rustml_core::{FloatDType, Result, RustMLError};
use rustml_tensor::{ops::TensorOps, Tensor};
use std::ops::{Add, Mul, Sub};

impl<T: FloatDType> Variable<T> {
    /// Element-wise ReLU on available CPU devices, preserving shape and dtype.
    /// The derivative is 1 for positive inputs and 0 for negative inputs and
    /// both signed zeros. NaN inputs remain NaN in the output and derivative;
    /// gradient multiplication otherwise follows IEEE 754. Empty inputs work.
    pub fn relu(&self) -> Result<Self> {
        if self.data().device().kind() != rustml_core::DeviceKind::Cpu
            || !self.data().device().is_available()
        {
            return Err(RustMLError::backend_error(
                "only available CPU devices are supported",
            ));
        }
        let mut data = self.data().clone();
        data.data_mut().mapv_inplace(|value| {
            if value.is_nan() || value > <T as rustml_core::DType>::zero() {
                value
            } else {
                <T as rustml_core::DType>::zero()
            }
        });
        let operation = self
            .requires_grad()
            .then(|| Operation::Relu([self.clone()]));
        Ok(Self::from_operation(data, self.requires_grad(), operation))
    }

    /// Multiply two 2D matrices. Vector, batched and broadcast matmul are unsupported.
    pub fn matmul(&self, other: &Self) -> Result<Self> {
        let data = self.data().matmul(other.data())?;
        let requires_grad = self.requires_grad() || other.requires_grad();
        let operation = requires_grad.then(|| Operation::Matmul([self.clone(), other.clone()]));
        Ok(Self::from_operation(data, requires_grad, operation))
    }

    /// Mean of every element, returning a scalar. Empty inputs are rejected.
    /// Floating point values follow IEEE 754, as tensor arithmetic does.
    ///
    /// ```
    /// use rustml_autograd::Variable;
    /// let x = Variable::from_vec(vec![2.0_f64, 4.0], [2], true)?;
    /// let mean = x.mean()?;
    /// assert_eq!(mean.item()?, 3.0);
    /// mean.backward()?;
    /// assert_eq!(x.grad().unwrap().data()[[0]], 0.5);
    /// # Ok::<(), rustml_core::RustMLError>(())
    /// ```
    pub fn mean(&self) -> Result<Self> {
        if self.data().numel() == 0 {
            return Err(RustMLError::invalid_shape(
                self.data().shape().dims(),
                "mean requires a nonempty tensor",
            ));
        }
        let count = T::from(self.data().numel()).ok_or_else(|| RustMLError::NumericalError {
            message: "mean element count cannot be represented".into(),
        })?;
        let sum = self.data().sum_to_shape([])?;
        let data = (&sum / &Tensor::scalar(count))?;
        let operation = self
            .requires_grad()
            .then(|| Operation::Mean([self.clone()], count));
        Ok(Self::from_operation(data, self.requires_grad(), operation))
    }
}

impl<T: FloatDType> Sub for &Variable<T> {
    type Output = Result<Variable<T>>;

    fn sub(self, other: Self) -> Self::Output {
        let data = (self.data() - other.data())?;
        let requires_grad = self.requires_grad() || other.requires_grad();
        let operation = requires_grad.then(|| Operation::Sub([self.clone(), other.clone()]));
        Ok(Variable::from_operation(data, requires_grad, operation))
    }
}

impl<T: FloatDType> Add for &Variable<T> {
    type Output = Result<Variable<T>>;

    fn add(self, other: Self) -> Self::Output {
        let data = (self.data() + other.data())?;
        let requires_grad = self.requires_grad() || other.requires_grad();
        let operation = requires_grad.then(|| Operation::Add([self.clone(), other.clone()]));
        Ok(Variable::from_operation(data, requires_grad, operation))
    }
}

impl<T: FloatDType> Mul for &Variable<T> {
    type Output = Result<Variable<T>>;

    fn mul(self, other: Self) -> Self::Output {
        let data = (self.data() * other.data())?;
        let requires_grad = self.requires_grad() || other.requires_grad();
        let operation = requires_grad.then(|| Operation::Mul([self.clone(), other.clone()]));
        Ok(Variable::from_operation(data, requires_grad, operation))
    }
}

impl<T: FloatDType> Add<T> for &Variable<T> {
    type Output = Result<Variable<T>>;

    fn add(self, scalar: T) -> Self::Output {
        self + &Variable::scalar(scalar, false)
    }
}

impl<T: FloatDType> Mul<T> for &Variable<T> {
    type Output = Result<Variable<T>>;

    fn mul(self, scalar: T) -> Self::Output {
        self * &Variable::scalar(scalar, false)
    }
}

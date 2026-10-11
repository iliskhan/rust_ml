//! Scalar wrappers for arithmetic with a scalar on the left.

use crate::Variable;
use rustml_core::{FloatDType, Result};
use std::ops::{Add, Mul};

/// A scalar operand that can appear on either side of variable arithmetic.
///
/// ```
/// use rustml_autograd::{Scalar, Variable};
/// let x = Variable::scalar(2.0_f32, true);
/// let y = (Scalar(3.0) * &x).unwrap();
/// assert_eq!(y.item().unwrap(), 6.0);
/// y.backward().unwrap();
/// assert_eq!(x.grad().unwrap().item().unwrap(), 3.0);
/// ```
#[derive(Debug, Clone, Copy)]
pub struct Scalar<T: FloatDType>(pub T);

impl<T: FloatDType> Add<&Variable<T>> for Scalar<T> {
    type Output = Result<Variable<T>>;

    fn add(self, var: &Variable<T>) -> Self::Output {
        var + self.0
    }
}

impl<T: FloatDType> Mul<&Variable<T>> for Scalar<T> {
    type Output = Result<Variable<T>>;

    fn mul(self, var: &Variable<T>) -> Self::Output {
        var * self.0
    }
}

pub trait IntoScalar<T: FloatDType> {
    fn into_scalar(self) -> Scalar<T>;
}

impl<T: FloatDType> IntoScalar<T> for T {
    fn into_scalar(self) -> Scalar<T> {
        Scalar(self)
    }
}

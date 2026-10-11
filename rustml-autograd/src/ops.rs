//! Differentiable addition and multiplication, including scalar operands.

use crate::{graph::Operation, Variable};
use rustml_core::{FloatDType, Result};
use std::ops::{Add, Mul};

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

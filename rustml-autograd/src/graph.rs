//! Saved inputs for the supported differentiable operations.

use crate::Variable;
use rustml_core::{FloatDType, Result};
use rustml_tensor::Tensor;

pub(crate) enum Operation<T: FloatDType> {
    Add([Variable<T>; 2]),
    Mul([Variable<T>; 2]),
}

impl<T: FloatDType> Operation<T> {
    pub(crate) fn inputs(&self) -> &[Variable<T>; 2] {
        match self {
            Self::Add(inputs) | Self::Mul(inputs) => inputs,
        }
    }

    /// A local vector-Jacobian product, reduced over broadcast dimensions.
    /// Scheduling and accumulation belong to the backward traversal.
    pub(crate) fn input_grad(&self, index: usize, grad: &Tensor<T>) -> Result<Tensor<T>> {
        let inputs = self.inputs();
        match self {
            Self::Add(_) => grad.sum_to_shape(inputs[index].data().shape()),
            Self::Mul(_) => {
                (grad * inputs[1 - index].data())?.sum_to_shape(inputs[index].data().shape())
            }
        }
    }
}

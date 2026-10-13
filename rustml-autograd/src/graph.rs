//! Saved inputs for the supported differentiable operations.

use crate::Variable;
use rustml_core::{FloatDType, Result};
use rustml_tensor::{ops::TensorOps, Tensor};

pub(crate) enum Operation<T: FloatDType> {
    Add([Variable<T>; 2]),
    Mul([Variable<T>; 2]),
    Sub([Variable<T>; 2]),
    Matmul([Variable<T>; 2]),
    Mean([Variable<T>; 1], T),
}

impl<T: FloatDType> Operation<T> {
    pub(crate) fn inputs(&self) -> &[Variable<T>] {
        match self {
            Self::Add(inputs) | Self::Mul(inputs) | Self::Sub(inputs) | Self::Matmul(inputs) => {
                inputs
            }
            Self::Mean(inputs, _) => inputs,
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
            Self::Sub(_) => {
                let reduced = grad.sum_to_shape(inputs[index].data().shape())?;
                if index == 0 {
                    Ok(reduced)
                } else {
                    &reduced * &Tensor::scalar(-<T as rustml_core::DType>::one())
                }
            }
            Self::Matmul(_) => {
                if index == 0 {
                    grad.matmul(&inputs[1].data().transpose()?)
                } else {
                    inputs[0].data().transpose()?.matmul(grad)
                }
            }
            Self::Mean(_, count) => {
                let mut result = inputs[0].data().clone();
                result.data_mut().fill(grad.item()? / *count);
                Ok(result)
            }
        }
    }
}

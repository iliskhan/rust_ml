//! Tensor values with shared identity and automatic differentiation.

use crate::graph::Operation;
use rustml_core::{DType, DeviceKind, FloatDType, Result, RustMLError};
use rustml_tensor::{shape::IntoShape, Tensor};
use std::collections::{HashMap, HashSet};
use std::fmt;
use std::sync::{Arc, RwLock};

/// A floating-point value in a computation graph.
///
/// Cloning shares the value, graph and gradient. Use [`Self::detach`] for an
/// independent value without gradient tracking. Data and tracking can only be
/// changed on a uniquely owned leaf, so saved forward values cannot go stale.
///
/// Integer tensors are supported by `rustml_tensor`, but not by autograd:
/// ```compile_fail
/// use rustml_autograd::Variable;
/// let _ = Variable::scalar(2_i32, true);
/// ```
#[derive(Clone)]
pub struct Variable<T: FloatDType> {
    inner: Arc<VariableInner<T>>,
}

struct VariableInner<T: FloatDType> {
    data: Tensor<T>,
    grad: RwLock<Option<Tensor<T>>>,
    requires_grad: bool,
    operation: Option<Operation<T>>,
}

impl<T: FloatDType> fmt::Debug for Variable<T> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Variable")
            .field("data", self.data())
            .field("requires_grad", &self.requires_grad())
            .field("is_leaf", &self.inner.operation.is_none())
            .finish_non_exhaustive()
    }
}

impl<T: FloatDType> Variable<T> {
    /// Create a leaf variable.
    pub fn new(data: Tensor<T>, requires_grad: bool) -> Self {
        Self::from_operation(data, requires_grad, None)
    }

    pub(crate) fn from_operation(
        data: Tensor<T>,
        requires_grad: bool,
        operation: Option<Operation<T>>,
    ) -> Self {
        Self {
            inner: Arc::new(VariableInner {
                data,
                grad: RwLock::new(None),
                requires_grad,
                operation,
            }),
        }
    }

    /// Create a scalar leaf.
    pub fn scalar(value: T, requires_grad: bool) -> Self {
        Self::new(Tensor::scalar(value), requires_grad)
    }

    /// Borrow the saved forward value.
    pub fn data(&self) -> &Tensor<T> {
        &self.inner.data
    }

    fn unique_leaf(&mut self) -> Result<&mut VariableInner<T>> {
        let inner = Arc::get_mut(&mut self.inner).ok_or_else(|| {
            RustMLError::backend_error(
                "Cannot modify a shared Variable; drop its clones and graph first",
            )
        })?;
        if inner.operation.is_some() {
            return Err(RustMLError::backend_error(
                "Cannot modify an operation result; detach it first",
            ));
        }
        Ok(inner)
    }

    /// Mutate a uniquely owned leaf and clear its previous gradient.
    ///
    /// This also supports trainable parameters after all graphs and clones
    /// referring to the parameter have been dropped. Rejected mutations leave
    /// both data and gradients unchanged.
    pub fn data_mut(&mut self) -> Result<&mut Tensor<T>> {
        let inner = self.unique_leaf()?;
        *inner.grad.get_mut().unwrap() = None;
        Ok(&mut inner.data)
    }

    pub fn requires_grad(&self) -> bool {
        self.inner.requires_grad
    }

    /// Change tracking on a uniquely owned leaf and clear its gradient.
    pub fn set_requires_grad(&mut self, requires_grad: bool) -> Result<()> {
        let inner = self.unique_leaf()?;
        inner.requires_grad = requires_grad;
        *inner.grad.get_mut().unwrap() = None;
        Ok(())
    }

    /// Copy the accumulated gradient, if present.
    pub fn grad(&self) -> Option<Tensor<T>> {
        self.inner.grad.read().unwrap().clone()
    }

    /// Clear only this value's gradient, including all aliases of this value.
    pub fn zero_grad(&self) {
        *self.inner.grad.write().unwrap() = None;
    }

    fn accumulate_grad(&self, grad: &Tensor<T>) -> Result<()> {
        let mut current = self.inner.grad.write().unwrap();
        *current = Some(match current.as_ref() {
            Some(existing) => (existing + grad)?,
            None => grad.clone(),
        });
        Ok(())
    }

    fn id(&self) -> *const VariableInner<T> {
        Arc::as_ptr(&self.inner)
    }

    /// Iterative DFS postorder: every tracked value occurs exactly once.
    fn topological_order(&self) -> Vec<&Self> {
        let mut order = Vec::new();
        let mut visited = HashSet::new();
        let mut stack = vec![(self, false)];
        while let Some((variable, expanded)) = stack.pop() {
            if expanded {
                order.push(variable);
            } else if visited.insert(variable.id()) {
                stack.push((variable, true));
                if let Some(operation) = &variable.inner.operation {
                    for input in operation.inputs() {
                        if input.requires_grad() {
                            stack.push((input, false));
                        }
                    }
                }
            }
        }
        order
    }

    /// Accumulate gradients of the sum of this value's elements.
    /// Equivalent to calling [`Self::backward_with_grad`] with all ones.
    pub fn backward(&self) -> Result<()> {
        let mut seed = self.data().clone();
        seed.data_mut().fill(<T as DType>::one());
        self.backward_with_grad(seed)
    }

    /// Accumulate a vector-Jacobian product using a seed of exactly this shape
    /// and device. Both tensors must use available CPU devices. Each call
    /// propagates only its new gradients, even when
    /// gradients from previous calls remain stored on intermediate values.
    pub fn backward_with_grad(&self, grad: Tensor<T>) -> Result<()> {
        if !self.requires_grad() {
            return Err(RustMLError::backend_error(
                "Variable does not require gradients",
            ));
        }
        if grad.shape() != self.data().shape() {
            return Err(RustMLError::dimension_mismatch(
                self.data().shape(),
                grad.shape(),
            ));
        }
        if grad.device().kind() != self.data().device().kind() {
            return Err(RustMLError::DeviceMismatch {
                tensor_device: grad.device().kind().to_string(),
                expected_device: self.data().device().kind().to_string(),
            });
        }
        for tensor in [self.data(), &grad] {
            if tensor.device().kind() != DeviceKind::Cpu || !tensor.device().is_available() {
                return Err(RustMLError::backend_error(
                    "only available CPU devices are supported",
                ));
            }
        }

        let mut pending = HashMap::from([(self.id(), grad)]);
        for variable in self.topological_order().into_iter().rev() {
            let grad = pending
                .remove(&variable.id())
                .expect("tracked node has a gradient");
            variable.accumulate_grad(&grad)?;
            if let Some(operation) = &variable.inner.operation {
                for (index, input) in operation.inputs().iter().enumerate() {
                    if input.requires_grad() {
                        let contribution = operation.input_grad(index, &grad)?;
                        if let Some(existing) = pending.get_mut(&input.id()) {
                            *existing = (&*existing + &contribution)?;
                        } else {
                            pending.insert(input.id(), contribution);
                        }
                    }
                }
            }
        }
        Ok(())
    }

    /// Copy this value into an independent leaf without gradient tracking.
    pub fn detach(&self) -> Self {
        Self::new(self.data().clone(), false)
    }

    pub fn item(&self) -> Result<T> {
        self.data().item()
    }

    pub fn zeros<S: IntoShape>(shape: S, requires_grad: bool) -> Self {
        Self::new(Tensor::zeros(shape), requires_grad)
    }

    pub fn ones<S: IntoShape>(shape: S, requires_grad: bool) -> Self {
        Self::new(Tensor::ones(shape), requires_grad)
    }

    pub fn from_vec<S: IntoShape>(data: Vec<T>, shape: S, requires_grad: bool) -> Result<Self> {
        Ok(Self::new(Tensor::from_vec(data, shape)?, requires_grad))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shared_dag_visits_each_value_once() {
        let x = Variable::scalar(1.0_f64, true);
        let mut value = x.clone();
        for _ in 0..30 {
            value = (&value + &value).unwrap();
        }
        assert_eq!(value.topological_order().len(), 31);
        value.backward().unwrap();
        assert_eq!(x.grad().unwrap().item().unwrap(), 2.0_f64.powi(30));
    }
}

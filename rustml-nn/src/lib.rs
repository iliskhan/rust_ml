//! Minimal CPU training: [`Linear`], [`mse_loss`] and [`Sgd`].
//!
//! Each forward pass creates a new autograd graph. Drop the loss and predictions
//! before updating parameters: saved graph values and aliases cannot be mutated.
//! No Module framework, random initialization or optimizer state is required.
//!
//! ```
//! use rustml_autograd::Variable;
//! use rustml_nn::{mse_loss, Linear, Sgd};
//! let input = Variable::from_vec(vec![-1.0_f64, 0.0, 1.0], [3, 1], false)?;
//! let target = Variable::from_vec(vec![-1.0, 1.0, 3.0], [3, 1], false)?;
//! let mut model = Linear::new(1, 1)?;
//! let optimizer = Sgd::new(0.1)?;
//! for _ in 0..150 {
//!     let prediction = model.forward(&input)?;
//!     let loss = mse_loss(&prediction, &target)?;
//!     loss.backward()?;
//!     drop(loss);
//!     drop(prediction);
//!     for parameter in model.parameters_mut() {
//!         optimizer.step(parameter)?;
//!     }
//! }
//! assert!((model.weight().data().data()[[0, 0]] - 2.0).abs() < 1e-6);
//! assert!((model.bias().data().data()[[0]] - 1.0).abs() < 1e-6);
//! # Ok::<(), rustml_core::RustMLError>(())
//! ```

use rustml_autograd::Variable;
use rustml_core::{DType, FloatDType, Result, RustMLError};
use rustml_tensor::Tensor;

/// Affine transform `input @ weight + bias` with trainable leaf parameters.
/// Input is `[batch, in_features]`, weight `[in_features, out_features]`, and
/// bias `[out_features]`. Only 2D inputs are supported.
#[derive(Debug)]
pub struct Linear<T: FloatDType> {
    weight: Variable<T>,
    bias: Variable<T>,
}

impl<T: FloatDType> Linear<T> {
    /// Deterministic zero initialization, sufficient for one affine layer.
    pub fn new(in_features: usize, out_features: usize) -> Result<Self> {
        if in_features == 0 || out_features == 0 {
            return Err(RustMLError::invalid_shape(
                &[in_features, out_features],
                "Linear requires positive feature counts",
            ));
        }
        Self::from_tensors(
            Tensor::try_zeros([in_features, out_features])?,
            Tensor::try_zeros([out_features])?,
        )
    }

    /// Use explicit initial tensors, making independent trainable leaves.
    pub fn from_tensors(weight: Tensor<T>, bias: Tensor<T>) -> Result<Self> {
        let shape = weight.shape();
        if shape.ndim() != 2 || shape.dims().contains(&0) {
            return Err(RustMLError::invalid_shape(
                shape.dims(),
                "Linear weight must be a nonempty 2D matrix",
            ));
        }
        if bias.shape().dims() != [shape.dims()[1]] {
            return Err(RustMLError::dimension_mismatch(
                vec![shape.dims()[1]],
                bias.shape().dims().to_vec(),
            ));
        }
        for tensor in [&weight, &bias] {
            if tensor.device().kind() != rustml_core::DeviceKind::Cpu
                || !tensor.device().is_available()
            {
                return Err(RustMLError::backend_error(
                    "only available CPU devices are supported",
                ));
            }
        }
        Ok(Self {
            weight: Variable::new(weight, true),
            bias: Variable::new(bias, true),
        })
    }

    pub fn forward(&self, input: &Variable<T>) -> Result<Variable<T>> {
        &input.matmul(&self.weight)? + &self.bias
    }

    pub fn weight(&self) -> &Variable<T> {
        &self.weight
    }

    pub fn bias(&self) -> &Variable<T> {
        &self.bias
    }

    /// Borrow both parameters without creating shared Variable aliases.
    pub fn parameters_mut(&mut self) -> [&mut Variable<T>; 2] {
        [&mut self.weight, &mut self.bias]
    }

    /// Clear accumulated gradients, for example before accumulating a new batch.
    pub fn zero_grad(&self) {
        self.weight.zero_grad();
        self.bias.zero_grad();
    }
}

/// Mean squared error over all elements. Shapes must match exactly; target
/// broadcasting is rejected to avoid accidental all-pairs losses. Empty losses
/// are rejected by [`Variable::mean`]. Both operands may track gradients.
pub fn mse_loss<T: FloatDType>(
    prediction: &Variable<T>,
    target: &Variable<T>,
) -> Result<Variable<T>> {
    if prediction.data().shape() != target.data().shape() {
        return Err(RustMLError::dimension_mismatch(
            prediction.data().shape(),
            target.data().shape(),
        ));
    }
    let difference = (prediction - target)?;
    (&difference * &difference)?.mean()
}

/// Stateless SGD with a finite, positive learning rate. Each call updates one
/// uniquely owned leaf using its accumulated gradient, then clears that gradient.
/// Drop all graphs and aliases first. Rejected steps leave this parameter intact;
/// a loop over parameters is not a transactional multi-parameter update.
#[derive(Debug)]
pub struct Sgd<T: FloatDType> {
    learning_rate: T,
}

impl<T: FloatDType> Sgd<T> {
    pub fn new(learning_rate: T) -> Result<Self> {
        if !DType::is_finite(&learning_rate) || learning_rate <= <T as DType>::zero() {
            return Err(RustMLError::NumericalError {
                message: "SGD requires a finite, positive learning rate".into(),
            });
        }
        Ok(Self { learning_rate })
    }

    /// Apply `parameter -= learning_rate * gradient`. Missing gradients,
    /// nonfinite updates, shared leaves and operation results are errors.
    pub fn step(&self, parameter: &mut Variable<T>) -> Result<()> {
        let gradient = parameter
            .grad()
            .ok_or_else(|| RustMLError::backend_error("SGD parameter has no gradient"))?;
        if gradient.shape() != parameter.data().shape() {
            return Err(RustMLError::dimension_mismatch(
                parameter.data().shape(),
                gradient.shape(),
            ));
        }
        let delta = (&gradient * &Tensor::scalar(self.learning_rate))?;
        let updated = (parameter.data() - &delta)?;
        if updated.data().iter().any(|value| !DType::is_finite(value)) {
            return Err(RustMLError::NumericalError {
                message: "SGD update must be finite".into(),
            });
        }
        *parameter.data_mut()? = updated;
        Ok(())
    }
}

//! Основная структура Tensor для RustML

use crate::shape::{IntoShape, Shape};
use ndarray::{ArrayD, IxDyn};
use rustml_core::{cpu, DType, Device, DeviceKind, Result, RustMLError};
use std::sync::Arc;

/// Основная структура Tensor
#[derive(Debug, Clone)]
pub struct Tensor<T: DType> {
    /// Данные tensor'а
    data: ArrayD<T>,
    /// Устройство на котором хранится tensor
    device: Arc<dyn Device>,
}

impl<T: DType> Tensor<T> {
    /// Wrap host data and device metadata. Computation currently supports CPU only.
    pub fn new(data: ArrayD<T>, device: Arc<dyn Device>) -> Self {
        Self { data, device }
    }

    /// Create a CPU tensor filled with zeros.
    ///
    /// # Panics
    /// Panics if the shape is invalid or allocation fails. Use [`Self::try_zeros`]
    /// to receive an error instead.
    pub fn zeros<S: IntoShape>(shape: S) -> Self {
        Self::try_zeros(shape).expect("cannot create zero tensor")
    }

    /// Create a CPU tensor filled with ones.
    ///
    /// # Panics
    /// Panics if the shape is invalid or allocation fails. Use [`Self::try_ones`]
    /// to receive an error instead.
    pub fn ones<S: IntoShape>(shape: S) -> Self {
        Self::try_ones(shape).expect("cannot create one tensor")
    }

    /// Create zeros, rejecting shape overflow, invalid layouts and allocation failure.
    pub fn try_zeros<S: IntoShape>(shape: S) -> Result<Self> {
        Self::filled(shape.into_shape(), <T as DType>::zero())
    }

    /// Create ones, rejecting shape overflow, invalid layouts and allocation failure.
    pub fn try_ones<S: IntoShape>(shape: S) -> Result<Self> {
        Self::filled(shape.into_shape(), <T as DType>::one())
    }

    fn filled(shape: Shape, value: T) -> Result<Self> {
        let size = shape.checked_layout::<T>()?;
        let mut values = Vec::new();
        values
            .try_reserve_exact(size)
            .map_err(|_| RustMLError::AllocationFailed {
                size: size * std::mem::size_of::<T>(),
            })?;
        values.resize(size, value);
        Self::from_vec(values, shape)
    }

    /// Создать tensor из raw data
    pub fn from_vec<S: IntoShape>(data: Vec<T>, shape: S) -> Result<Self> {
        let shape = shape.into_shape();

        let size = shape.checked_layout::<T>()?;
        if data.len() != size {
            return Err(RustMLError::dimension_mismatch(
                format!("data length {}", data.len()),
                format!("shape {:?} requires {} elements", shape.dims(), size),
            ));
        }

        let array = ArrayD::from_shape_vec(IxDyn(shape.dims()), data)
            .map_err(|e| RustMLError::invalid_shape(shape.dims(), &e.to_string()))?;

        Ok(Self::new(array, Arc::new(cpu())))
    }

    /// Получить shape tensor'а
    pub fn shape(&self) -> Shape {
        Shape::new(self.data.shape().to_vec())
    }

    /// Количество dimensions
    pub fn ndim(&self) -> usize {
        self.data.ndim()
    }

    /// Общее количество элементов
    pub fn numel(&self) -> usize {
        self.data.len()
    }

    /// Получить устройство
    pub fn device(&self) -> &dyn Device {
        self.device.as_ref()
    }

    /// Получить reference на raw data
    pub fn data(&self) -> &ArrayD<T> {
        &self.data
    }

    /// Consume the tensor and return its owned host data without copying.
    pub fn into_data(self) -> ArrayD<T> {
        self.data
    }

    /// Получить mutable reference на raw data
    pub fn data_mut(&mut self) -> &mut ArrayD<T> {
        &mut self.data
    }

    /// Получить Arc clone устройства (для internal use)
    pub(crate) fn device_arc(&self) -> Arc<dyn Device> {
        Arc::clone(&self.device)
    }

    pub(crate) fn ensure_cpu(&self) -> Result<()> {
        if self.device.kind() != DeviceKind::Cpu || !self.device.is_available() {
            return Err(RustMLError::backend_error(
                "only available CPU devices are supported",
            ));
        }
        Ok(())
    }

    /// Создать view tensor'а (zero-copy)
    pub fn view(&self) -> TensorView<'_, T> {
        TensorView {
            data: self.data.view(),
            device: Arc::clone(&self.device),
        }
    }

    /// Reshape tensor (должен сохранять numel)
    pub fn reshape<S: IntoShape>(&self, new_shape: S) -> Result<Self> {
        self.ensure_cpu()?;
        let new_shape = new_shape.into_shape();
        if self.numel() != new_shape.checked_layout::<T>()? {
            return Err(RustMLError::invalid_shape(
                new_shape.dims(),
                &format!(
                    "cannot reshape from {:?} to {:?}",
                    self.shape().dims(),
                    new_shape.dims()
                ),
            ));
        }

        let new_data = self
            .data
            .clone()
            .into_shape(IxDyn(new_shape.dims()))
            .map_err(|e| RustMLError::invalid_shape(new_shape.dims(), &e.to_string()))?;

        Ok(Self::new(new_data, Arc::clone(&self.device)))
    }

    /// Get scalar value (только для scalar tensors)
    pub fn item(&self) -> Result<T> {
        if !self.shape().is_scalar() {
            return Err(RustMLError::invalid_shape(
                self.shape().dims(),
                "item() can only be called on scalar tensors",
            ));
        }

        Ok(self.data[[]])
    }

    /// Transpose a 2D CPU tensor, preserving device metadata.
    /// Returns an error for other ranks or unsupported devices.
    pub fn transpose(&self) -> Result<Tensor<T>> {
        self.ensure_cpu()?;
        if self.ndim() != 2 {
            return Err(RustMLError::invalid_shape(
                self.shape().dims(),
                "transpose() can only be called on 2D tensors",
            ));
        }

        let data = self
            .data
            .view()
            .reversed_axes()
            .as_standard_layout()
            .into_owned();
        Ok(Self::new(data, self.device_arc()))
    }

    /// Sum broadcast axes to recover the requested original shape.
    ///
    /// Extra leading axes and axes of size one in `shape` are reduced. Empty
    /// axes sum to zero. An unchanged shape returns a clone. Integer sums are
    /// checked; floating point sums propagate IEEE 754 NaN and infinity.
    ///
    /// # Errors
    /// Returns an error if the target cannot broadcast to this exact shape,
    /// sizing or integer accumulation overflows, or the device is unsupported.
    ///
    /// ```
    /// use rustml_tensor::Tensor;
    /// let x = Tensor::<f32>::ones([2, 3]);
    /// let row = x.sum_to_shape([1, 3])?;
    /// assert_eq!(row.data()[[0, 0]], 2.0);
    /// # Ok::<(), rustml_core::RustMLError>(())
    /// ```
    pub fn sum_to_shape<S: IntoShape>(&self, shape: S) -> Result<Self> {
        self.ensure_cpu()?;
        let target = shape.into_shape();
        target.checked_layout::<T>()?;
        let source = self.shape();
        if target.ndim() > source.ndim() || target.broadcast_with(&source)? != source {
            return Err(RustMLError::invalid_shape(
                target.dims(),
                "sum_to_shape target must broadcast to the input shape",
            ));
        }
        if target == source {
            return Ok(self.clone());
        }
        let mut result = Self::try_zeros(target.clone())?;
        result.device = self.device_arc();
        let offset = source.ndim() - target.ndim();
        let mut target_index = vec![0; target.ndim()];
        for (source_index, &value) in self.data.indexed_iter() {
            for (axis, &dim) in target.dims().iter().enumerate() {
                target_index[axis] = if dim == 1 {
                    0
                } else {
                    source_index[offset + axis]
                };
            }
            let sum = &mut result.data[IxDyn(&target_index)];
            *sum = sum
                .checked_add(value)
                .ok_or_else(|| RustMLError::NumericalError {
                    message: format!("{} overflow in sum_to_shape", T::NAME),
                })?;
        }
        Ok(result)
    }
}

/// Zero-copy view на tensor data
#[derive(Debug)]
pub struct TensorView<'a, T: DType> {
    data: ndarray::ArrayViewD<'a, T>,
    device: Arc<dyn Device>,
}

impl<'a, T: DType> TensorView<'a, T> {
    /// Get shape of view
    pub fn shape(&self) -> Shape {
        Shape::new(self.data.shape().to_vec())
    }

    /// Get device
    pub fn device(&self) -> &dyn Device {
        self.device.as_ref()
    }
}

// ========================================
// Convenience constructors
// ========================================

impl<T: DType> Tensor<T> {
    /// Create 1D tensor
    pub fn from_slice(data: &[T]) -> Self {
        let array = ArrayD::from_shape_vec(IxDyn(&[data.len()]), data.to_vec()).unwrap();
        Self::new(array, Arc::new(cpu()))
    }

    /// Create scalar tensor
    pub fn scalar(value: T) -> Self {
        let array = ArrayD::from_shape_vec(IxDyn(&[]), vec![value]).unwrap();
        Self::new(array, Arc::new(cpu()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rustml_core::DeviceKind;

    #[test]
    fn test_tensor_creation() {
        let tensor = Tensor::<f32>::zeros([2, 3]);
        assert_eq!(tensor.shape().dims(), &[2, 3]);
        assert_eq!(tensor.numel(), 6);
        assert_eq!(tensor.device().kind(), DeviceKind::Cpu);
    }

    #[test]
    fn test_tensor_from_vec() {
        let data = vec![1.0, 2.0, 3.0, 4.0];
        let tensor = Tensor::from_vec(data, [2, 2]).unwrap();
        assert_eq!(tensor.shape().dims(), &[2, 2]);
        assert_eq!(tensor.numel(), 4);
    }

    #[test]
    fn test_tensor_reshape() {
        let tensor = Tensor::<f32>::ones([2, 3]);
        let reshaped = tensor.reshape([3, 2]).unwrap();
        assert_eq!(reshaped.shape().dims(), &[3, 2]);
        assert_eq!(reshaped.numel(), 6);
    }

    #[test]
    fn test_scalar_tensor() {
        let scalar = Tensor::scalar(42.0f32);
        assert!(scalar.shape().is_scalar());
        assert_eq!(scalar.item().unwrap(), 42.0);
    }

    #[test]
    fn test_tensor_view() {
        let tensor = Tensor::<f32>::ones([2, 3]);
        let view = tensor.view();
        assert_eq!(view.shape().dims(), &[2, 3]);
    }

    #[test]
    fn test_transpose() {
        // A = [[1, 2, 3],
        //      [4, 5, 6]]  shape [2, 3]
        // Aᵀ = [[1, 4],
        //       [2, 5],
        //       [3, 6]]  shape [3, 2]
        let a = Tensor::from_vec(vec![1.0f32, 2.0, 3.0, 4.0, 5.0, 6.0], [2, 3]).unwrap();
        let at = a.transpose().unwrap();

        assert_eq!(at.shape().dims(), &[3, 2]);
        assert_eq!(at.data()[[0, 0]], 1.0);
        assert_eq!(at.data()[[0, 1]], 4.0);
        assert_eq!(at.data()[[1, 0]], 2.0);
        assert_eq!(at.data()[[2, 1]], 6.0);
    }

    #[test]
    fn test_fallible_shape_limits_and_empty_tensors() {
        for shape in [[usize::MAX, 2], [usize::MAX, 0], [isize::MAX as usize, 2]] {
            assert!(matches!(
                Tensor::<f32>::from_vec(vec![], shape),
                Err(RustMLError::InvalidShape { .. })
            ));
            assert!(Tensor::<f32>::try_zeros(shape).is_err());
            assert!(Tensor::<f32>::try_ones(shape).is_err());
            assert!(Tensor::<f32>::scalar(1.0).reshape(shape).is_err());
        }
        assert!(Tensor::<f64>::try_zeros([isize::MAX as usize]).is_err());
        assert_eq!(Tensor::<i32>::try_zeros([2, 0, 3]).unwrap().numel(), 0);
        assert_eq!(Tensor::<i32>::try_ones([]).unwrap().item().unwrap(), 1);
        let empty = Tensor::<i32>::from_vec(vec![], [2, 0, 3]).unwrap();
        assert_eq!(empty.reshape([0, 6]).unwrap().shape().dims(), &[0, 6]);
    }

    #[test]
    fn test_sum_to_shape_broadcast_gradient() {
        let x = Tensor::from_vec((1..=12).collect::<Vec<i32>>(), [2, 2, 3]).unwrap();
        assert_eq!(
            x.sum_to_shape([3])
                .unwrap()
                .data()
                .iter()
                .copied()
                .collect::<Vec<_>>(),
            vec![22, 26, 30]
        );
        assert_eq!(
            x.sum_to_shape([1, 3])
                .unwrap()
                .data()
                .iter()
                .copied()
                .collect::<Vec<_>>(),
            vec![22, 26, 30]
        );
        assert_eq!(
            x.sum_to_shape([2, 1, 3])
                .unwrap()
                .data()
                .iter()
                .copied()
                .collect::<Vec<_>>(),
            vec![5, 7, 9, 17, 19, 21]
        );
        assert_eq!(x.sum_to_shape([]).unwrap().item().unwrap(), 78);
        assert_eq!(x.sum_to_shape([2, 2, 3]).unwrap().data(), x.data());
        assert!(x.sum_to_shape([2, 3, 1]).is_err());
        assert!(x.sum_to_shape([1, 2, 2, 3]).is_err());
        assert_eq!(
            Tensor::scalar(7i32)
                .sum_to_shape([])
                .unwrap()
                .item()
                .unwrap(),
            7
        );
    }

    #[test]
    fn test_sum_to_shape_empty_axes_and_integer_overflow() {
        let empty = Tensor::<i32>::zeros([0, 3]);
        assert_eq!(
            empty
                .sum_to_shape([3])
                .unwrap()
                .data()
                .iter()
                .copied()
                .collect::<Vec<_>>(),
            vec![0, 0, 0]
        );
        assert_eq!(empty.sum_to_shape([1, 3]).unwrap().shape().dims(), &[1, 3]);
        assert_eq!(empty.sum_to_shape([]).unwrap().item().unwrap(), 0);
        assert_eq!(empty.sum_to_shape([0, 1]).unwrap().numel(), 0);
        assert!(empty.sum_to_shape([2, 3]).is_err());
        let overflow = Tensor::from_slice(&[i64::MAX, 1]);
        assert!(matches!(
            overflow.sum_to_shape([]),
            Err(RustMLError::NumericalError { .. })
        ));
    }
}

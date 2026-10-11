//! Shape и dimension utilities для tensors

use rustml_core::{Result, RustMLError};
use serde::{Deserialize, Serialize};

/// Tensor shape representation
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Shape {
    dims: Vec<usize>,
}

impl Shape {
    /// Создать новый shape
    pub fn new(dims: Vec<usize>) -> Self {
        Self { dims }
    }

    /// Получить dimensions как slice
    pub fn dims(&self) -> &[usize] {
        &self.dims
    }

    /// Количество dimensions
    pub fn ndim(&self) -> usize {
        self.dims.len()
    }

    /// Общее количество элементов; скаляр содержит один элемент.
    ///
    /// # Panics
    /// Panics when the nonempty shape's element count exceeds `usize::MAX`.
    /// Use [`Self::checked_numel`] for fallible sizing.
    pub fn numel(&self) -> usize {
        self.checked_numel().expect("shape element count overflow")
    }

    /// Compute element count without overflow. Any zero axis makes it zero.
    pub fn checked_numel(&self) -> Result<usize> {
        if self.dims.contains(&0) {
            return Ok(0);
        }
        self.dims.iter().try_fold(1usize, |size, &dim| {
            size.checked_mul(dim)
                .ok_or_else(|| RustMLError::invalid_shape(self.dims(), "element count overflow"))
        })
    }

    /// Validate ndarray's nonzero-axis and allocation-size limits.
    pub(crate) fn checked_layout<T>(&self) -> Result<usize> {
        let span = self
            .dims
            .iter()
            .filter(|&&dim| dim != 0)
            .try_fold(1usize, |size, &dim| size.checked_mul(dim));
        if span.is_none_or(|size| size > isize::MAX as usize) {
            return Err(RustMLError::invalid_shape(
                self.dims(),
                "shape exceeds ndarray layout limits",
            ));
        }
        let size = self.checked_numel()?;
        if size
            .checked_mul(std::mem::size_of::<T>())
            .is_none_or(|bytes| bytes > isize::MAX as usize)
        {
            return Err(RustMLError::invalid_shape(
                self.dims(),
                "allocation size overflow",
            ));
        }
        Ok(size)
    }

    /// Проверить совместимость для broadcasting
    pub fn can_broadcast_with(&self, other: &Shape) -> bool {
        let max_dims = self.ndim().max(other.ndim());

        for i in 0..max_dims {
            let dim_a = self.dims.iter().rev().nth(i).copied().unwrap_or(1);
            let dim_b = other.dims.iter().rev().nth(i).copied().unwrap_or(1);

            if dim_a != dim_b && dim_a != 1 && dim_b != 1 {
                return false;
            }
        }
        true
    }

    /// Вычислить broadcasted shape
    pub fn broadcast_with(&self, other: &Shape) -> Result<Shape> {
        if !self.can_broadcast_with(other) {
            return Err(RustMLError::dimension_mismatch(
                format!("shapes {:?} and {:?}", self.dims, other.dims),
                "cannot be broadcast together".to_string(),
            ));
        }

        let max_dims = self.ndim().max(other.ndim());
        let mut result_dims = Vec::with_capacity(max_dims);

        for i in 0..max_dims {
            let dim_a = self.dims.iter().rev().nth(i).copied().unwrap_or(1);
            let dim_b = other.dims.iter().rev().nth(i).copied().unwrap_or(1);

            result_dims.push(if dim_a == 1 { dim_b } else { dim_a });
        }

        result_dims.reverse();
        Ok(Shape::new(result_dims))
    }

    /// Проверить что shape валидный для reshape
    pub fn can_reshape_to(&self, new_shape: &Shape) -> bool {
        matches!((self.checked_numel(), new_shape.checked_numel()), (Ok(a), Ok(b)) if a == b)
    }

    /// Создать скалярный shape без осей.
    pub fn scalar() -> Self {
        Self::new(vec![])
    }

    /// Проверить что shape скалярный
    pub fn is_scalar(&self) -> bool {
        self.dims.is_empty()
    }
}

/// Trait для types которые могут быть converted в Shape
pub trait IntoShape {
    fn into_shape(self) -> Shape;
}

impl IntoShape for Shape {
    fn into_shape(self) -> Shape {
        self
    }
}

impl IntoShape for Vec<usize> {
    fn into_shape(self) -> Shape {
        Shape::new(self)
    }
}

impl IntoShape for &[usize] {
    fn into_shape(self) -> Shape {
        Shape::new(self.to_vec())
    }
}

impl<const N: usize> IntoShape for [usize; N] {
    fn into_shape(self) -> Shape {
        Shape::new(self.to_vec())
    }
}

impl<const N: usize> IntoShape for &[usize; N] {
    fn into_shape(self) -> Shape {
        Shape::new(self.to_vec())
    }
}

/// Dimension type для indexing
pub type Dimension = usize;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_shape_creation() {
        let shape = Shape::new(vec![2, 3, 4]);
        assert_eq!(shape.dims(), &[2, 3, 4]);
        assert_eq!(shape.ndim(), 3);
        assert_eq!(shape.numel(), 24);
    }

    #[test]
    fn test_broadcasting_compatibility() {
        let shape1 = Shape::new(vec![2, 3]);
        let shape2 = Shape::new(vec![1, 3]);
        assert!(shape1.can_broadcast_with(&shape2));

        let shape3 = Shape::new(vec![2, 4]);
        assert!(!shape1.can_broadcast_with(&shape3));
    }

    #[test]
    fn test_broadcast_result() {
        let shape1 = Shape::new(vec![2, 1]);
        let shape2 = Shape::new(vec![1, 3]);
        let result = shape1.broadcast_with(&shape2).unwrap();
        assert_eq!(result.dims(), &[2, 3]);
    }

    #[test]
    fn test_into_shape() {
        let shape1: Shape = vec![2, 3].into_shape();
        let shape2: Shape = [2, 3].into_shape();
        assert_eq!(shape1, shape2);
    }

    #[test]
    fn test_scalar_shape() {
        let scalar = Shape::scalar();
        assert!(scalar.is_scalar());
        assert_eq!(scalar.numel(), 1);
    }

    #[test]
    fn test_broadcast_different_ranks_scalar_and_zero_axes() {
        let scalar = Shape::scalar();
        let row = Shape::new(vec![3]);
        let matrix = Shape::new(vec![2, 1]);
        assert_eq!(row.broadcast_with(&matrix).unwrap().dims(), &[2, 3]);
        assert_eq!(matrix.broadcast_with(&row).unwrap().dims(), &[2, 3]);
        assert_eq!(scalar.broadcast_with(&row).unwrap(), row);
        assert_eq!(row.broadcast_with(&scalar).unwrap(), row);
        assert!(scalar.can_broadcast_with(&scalar));
        let empty = Shape::new(vec![0, 3]);
        assert_eq!(
            empty.broadcast_with(&Shape::new(vec![1, 3])).unwrap(),
            empty
        );
        assert_eq!(
            Shape::new(vec![1, 3]).broadcast_with(&empty).unwrap(),
            empty
        );
        assert!(!empty.can_broadcast_with(&Shape::new(vec![2, 3])));
    }

    #[test]
    fn test_checked_numel_and_zero_axes() {
        assert!(Shape::new(vec![usize::MAX, 2]).checked_numel().is_err());
        assert_eq!(
            Shape::new(vec![usize::MAX, 2, 0]).checked_numel().unwrap(),
            0
        );
        assert_eq!(
            Shape::new(vec![0, usize::MAX, 2]).checked_numel().unwrap(),
            0
        );
        assert!(!Shape::new(vec![usize::MAX, 2]).can_reshape_to(&Shape::scalar()));
    }
}

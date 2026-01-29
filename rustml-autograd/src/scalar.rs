//! Scalar wrapper для решения orphan rule проблемы
//! 
//! Позволяет писать: `Scalar(3.0) + &variable`

use rustml_core::{DType, Result};
use crate::Variable;
use std::ops::{Add, Mul};

/// Wrapper для scalar значений, позволяет операции `scalar + variable`
/// 
/// # Examples
/// 
/// ```ignore
/// use rustml_autograd::{Variable, Scalar};
/// 
/// let x = Variable::scalar(2.0f32, true);
/// 
/// // Теперь оба варианта работают:
/// let y1 = (&x + 3.0).unwrap();          // variable + scalar
/// let y2 = (Scalar(3.0) + &x).unwrap();  // scalar + variable ✅
/// ```
#[derive(Debug, Clone, Copy)]
pub struct Scalar<T: DType>(pub T);

// ============================================================================
// Scalar + Variable операции (коммутативные - делегируем к Variable ops)
// ============================================================================

impl<T: DType> Add<&Variable<T>> for Scalar<T> {
    type Output = Result<Variable<T>>;

    fn add(self, var: &Variable<T>) -> Self::Output {
        // Сложение коммутативно: scalar + x = x + scalar
        var + self.0
    }
}

impl<T: DType> Mul<&Variable<T>> for Scalar<T> {
    type Output = Result<Variable<T>>;

    fn mul(self, var: &Variable<T>) -> Self::Output {
        // Умножение коммутативно: scalar * x = x * scalar
        // TODO: Нужно добавить MulScalarOp в graph.rs для поддержки этой операции
        // Пока возвращаем ошибку
        Err(rustml_core::RustMLError::backend_error(
            "Scalar * Variable not yet implemented. Use Variable * scalar instead."
        ))
    }
}

// ============================================================================
// Helper traits для удобства
// ============================================================================

/// Trait для автоматической конвертации в Scalar
pub trait IntoScalar<T: DType> {
    fn into_scalar(self) -> Scalar<T>;
}

impl<T: DType> IntoScalar<T> for T {
    fn into_scalar(self) -> Scalar<T> {
        Scalar(self)
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_scalar_add_variable() {
        let x = Variable::scalar(2.0f32, true);
        let y = (Scalar(3.0) + &x).unwrap();
        
        assert_eq!(y.item().unwrap(), 5.0);
        
        y.backward().unwrap();
        assert_eq!(x.grad().unwrap().item().unwrap(), 1.0);
    }

    #[test]
    fn test_commutative_addition() {
        let x = Variable::scalar(2.0f32, false);
        
        // Addition: 3 + x == x + 3
        let y1 = (Scalar(3.0) + &x).unwrap();
        let y2 = (&x + 3.0).unwrap();
        assert_eq!(y1.item().unwrap(), y2.item().unwrap());
    }

    #[test]
    fn test_into_scalar_trait() {
        let x = Variable::scalar(2.0f32, true);
        let y = (3.0f32.into_scalar() + &x).unwrap();
        
        assert_eq!(y.item().unwrap(), 5.0);
    }
}

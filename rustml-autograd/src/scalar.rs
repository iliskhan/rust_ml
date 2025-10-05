//! Scalar wrapper для решения orphan rule проблемы
//! 
//! Позволяет писать: `Scalar(3.0) + &variable`

use std::sync::Arc;
use rustml_core::{DType, Result};
use rustml_tensor::Tensor;
use crate::Variable;
use crate::graph::{GraphNode, Operation, AddScalarOp, MulScalarOp};
use std::ops::{Add, Sub, Mul, Div};

/// Wrapper для scalar значений, позволяет операции `scalar + variable`
/// 
/// # Examples
/// 
/// ```
/// use rustml_autograd::{Variable, Scalar};
/// 
/// let x = Variable::scalar(2.0f32, true);
/// 
/// // Теперь оба варианта работают:
/// let y1 = (&x + 3.0).unwrap();          // variable + scalar
/// let y2 = (Scalar(3.0) + &x).unwrap();   // scalar + variable ✅
/// ```
#[derive(Debug, Clone, Copy)]
pub struct Scalar<T: DType>(pub T);

// ============================================================================
// Scalar + Variable операции
// ============================================================================

impl<T: DType> Add<&Variable<T>> for Scalar<T> {
    type Output = Result<Variable<T>>;

    fn add(self, var: &Variable<T>) -> Self::Output {
        // Просто делегируем к Variable + Scalar
        var + self.0
    }
}

impl<T: DType> Sub<&Variable<T>> for Scalar<T> {
    type Output = Result<Variable<T>>;

    fn sub(self, var: &Variable<T>) -> Self::Output {
        // scalar - variable = -(variable - scalar)
        // Но это не то же самое! 3 - x ≠ x - 3
        // Нужно создать новый узел графа
        
        if var.requires_grad {
            // scalar - x, gradient будет -1
            let result_data = var.data.map(|&val| self.0 - val);
            
            let node = GraphNode {
                op: Box::new(SubScalarOp {
                    input: Arc::new(var.clone()),
                    scalar: self.0,
                }),
                inputs: vec![Arc::new(var.clone())],
                output: result_data.clone(),
            };
            
            Ok(Variable {
                data: result_data,
                grad: Default::default(),
                requires_grad: true,
                graph_node: Some(Arc::new(node)),
            })
        } else {
            Ok(Variable {
                data: var.data.map(|&val| self.0 - val),
                grad: Default::default(),
                requires_grad: false,
                graph_node: None,
            })
        }
    }
}

impl<T: DType> Mul<&Variable<T>> for Scalar<T> {
    type Output = Result<Variable<T>>;

    fn mul(self, var: &Variable<T>) -> Self::Output {
        // Умножение коммутативно: 3 * x = x * 3
        var * self.0
    }
}

impl<T: DType> Div<&Variable<T>> for Scalar<T> {
    type Output = Result<Variable<T>>;

    fn div(self, var: &Variable<T>) -> Self::Output {
        // scalar / variable = scalar * (1/variable)
        // Это требует reciprocal operation, пока не реализовано
        // Добавим позже когда будут нужны более сложные операции
        
        if var.requires_grad {
            // a / x, gradient = -a / x²
            let result_data = var.data.map(|&val| self.0 / val);
            
            let node = GraphNode {
                op: Box::new(DivScalarOp {
                    input: Arc::new(var.clone()),
                    scalar: self.0,
                }),
                inputs: vec![Arc::new(var.clone())],
                output: result_data.clone(),
            };
            
            Ok(Variable {
                data: result_data,
                grad: Default::default(),
                requires_grad: true,
                graph_node: Some(Arc::new(node)),
            })
        } else {
            Ok(Variable {
                data: var.data.map(|&val| self.0 / val),
                grad: Default::default(),
                requires_grad: false,
                graph_node: None,
            })
        }
    }
}

// ============================================================================
// New operations for graph
// ============================================================================

/// Scalar - Variable operation (a - x)
#[derive(Debug, Clone)]
pub struct SubScalarOp<T: DType> {
    input: Arc<Variable<T>>,
    scalar: T,
}

impl<T: DType> Operation<T> for SubScalarOp<T> {
    fn backward(&self, grad_output: &Tensor<T>) -> Result<()> {
        // d(a - x)/dx = -1
        // gradient для input будет отрицательным
        let input_grad = grad_output.map(|&g| <T as std::ops::Neg>::neg(g));
        
        let mut grad = self.input.grad.write().unwrap();
        match &*grad {
            Some(existing) => {
                *grad = Some((existing + &input_grad)?);
            }
            None => {
                *grad = Some(input_grad);
            }
        }
        
        Ok(())
    }
}

/// Scalar / Variable operation (a / x)
#[derive(Debug, Clone)]
pub struct DivScalarOp<T: DType> {
    input: Arc<Variable<T>>,
    scalar: T,
}

impl<T: DType> Operation<T> for DivScalarOp<T> {
    fn backward(&self, grad_output: &Tensor<T>) -> Result<()> {
        // d(a / x)/dx = -a / x²
        let input_grad = self.input.data.map(|&val| {
            let denom = val * val; // x²
            <T as std::ops::Neg>::neg(<T as std::ops::Div>::div(self.scalar, denom))
        });
        
        let scaled_grad = (&input_grad * grad_output)?;
        
        let mut grad = self.input.grad.write().unwrap();
        match &*grad {
            Some(existing) => {
                *grad = Some((existing + &scaled_grad)?);
            }
            None => {
                *grad = Some(scaled_grad);
            }
        }
        
        Ok(())
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
    use approx::assert_relative_eq;

    #[test]
    fn test_scalar_add_variable() {
        let x = Variable::scalar(2.0f32, true);
        let y = (Scalar(3.0) + &x).unwrap();
        
        assert_relative_eq!(y.item().unwrap(), 5.0);
        
        y.backward().unwrap();
        assert_relative_eq!(x.grad().unwrap().item().unwrap(), 1.0);
    }

    #[test]
    fn test_scalar_sub_variable() {
        // 5 - x where x = 2 should give 3
        let x = Variable::scalar(2.0f32, true);
        let y = (Scalar(5.0) - &x).unwrap();
        
        assert_relative_eq!(y.item().unwrap(), 3.0);
        
        // d(5 - x)/dx = -1
        y.backward().unwrap();
        assert_relative_eq!(x.grad().unwrap().item().unwrap(), -1.0);
    }

    #[test]
    fn test_scalar_mul_variable() {
        let x = Variable::scalar(2.0f32, true);
        let y = (Scalar(3.0) * &x).unwrap();
        
        assert_relative_eq!(y.item().unwrap(), 6.0);
        
        y.backward().unwrap();
        assert_relative_eq!(x.grad().unwrap().item().unwrap(), 3.0);
    }

    #[test]
    fn test_scalar_div_variable() {
        // 6 / x where x = 2 should give 3
        let x = Variable::scalar(2.0f32, true);
        let y = (Scalar(6.0) / &x).unwrap();
        
        assert_relative_eq!(y.item().unwrap(), 3.0);
        
        // d(6 / x)/dx = -6 / x² = -6 / 4 = -1.5
        y.backward().unwrap();
        assert_relative_eq!(x.grad().unwrap().item().unwrap(), -1.5);
    }

    #[test]
    fn test_commutative_operations() {
        let x = Variable::scalar(2.0f32, false);
        
        // Addition: 3 + x == x + 3
        let y1 = (Scalar(3.0) + &x).unwrap();
        let y2 = (&x + 3.0).unwrap();
        assert_relative_eq!(y1.item().unwrap(), y2.item().unwrap());
        
        // Multiplication: 3 * x == x * 3
        let y3 = (Scalar(3.0) * &x).unwrap();
        let y4 = (&x * 3.0).unwrap();
        assert_relative_eq!(y3.item().unwrap(), y4.item().unwrap());
    }

    #[test]
    fn test_into_scalar_trait() {
        let x = Variable::scalar(2.0f32, true);
        let y = (3.0f32.into_scalar() + &x).unwrap();
        
        assert_relative_eq!(y.item().unwrap(), 5.0);
    }
}

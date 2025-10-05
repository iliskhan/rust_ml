//! Data type system для tensors
//!
//! Определяет поддерживаемые типы данных и их свойства.

use num_traits::{Float, Zero, One};
use serde::{Deserialize, Serialize};
use std::fmt;

/// Trait для data types в tensors
pub trait DType: 
    Copy + Clone + Send + Sync + fmt::Debug + fmt::Display + 'static +
    Zero + One + 
    std::ops::Add<Output = Self> + std::ops::Sub<Output = Self> + 
    std::ops::Mul<Output = Self> + std::ops::Div<Output = Self>
{
    /// Size in bytes
    const SIZE: usize;
    
    /// Type name для debugging
    const NAME: &'static str;
    
    /// Zero value для данного типа
    fn zero() -> Self;
    
    /// One value для данного типа
    fn one() -> Self;
    
    /// Check if value is finite (для floating point)
    fn is_finite(&self) -> bool;
}

/// Floating point DType trait
pub trait FloatDType: DType + Float {
    /// Not-a-Number value
    fn nan() -> Self;
    
    /// Positive infinity
    fn infinity() -> Self;
    
    /// Negative infinity  
    fn neg_infinity() -> Self;
}

// ========================================
// Implementation для standard types
// ========================================

impl DType for f32 {
    const SIZE: usize = 4;
    const NAME: &'static str = "f32";
    
    #[inline]
    fn zero() -> Self { 0.0 }
    
    #[inline]
    fn one() -> Self { 1.0 }
    
    #[inline]
    fn is_finite(&self) -> bool { f32::is_finite(*self) }
}

impl FloatDType for f32 {
    #[inline]
    fn nan() -> Self { f32::NAN }
    
    #[inline]
    fn infinity() -> Self { f32::INFINITY }
    
    #[inline]
    fn neg_infinity() -> Self { f32::NEG_INFINITY }
}

impl DType for f64 {
    const SIZE: usize = 8;
    const NAME: &'static str = "f64";
    
    #[inline]
    fn zero() -> Self { 0.0 }
    
    #[inline]
    fn one() -> Self { 1.0 }
    
    #[inline]
    fn is_finite(&self) -> bool { f64::is_finite(*self) }
}

impl FloatDType for f64 {
    #[inline]
    fn nan() -> Self { f64::NAN }
    
    #[inline]
    fn infinity() -> Self { f64::INFINITY }
    
    #[inline]
    fn neg_infinity() -> Self { f64::NEG_INFINITY }
}

impl DType for i32 {
    const SIZE: usize = 4;
    const NAME: &'static str = "i32";
    
    #[inline]
    fn zero() -> Self { 0 }
    
    #[inline]
    fn one() -> Self { 1 }
    
    #[inline]
    fn is_finite(&self) -> bool { true } // integers всегда finite
}

impl DType for i64 {
    const SIZE: usize = 8;
    const NAME: &'static str = "i64";
    
    #[inline]
    fn zero() -> Self { 0 }
    
    #[inline]
    fn one() -> Self { 1 }
    
    #[inline]
    fn is_finite(&self) -> bool { true }
}

impl DType for u32 {
    const SIZE: usize = 4;
    const NAME: &'static str = "u32";
    
    #[inline]
    fn zero() -> Self { 0 }
    
    #[inline]
    fn one() -> Self { 1 }
    
    #[inline]
    fn is_finite(&self) -> bool { true }
}

impl DType for u64 {
    const SIZE: usize = 8;
    const NAME: &'static str = "u64";
    
    #[inline]
    fn zero() -> Self { 0 }
    
    #[inline]
    fn one() -> Self { 1 }
    
    #[inline]
    fn is_finite(&self) -> bool { true }
}

/// Enum для runtime type information
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum DataType {
    F32,
    F64,
    I32,
    I64,
    U32,
    U64,
}

impl DataType {
    /// Get size in bytes для данного типа
    pub fn size(&self) -> usize {
        match self {
            DataType::F32 => f32::SIZE,
            DataType::F64 => f64::SIZE,
            DataType::I32 => i32::SIZE,
            DataType::I64 => i64::SIZE,
            DataType::U32 => u32::SIZE,
            DataType::U64 => u64::SIZE,
        }
    }
    
    /// Get type name
    pub fn name(&self) -> &'static str {
        match self {
            DataType::F32 => f32::NAME,
            DataType::F64 => f64::NAME,
            DataType::I32 => i32::NAME,
            DataType::I64 => i64::NAME,
            DataType::U32 => u32::NAME,
            DataType::U64 => u64::NAME,
        }
    }
}

impl fmt::Display for DataType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.name())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dtype_basic_properties() {
        // Test f32
        assert_eq!(f32::SIZE, 4);
        assert_eq!(f32::NAME, "f32");
        assert_eq!(<f32 as DType>::zero(), 0.0);
        assert_eq!(<f32 as DType>::one(), 1.0);
        assert!(<f32 as DType>::zero().is_finite());
        
        // Test i32
        assert_eq!(i32::SIZE, 4);
        assert_eq!(i32::NAME, "i32");
        assert_eq!(<i32 as DType>::zero(), 0);
        assert_eq!(<i32 as DType>::one(), 1);
        assert!(<i32 as DType>::zero().is_finite());
    }
    
    #[test]
    fn test_float_dtype() {
        assert!(<f32 as FloatDType>::nan().is_nan());
        assert!(<f32 as FloatDType>::infinity().is_infinite());
        assert!(!<f32 as FloatDType>::nan().is_finite());
    }
    
    #[test]
    fn test_data_type_enum() {
        assert_eq!(DataType::F32.size(), 4);
        assert_eq!(DataType::F32.name(), "f32");
        assert_eq!(DataType::F32.to_string(), "f32");
    }
}

//! Device abstraction для вычислений на разных устройствах (CPU/GPU)

use serde::{Deserialize, Serialize};
use std::fmt;

/// Тип устройства для вычислений
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum DeviceKind {
    /// CPU computation
    Cpu,
    /// CUDA GPU computation
    #[cfg(feature = "cuda")]
    Cuda(u32), // device index
    /// OpenCL computation  
    #[cfg(feature = "opencl")]
    OpenCl(u32), // device index
}

/// Trait для устройств вычислений
pub trait Device: Send + Sync + fmt::Debug {
    /// Получить тип устройства
    fn kind(&self) -> DeviceKind;
    
    /// Проверить доступность устройства
    fn is_available(&self) -> bool;
    
    /// Получить имя устройства
    fn name(&self) -> &str;
    
    /// Синхронизация устройства (важно для GPU)
    fn synchronize(&self) -> crate::Result<()>;
}

/// CPU device implementation
#[derive(Debug, Clone, Default)]
pub struct Cpu {
    name: String,
}

impl Cpu {
    /// Создать новое CPU устройство
    pub fn new() -> Self {
        Self {
            name: "CPU".to_string(),
        }
    }
}

impl Device for Cpu {
    fn kind(&self) -> DeviceKind {
        DeviceKind::Cpu
    }
    
    fn is_available(&self) -> bool {
        true // CPU всегда доступен
    }
    
    fn name(&self) -> &str {
        &self.name
    }
    
    fn synchronize(&self) -> crate::Result<()> {
        Ok(()) // CPU операции синхронны
    }
}

impl fmt::Display for DeviceKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DeviceKind::Cpu => write!(f, "cpu"),
            #[cfg(feature = "cuda")]
            DeviceKind::Cuda(idx) => write!(f, "cuda:{}", idx),
            #[cfg(feature = "opencl")]
            DeviceKind::OpenCl(idx) => write!(f, "opencl:{}", idx),
        }
    }
}

/// Convenience function для создания CPU device
pub fn cpu() -> Cpu {
    Cpu::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cpu_device() {
        let device = Cpu::new();
        assert_eq!(device.kind(), DeviceKind::Cpu);
        assert!(device.is_available());
        assert_eq!(device.name(), "CPU");
        assert!(device.synchronize().is_ok());
    }
    
    #[test]
    fn test_device_kind_display() {
        assert_eq!(DeviceKind::Cpu.to_string(), "cpu");
    }
}

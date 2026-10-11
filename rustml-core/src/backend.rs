//! Backend abstraction для разных compute engines

use crate::Device;

/// Trait для compute backends
pub trait Backend: Send + Sync + std::fmt::Debug {
    /// Имя backend'а
    fn name(&self) -> &str;

    /// Поддерживаемые устройства
    fn supported_devices(&self) -> Vec<crate::DeviceKind>;

    /// Проверить совместимость с устройством
    fn supports_device(&self, device: &dyn Device) -> bool {
        self.supported_devices().contains(&device.kind())
    }
}

/// CPU backend implementation
#[derive(Debug, Default)]
pub struct CpuBackend;

impl CpuBackend {
    pub fn new() -> Self {
        Self
    }
}

impl Backend for CpuBackend {
    fn name(&self) -> &str {
        "CPU"
    }

    fn supported_devices(&self) -> Vec<crate::DeviceKind> {
        vec![crate::DeviceKind::Cpu]
    }
}

/// Backend registry для управления доступными backends
#[derive(Debug)]
pub struct BackendRegistry {
    backends: Vec<Box<dyn Backend>>,
}

impl BackendRegistry {
    /// Создать новый registry
    pub fn new() -> Self {
        let mut registry = Self {
            backends: Vec::new(),
        };

        // Регистрируем CPU backend по умолчанию
        registry.register(Box::new(CpuBackend::new()));

        registry
    }

    /// Зарегистрировать новый backend
    pub fn register(&mut self, backend: Box<dyn Backend>) {
        self.backends.push(backend);
    }

    /// Найти backend для устройства
    pub fn find_backend(&self, device: &dyn Device) -> Option<&dyn Backend> {
        self.backends
            .iter()
            .find(|backend| backend.supports_device(device))
            .map(|b| b.as_ref())
    }

    /// Получить все доступные backends
    pub fn available_backends(&self) -> &[Box<dyn Backend>] {
        &self.backends
    }
}

impl Default for BackendRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Cpu;

    #[test]
    fn test_cpu_backend() {
        let backend = CpuBackend::new();
        assert_eq!(backend.name(), "CPU");
        assert_eq!(backend.supported_devices(), vec![crate::DeviceKind::Cpu]);

        let cpu_device = Cpu::new();
        assert!(backend.supports_device(&cpu_device));
    }

    #[test]
    fn test_backend_registry() {
        let registry = BackendRegistry::new();
        assert_eq!(registry.available_backends().len(), 1);

        let cpu_device = Cpu::new();
        let backend = registry.find_backend(&cpu_device);
        assert!(backend.is_some());
        assert_eq!(backend.unwrap().name(), "CPU");
    }
}

//! Пример базовых операций с тензорами
//! 
//! Демонстрирует:
//! - Создание тензоров
//! - Арифметические операции
//! - Shape manipulations

use rustml_tensor::{Tensor, Shape};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("🦀 RustML - Пример базовых tensor операций");
    
    // ========================================
    // Создание тензоров
    // ========================================
    
    println!("\n📊 Создание тензоров:");
    
    // Создание тензора заполненного нулями
    let zeros = Tensor::<f32>::zeros([2, 3]);
    println!("Zeros tensor: shape={:?}, device={}", 
        zeros.shape().dims(), zeros.device().name());
    
    // Создание тензора заполненного единицами
    let ones = Tensor::<f32>::ones([2, 3]);
    println!("Ones tensor: shape={:?}, numel={}", 
        ones.shape().dims(), ones.numel());
    
    // Создание тензора из данных
    let data = vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0];
    let from_data = Tensor::<f32>::from_vec(data, [2, 3])?;
    println!("From data: shape={:?}", from_data.shape().dims());
    
    // Скалярный тензор
    let scalar = Tensor::scalar(42.0f32);
    println!("Scalar: value={}, is_scalar={}", 
        scalar.item()?, scalar.shape().is_scalar());
    
    // ========================================
    // Арифметические операции
    // ========================================
    
    println!("\n🧮 Арифметические операции:");
    
    let a = Tensor::<f32>::ones([2, 2]);
    let b = Tensor::<f32>::ones([2, 2]);
    
    // Сложение
    let sum = (&a + &b)?;
    println!("a + b: shape={:?}", sum.shape().dims());
    
    // Умножение
    let product = (&a * &b)?;
    println!("a * b: shape={:?}", product.shape().dims());
    
    // Создание тензоров разных размеров
    let big = Tensor::<f32>::from_vec(
        (1..=12).map(|x| x as f32).collect(), 
        [3, 4]
    )?;
    
    let small = Tensor::<f32>::from_vec(
        vec![10.0, 20.0],
        [1, 2]
    )?;
    
    println!("Big tensor: shape={:?}", big.shape().dims());
    println!("Small tensor: shape={:?}", small.shape().dims());
    
    // ========================================
    // Shape manipulations
    // ========================================
    
    println!("\n🔄 Shape manipulations:");
    
    // Reshape операция
    let original = Tensor::<f32>::ones([2, 6]);
    let reshaped = original.reshape([3, 4])?;
    println!("Reshape: {:?} -> {:?}", 
        original.shape().dims(), reshaped.shape().dims());
    
    // Broadcasting compatibility
    let shape1 = Shape::new(vec![2, 1]);
    let shape2 = Shape::new(vec![1, 3]); 
    if shape1.can_broadcast_with(&shape2) {
        let broadcast_result = shape1.broadcast_with(&shape2)?;
        println!("Broadcasting: {:?} + {:?} = {:?}",
            shape1.dims(), shape2.dims(), broadcast_result.dims());
    }
    
    // ========================================
    // Демонстрация error handling
    // ========================================
    
    println!("\n⚠️  Error handling:");
    
    // Попытка сложения несовместимых тензоров
    let tensor1 = Tensor::<f32>::ones([2, 3]);
    let tensor2 = Tensor::<f32>::ones([3, 2]);
    
    match &tensor1 + &tensor2 {
        Ok(_) => println!("Неожиданно получилось!"),
        Err(e) => println!("Ошибка (ожидаемо): {}", e),
    }
    
    // Попытка reshape с неправильным размером
    match tensor1.reshape([5, 5]) {
        Ok(_) => println!("Неожиданно получилось!"),
        Err(e) => println!("Ошибка reshape (ожидаемо): {}", e),
    }
    
    println!("\n✅ Пример успешно завершен!");
    
    Ok(())
}

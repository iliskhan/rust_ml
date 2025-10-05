//! Тест критерия готовности Milestone 2
//! 
//! Демонстрирует автоматическое дифференцирование:
//! let x = Variable::new(Tensor::from([2.0]), true);
//! let y = &x * &x + 3.0;
//! y.backward();
//! assert_eq!(x.grad().unwrap().item(), 4.0); // dy/dx = 2x = 4

use rustml_autograd::Variable;
use rustml_tensor::Tensor;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("🧮 RustML - Тест автоматического дифференцирования");
    
    // ========================================
    // Критерий готовности Milestone 2
    // ========================================
    
    println!("\n🎯 Критерий готовности Milestone 2:");
    
    // Создаем переменную x = 2.0 с gradient tracking
    let x = Variable::scalar(2.0f32, true);
    println!("x = {}, requires_grad = {}", x.item()?, x.requires_grad());
    
    // Вычисляем y = x * x + 3.0
    let x_squared = (&x * &x)?;
    println!("x² = {}", x_squared.item()?);
    
    let y = (&x_squared + 3.0)?;
    println!("y = x² + 3 = {}", y.item()?);
    
    // Запускаем backward pass
    println!("\n🔄 Запуск backward pass...");
    y.backward()?;
    
    // Проверяем gradient: dy/dx = 2x = 2 * 2 = 4
    if let Some(grad) = x.grad() {
        let grad_value = grad.item()?;
        println!("∂y/∂x = {} (ожидаем 4.0)", grad_value);
        
        if (grad_value - 4.0).abs() < 1e-6 {
            println!("✅ УСПЕХ! Gradient вычислен правильно!");
        } else {
            println!("❌ ОШИБКА! Gradient неправильный.");
            return Err("Gradient verification failed".into());
        }
    } else {
        println!("❌ ОШИБКА! Gradient не вычислен.");
        return Err("No gradient computed".into());
    }
    
    // ========================================
    // Дополнительные тесты
    // ========================================
    
    println!("\n🧪 Дополнительные тесты:");
    
    // Тест 1: Простое сложение
    println!("\nТест 1: a + b");
    let a = Variable::scalar(3.0f32, true);
    let b = Variable::scalar(5.0f32, true);
    let sum = (&a + &b)?;
    sum.backward()?;
    
    println!("a = {}, b = {}, a + b = {}", 
        a.item()?, b.item()?, sum.item()?);
    println!("∂(a+b)/∂a = {} (ожидаем 1.0)", 
        a.grad().unwrap().item()?);
    println!("∂(a+b)/∂b = {} (ожидаем 1.0)", 
        b.grad().unwrap().item()?);
    
    // Тест 2: Произведение
    println!("\nТест 2: a * b");
    let a2 = Variable::scalar(3.0f32, true);
    let b2 = Variable::scalar(5.0f32, true);
    let product = (&a2 * &b2)?;
    product.backward()?;
    
    println!("a = {}, b = {}, a * b = {}", 
        a2.item()?, b2.item()?, product.item()?);
    println!("∂(a*b)/∂a = {} (ожидаем b = 5.0)", 
        a2.grad().unwrap().item()?);
    println!("∂(a*b)/∂b = {} (ожидаем a = 3.0)", 
        b2.grad().unwrap().item()?);
    
    // Тест 3: Более сложное выражение
    println!("\nТест 3: Сложное выражение");
    let x3 = Variable::scalar(2.0f32, true);
    let intermediate = (&x3 * &x3)?;  // x²
    let result = (&intermediate * &x3)?;  // x³
    result.backward()?;
    
    println!("f(x) = x³, x = {}, f(x) = {}", x3.item()?, result.item()?);
    println!("f'(x) = {} (ожидаем 3x² = 12.0)", 
        x3.grad().unwrap().item()?);
    
    println!("\n✅ Все тесты автоматического дифференцирования прошли успешно!");
    
    Ok(())
}

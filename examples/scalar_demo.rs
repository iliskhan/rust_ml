//! Демонстрация работы Scalar wrapper
//! 
//! Теперь можно писать: `Scalar(3.0) + &variable` ✅

use rustml_autograd::{Variable, Scalar};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("═══════════════════════════════════════════════════════════");
    println!("  🎉 SCALAR + VARIABLE ТЕПЕРЬ РАБОТАЕТ!");
    println!("═══════════════════════════════════════════════════════════\n");
    
    // Создаем variable
    let x = Variable::scalar(2.0f32, true);
    println!("x = {}", x.item()?);
    
    println!("\n--- Тест 1: Сложение ---");
    
    // ✅ Старый способ (всегда работал):
    let y1 = (&x + 3.0)?;
    println!("  y1 = x + 3.0 = {}", y1.item()?);
    
    // ✅ НОВЫЙ способ (теперь тоже работает!):
    let y2 = (Scalar(3.0) + &x)?;
    println!("  y2 = Scalar(3.0) + x = {}", y2.item()?);
    
    assert_eq!(y1.item()?, y2.item()?);
    println!("  ✓ Оба способа дают одинаковый результат!");
    
    println!("\n--- Тест 2: Градиенты ---");
    
    // y = 3 + x, dy/dx = 1
    let y = (Scalar(3.0) + &x)?;
    y.backward()?;
    println!("  y = 3 + x");
    println!("  dy/dx = {} (ожидаем 1)", x.grad().unwrap().item()?);
    
    // Очистим градиент
    x.zero_grad();
    
    // Более сложное выражение: y = (3 + x) + (5 + x) = 8 + 2x
    let a = (Scalar(3.0) + &x)?;
    let b = (Scalar(5.0) + &x)?;
    let y = (&a + &b)?;
    y.backward()?;
    println!("\n  y = (3 + x) + (5 + x) = 8 + 2x");
    println!("  значение y = {}", y.item()?);  // 8 + 2*2 = 12
    println!("  dy/dx = {} (ожидаем 2)", x.grad().unwrap().item()?);
    
    println!("\n═══════════════════════════════════════════════════════════");
    println!("  ✅ РАБОТАЕТ! Теперь можно писать:");
    println!("     (&x + 3.0)?       - variable + scalar");
    println!("     (Scalar(3.0) + &x)?  - scalar + variable ✅");
    println!("");
    println!("  📝 TODO (следующие milestone'ы):");
    println!("     - Scalar * Variable");
    println!("     - Scalar - Variable");
    println!("     - Scalar / Variable");
    println!("═══════════════════════════════════════════════════════════\n");
    
    Ok(())
}

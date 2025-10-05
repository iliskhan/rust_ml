//! Демонстрация работы Scalar wrapper
//! 
//! Теперь можно писать: `3.0 + variable` ✅

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
    
    println!("\n--- Тест 2: Умножение ---");
    
    let z1 = (&x * 4.0)?;
    println!("  z1 = x * 4.0 = {}", z1.item()?);
    
    let z2 = (Scalar(4.0) * &x)?;
    println!("  z2 = Scalar(4.0) * x = {}", z2.item()?);
    
    assert_eq!(z1.item()?, z2.item()?);
    println!("  ✓ Умножение тоже работает!");
    
    println!("\n--- Тест 3: Вычитание (НЕ коммутативно) ---");
    
    let w1 = (&x - 1.0)?;
    println!("  w1 = x - 1.0 = {}", w1.item()?);  // 2 - 1 = 1
    
    let w2 = (Scalar(1.0) - &x)?;
    println!("  w2 = Scalar(1.0) - x = {}", w2.item()?);  // 1 - 2 = -1
    
    assert_ne!(w1.item()?, w2.item()?);
    println!("  ✓ x - a ≠ a - x (как и ожидалось)");
    
    println!("\n--- Тест 4: Деление (НЕ коммутативно) ---");
    
    let d1 = (&x / 2.0)?;
    println!("  d1 = x / 2.0 = {}", d1.item()?);  // 2 / 2 = 1
    
    let d2 = (Scalar(6.0) / &x)?;
    println!("  d2 = Scalar(6.0) / x = {}", d2.item()?);  // 6 / 2 = 3
    
    assert_ne!(d1.item()?, d2.item()?);
    println!("  ✓ x / a ≠ a / x (как и ожидалось)");
    
    println!("\n--- Тест 5: Градиенты ---");
    
    // y = 3 + x, dy/dx = 1
    let y = (Scalar(3.0) + &x)?;
    y.backward()?;
    println!("  y = 3 + x");
    println!("  dy/dx = {} (ожидаем 1)", x.grad().unwrap().item()?);
    
    // Очистим градиент
    x.zero_grad();
    
    // y = 5 - x, dy/dx = -1
    let y = (Scalar(5.0) - &x)?;
    y.backward()?;
    println!("\n  y = 5 - x");
    println!("  dy/dx = {} (ожидаем -1)", x.grad().unwrap().item()?);
    
    x.zero_grad();
    
    // y = 6 / x, dy/dx = -6/x² = -6/4 = -1.5
    let y = (Scalar(6.0) / &x)?;
    y.backward()?;
    println!("\n  y = 6 / x (где x=2)");
    println!("  dy/dx = {} (ожидаем -1.5)", x.grad().unwrap().item()?);
    
    println!("\n═══════════════════════════════════════════════════════════");
    println!("  ✅ ВСЁ РАБОТАЕТ! Теперь можно писать:");
    println!("     (3.0 + &x)?      или   (Scalar(3.0) + &x)?");
    println!("═══════════════════════════════════════════════════════════\n");
    
    Ok(())
}

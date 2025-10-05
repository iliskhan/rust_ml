// Быстрый тест: компилируем и показываем что синтаксис работает

use rustml_autograd::{Variable, Scalar};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let x = Variable::scalar(2.0f32, true);
    
    // ✅ ТЕПЕРЬ ЭТО РАБОТАЕТ:
    let y = (Scalar(3.0) + &x)?;
    
    println!("x = {}", x.item()?);
    println!("y = 3.0 + x = {}", y.item()?);
    
    // Проверяем градиент
    y.backward()?;
    println!("dy/dx = {}", x.grad().unwrap().item()?);
    
    Ok(())
}

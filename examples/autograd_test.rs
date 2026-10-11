//! Дифференцирование скалярных выражений и накопление градиентов.

use rustml_autograd::Variable;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let x = Variable::scalar(2.0f64, true);
    let squared = (&x * &x)?;
    let y = (&squared + 3.0)?;
    assert_eq!(y.item()?, 7.0);
    y.backward()?;
    assert_eq!(x.grad().expect("x gradient").item()?, 4.0);

    // Повторный backward добавляет ещё один вклад листу.
    y.backward()?;
    assert_eq!(x.grad().expect("accumulated gradient").item()?, 8.0);
    x.zero_grad();

    let cubed = (&squared * &x)?;
    cubed.backward()?;
    assert_eq!(x.grad().expect("cube gradient").item()?, 12.0);
    println!("x = 2: d(x² + 3)/dx = 4, d(x³)/dx = 12; накопление проверено.");
    Ok(())
}

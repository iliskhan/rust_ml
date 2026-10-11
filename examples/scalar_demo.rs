//! Scalar позволяет ставить число слева при сложении и умножении.

use rustml_autograd::{Scalar, Variable};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let x = Variable::scalar(2.0f64, true);
    let right_add = (&x + 3.0)?;
    let left_add = (Scalar(3.0) + &x)?;
    assert_eq!(left_add.item()?, right_add.item()?);
    left_add.backward()?;
    assert_eq!(x.grad().expect("addition gradient").item()?, 1.0);
    x.zero_grad();

    let right_mul = (&x * 3.0)?;
    let left_mul = (Scalar(3.0) * &x)?;
    assert_eq!(left_mul.item()?, right_mul.item()?);
    left_mul.backward()?;
    assert_eq!(x.grad().expect("multiplication gradient").item()?, 3.0);
    x.zero_grad();

    let a = (Scalar(3.0) + &x)?;
    let b = (Scalar(5.0) + &x)?;
    let y = (&a + &b)?;
    y.backward()?;
    assert_eq!(y.item()?, 12.0);
    assert_eq!(x.grad().expect("branched gradient").item()?, 2.0);
    println!("Scalar + Variable и Scalar * Variable: значения и градиенты проверены.");
    Ok(())
}

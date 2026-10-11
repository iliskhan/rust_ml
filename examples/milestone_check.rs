//! Проверка текущего CPU этапа: тензоры, broadcasting и backward.

use rustml_autograd::Variable;
use rustml_tensor::Tensor;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let zeros = Tensor::<f64>::zeros([2, 3]);
    let ones = Tensor::<f64>::ones([2, 3]);
    let sum = (&zeros + &ones)?;
    assert_eq!(sum.shape().dims(), &[2, 3]);
    assert!(sum.data().iter().all(|&value| value == 1.0));

    let x = Variable::from_vec(vec![1.0f64, 2.0, 3.0, 4.0, 5.0, 6.0], [2, 3], true)?;
    let bias = Variable::from_vec(vec![10.0, 20.0, 30.0], [3], true)?;
    let shifted = (&x + &bias)?;
    assert_eq!(shifted.data().shape().dims(), &[2, 3]);
    // Для нескалярного результата backward дифференцирует сумму элементов.
    shifted.backward()?;
    assert!(x
        .grad()
        .expect("x gradient")
        .data()
        .iter()
        .all(|&value| value == 1.0));
    assert_eq!(
        bias.grad()
            .expect("bias gradient")
            .data()
            .iter()
            .copied()
            .collect::<Vec<_>>(),
        [2.0, 2.0, 2.0]
    );

    let scalar = Variable::new(Tensor::scalar(2.0f64), true);
    let squared = (&scalar * &scalar)?;
    let y = (&squared + 3.0)?;
    y.backward()?;
    assert_eq!(scalar.grad().expect("scalar gradient").item()?, 4.0);
    println!("Текущие проверки CPU тензоров и autograd прошли.");
    Ok(())
}

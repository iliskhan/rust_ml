//! Создание CPU тензоров, broadcasting, reshape и матричное умножение.

use rustml_tensor::{ops::TensorOps, Shape, Tensor};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let zeros = Tensor::<f32>::zeros([2, 3]);
    let ones = Tensor::<f32>::ones([2, 3]);
    let sum = (&zeros + &ones)?;
    assert_eq!(sum.shape().dims(), &[2, 3]);
    assert!(sum.data().iter().all(|&value| value == 1.0));

    let matrix = Tensor::from_vec(vec![1.0f32, 2.0, 3.0, 4.0, 5.0, 6.0], [2, 3])?;
    let bias = Tensor::from_vec(vec![10.0, 20.0, 30.0], [3])?;
    let shifted = (&matrix + &bias)?;
    assert_eq!(
        shifted.data().iter().copied().collect::<Vec<_>>(),
        [11.0, 22.0, 33.0, 14.0, 25.0, 36.0]
    );

    let reshaped = matrix.reshape([3, 2])?;
    assert_eq!(reshaped.shape().dims(), &[3, 2]);
    let transposed = matrix.transpose()?;
    let product = matrix.matmul(&transposed)?;
    assert_eq!(product.shape().dims(), &[2, 2]);
    assert_eq!(
        product.data().iter().copied().collect::<Vec<_>>(),
        [14.0, 32.0, 32.0, 77.0]
    );

    let broadcast = Shape::new(vec![2, 1]).broadcast_with(&Shape::new(vec![1, 3]))?;
    assert_eq!(broadcast.dims(), &[2, 3]);
    assert!((&matrix + &Tensor::<f32>::ones([3, 2])).is_err());
    assert!(matrix.reshape([5, 5]).is_err());
    assert_eq!(Tensor::scalar(42.0f32).item()?, 42.0);
    println!("CPU тензоры: арифметика, broadcasting, reshape и matmul проверены.");
    Ok(())
}

use rustml::{DeviceKind, Result, Scalar, Tensor, TensorOps, Variable};

#[test]
fn facade_supports_cpu_broadcasting_and_autograd() -> Result<()> {
    let matrix = Tensor::from_vec(vec![1.0f64, 2.0, 3.0, 4.0, 5.0, 6.0], [2, 3])?;
    let bias = Tensor::from_vec(vec![10.0, 20.0, 30.0], [3])?;
    let sum = (&matrix + &bias)?;
    assert_eq!(sum.device().kind(), DeviceKind::Cpu);
    assert_eq!(sum.shape().dims(), &[2, 3]);
    assert_eq!(
        sum.data().iter().copied().collect::<Vec<_>>(),
        [11.0, 22.0, 33.0, 14.0, 25.0, 36.0]
    );

    let identity = Tensor::from_vec(vec![1.0, 0.0, 0.0, 1.0], [2, 2])?;
    let product = identity.matmul(&matrix)?;
    assert_eq!(product.data(), matrix.data());

    let x = Variable::new(matrix, true);
    let bias = Variable::new(bias, true);
    let shifted = (&x + &bias)?;
    let loss = (&shifted * &shifted)?;
    loss.backward()?;
    // backward() on a non-scalar output differentiates the sum of its elements.
    assert_eq!(
        x.grad()
            .expect("x gradient")
            .data()
            .iter()
            .copied()
            .collect::<Vec<_>>(),
        [22.0, 44.0, 66.0, 28.0, 50.0, 72.0]
    );
    assert_eq!(
        bias.grad()
            .expect("bias gradient")
            .data()
            .iter()
            .copied()
            .collect::<Vec<_>>(),
        [50.0, 94.0, 138.0]
    );

    let scale = (Scalar(2.0) * &shifted)?;
    assert_eq!(scale.data().shape().dims(), &[2, 3]);
    Ok(())
}

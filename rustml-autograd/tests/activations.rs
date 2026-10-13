use rustml_autograd::Variable;
use rustml_core::{Device, DeviceKind, Result};
use rustml_tensor::Tensor;
use std::sync::Arc;

#[test]
fn relu_values_seeded_gradients_and_signed_zero() -> Result<()> {
    let input = Variable::from_vec(vec![-3.0_f64, -0.0, 0.0, 2.0], [2, 2], true)?;
    let output = input.relu()?;
    assert_eq!(output.data().shape(), input.data().shape());
    assert_eq!(
        output.data().data().iter().copied().collect::<Vec<_>>(),
        [0.0, 0.0, 0.0, 2.0]
    );
    assert!(output.data().data()[[0, 1]].is_sign_positive());
    output.backward_with_grad(Tensor::from_vec(vec![3.0, 4.0, 5.0, 6.0], [2, 2])?)?;
    assert_eq!(
        input
            .grad()
            .unwrap()
            .data()
            .iter()
            .copied()
            .collect::<Vec<_>>(),
        [0.0, 0.0, 0.0, 6.0]
    );
    Ok(())
}

#[test]
fn relu_finite_differences_away_from_zero() -> Result<()> {
    let values = [-3.0_f64, -0.4, 0.2, 2.0];
    let input = Variable::from_vec(values.to_vec(), [4], true)?;
    // Includes repeated use of the same ReLU node in a graph.
    let output = input.relu()?;
    let loss = (&output * &output)?.mean()?;
    loss.backward()?;
    for index in 0..values.len() {
        let evaluate = |delta| -> Result<f64> {
            let mut perturbed = values;
            perturbed[index] += delta;
            let output = Variable::from_vec(perturbed.to_vec(), [4], false)?.relu()?;
            (&output * &output)?.mean()?.item()
        };
        let numeric = (evaluate(1e-6)? - evaluate(-1e-6)?) / 2e-6;
        assert!((input.grad().unwrap().data()[[index]] - numeric).abs() < 1e-9);
    }
    Ok(())
}

#[test]
fn relu_nan_and_infinity_policy() -> Result<()> {
    let input = Variable::from_vec(
        vec![f64::NAN, f64::NEG_INFINITY, f64::INFINITY, -1.0],
        [4],
        true,
    )?;
    let output = input.relu()?;
    assert!(output.data().data()[[0]].is_nan());
    assert_eq!(output.data().data()[[1]], 0.0);
    assert_eq!(output.data().data()[[2]], f64::INFINITY);
    output.backward_with_grad(Tensor::from_vec(vec![2.0, 3.0, 4.0, f64::INFINITY], [4])?)?;
    let gradient = input.grad().unwrap();
    assert!(gradient.data()[[0]].is_nan());
    assert_eq!(gradient.data()[[1]], 0.0);
    assert_eq!(gradient.data()[[2]], 4.0);
    // IEEE 754 multiplication: infinite upstream gradient times zero is NaN.
    assert!(gradient.data()[[3]].is_nan());
    Ok(())
}

#[test]
fn relu_f32_scalar_empty_untracked_and_saved_value_ownership() -> Result<()> {
    let mut input = Variable::scalar(2.0_f32, true);
    let output = input.relu()?;
    assert_eq!(output.item()?, 2.0);
    assert!(input.data_mut().is_err());
    output.backward()?;
    assert_eq!(input.grad().unwrap().item()?, 1.0);
    drop(output);
    *input.data_mut()? = Tensor::scalar(-2.0);
    assert_eq!(input.relu()?.item()?, 0.0);
    let untracked = Variable::<f32>::ones([2, 1, 3], false).relu()?;
    assert!(!untracked.requires_grad());
    assert_eq!(untracked.data().shape().dims(), &[2, 1, 3]);
    let empty = Variable::<f32>::zeros([0, 2], true);
    let output = empty.relu()?;
    output.backward()?;
    assert_eq!(empty.grad().unwrap().shape().dims(), &[0, 2]);
    Ok(())
}

#[derive(Debug)]
struct UnavailableCpu;

impl Device for UnavailableCpu {
    fn kind(&self) -> DeviceKind {
        DeviceKind::Cpu
    }
    fn is_available(&self) -> bool {
        false
    }
    fn name(&self) -> &str {
        "unavailable CPU"
    }
    fn synchronize(&self) -> Result<()> {
        Ok(())
    }
}

#[test]
fn relu_rejects_unavailable_devices_even_without_gradients_or_values() {
    for shape in [[1], [0]] {
        let data = Tensor::<f64>::zeros(shape).into_data();
        let tensor = Tensor::new(data, Arc::new(UnavailableCpu));
        assert!(Variable::new(tensor, false).relu().is_err());
    }
}

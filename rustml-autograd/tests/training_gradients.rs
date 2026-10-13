use rustml_autograd::Variable;
use rustml_core::{Device, DeviceKind, RustMLError};
use rustml_tensor::Tensor;
use std::sync::Arc;

fn values(tensor: &Tensor<f64>) -> Vec<f64> {
    tensor.data().iter().copied().collect()
}

fn assert_close(actual: f64, expected: f64) {
    assert!(
        (actual - expected).abs() < 1e-7 * (1.0 + expected.abs()),
        "actual {actual}, expected {expected}"
    );
}

fn finite_differences(data: &[f64], objective: impl Fn(&[f64]) -> f64) -> Vec<f64> {
    let epsilon = 1e-6;
    (0..data.len())
        .map(|index| {
            let mut plus = data.to_vec();
            let mut minus = data.to_vec();
            plus[index] += epsilon;
            minus[index] -= epsilon;
            (objective(&plus) - objective(&minus)) / (2.0 * epsilon)
        })
        .collect()
}

fn assert_gradient(variable: &Variable<f64>, expected: &[f64]) {
    let gradient = variable.grad().expect("gradient is present");
    assert_eq!(gradient.shape(), variable.data().shape());
    let actual = values(&gradient);
    assert_eq!(actual.len(), expected.len());
    for (&actual, &expected) in actual.iter().zip(expected) {
        assert_close(actual, expected);
    }
}

fn matrix_product(left: &[f64], right: &[f64], m: usize, k: usize, n: usize) -> Vec<f64> {
    (0..m * n)
        .map(|index| {
            (0..k)
                .map(|inner| left[index / n * k + inner] * right[inner * n + index % n])
                .sum()
        })
        .collect()
}

#[test]
fn rectangular_matmul_matches_finite_differences_for_both_operands() {
    let left_data = [0.3, -1.2, 2.0, 0.7, -0.4, 1.1];
    let right_data = [
        0.4, -0.8, 1.3, 0.2, -1.0, 0.6, 0.9, -0.3, 0.7, 1.4, -0.5, 1.2,
    ];
    let seed = [0.2, -1.3, 0.7, 1.1, -0.9, 0.4, 1.7, -0.6];
    let objective = |left: &[f64], right: &[f64]| {
        matrix_product(left, right, 2, 3, 4)
            .iter()
            .zip(seed)
            .map(|(value, weight)| value * weight)
            .sum::<f64>()
    };
    let left = Variable::from_vec(left_data.to_vec(), [2, 3], true).unwrap();
    let right = Variable::from_vec(right_data.to_vec(), [3, 4], true).unwrap();
    let output = left.matmul(&right).unwrap();
    assert_eq!(output.data().shape().dims(), &[2, 4]);
    assert_eq!(
        values(output.data()),
        matrix_product(&left_data, &right_data, 2, 3, 4)
    );
    output
        .backward_with_grad(Tensor::from_vec(seed.to_vec(), [2, 4]).unwrap())
        .unwrap();
    assert_gradient(
        &left,
        &finite_differences(&left_data, |data| objective(data, &right_data)),
    );
    assert_gradient(
        &right,
        &finite_differences(&right_data, |data| objective(&left_data, data)),
    );
}

#[test]
fn composed_mse_matches_finite_differences_including_target_and_bias() {
    let input_data = [0.2, -0.7, 1.3, 0.4, -0.9, 1.1];
    let weight_data = [0.6, -0.3, 1.2, 0.8];
    let bias_data = [0.15, -0.25];
    let target_data = [0.1, 0.5, -0.4, 1.0, 0.7, -0.2];
    let objective = |input: &[f64], weight: &[f64], bias: &[f64], target: &[f64]| {
        matrix_product(input, weight, 3, 2, 2)
            .iter()
            .enumerate()
            .map(|(index, value)| (value + bias[index % 2] - target[index]).powi(2))
            .sum::<f64>()
            / 6.0
    };
    let input = Variable::from_vec(input_data.to_vec(), [3, 2], true).unwrap();
    let weight = Variable::from_vec(weight_data.to_vec(), [2, 2], true).unwrap();
    let bias = Variable::from_vec(bias_data.to_vec(), [1, 2], true).unwrap();
    let target = Variable::from_vec(target_data.to_vec(), [3, 2], true).unwrap();
    let prediction = (&input.matmul(&weight).unwrap() + &bias).unwrap();
    let residual = (&prediction - &target).unwrap();
    let loss = (&residual * &residual).unwrap().mean().unwrap();
    assert!(loss.data().shape().is_scalar());
    assert_close(
        loss.item().unwrap(),
        objective(&input_data, &weight_data, &bias_data, &target_data),
    );
    loss.backward().unwrap();
    assert_gradient(
        &input,
        &finite_differences(&input_data, |data| {
            objective(data, &weight_data, &bias_data, &target_data)
        }),
    );
    assert_gradient(
        &weight,
        &finite_differences(&weight_data, |data| {
            objective(&input_data, data, &bias_data, &target_data)
        }),
    );
    assert_gradient(
        &bias,
        &finite_differences(&bias_data, |data| {
            objective(&input_data, &weight_data, data, &target_data)
        }),
    );
    assert_gradient(
        &target,
        &finite_differences(&target_data, |data| {
            objective(&input_data, &weight_data, &bias_data, data)
        }),
    );
}

#[test]
fn shared_matrix_and_reused_branches_accumulate_only_new_backward_deltas() {
    let data = [0.4, -0.7, 1.2, 0.3];
    let objective = |data: &[f64]| {
        matrix_product(data, data, 2, 2, 2)
            .iter()
            .map(|value| value * value + value)
            .sum::<f64>()
            / 4.0
    };
    let expected = finite_differences(&data, objective);
    let input = Variable::from_vec(data.to_vec(), [2, 2], true).unwrap();
    let product = input.matmul(&input).unwrap();
    let square = (&product * &product).unwrap();
    let loss = (&square + &product).unwrap().mean().unwrap();
    loss.backward().unwrap();
    assert_gradient(&input, &expected);
    loss.backward().unwrap();
    assert_gradient(
        &input,
        &expected.iter().map(|value| value * 2.0).collect::<Vec<_>>(),
    );
    input.zero_grad();
    loss.backward_with_grad(Tensor::scalar(3.0)).unwrap();
    assert_gradient(
        &input,
        &expected.iter().map(|value| value * 3.0).collect::<Vec<_>>(),
    );
    let expected_product = values(product.data())
        .iter()
        .map(|value| 5.0 * (2.0 * value + 1.0) / 4.0)
        .collect::<Vec<_>>();
    assert_gradient(&product, &expected_product);
    assert_close(loss.grad().unwrap().item().unwrap(), 5.0);
}

#[test]
fn subtraction_reduces_broadcast_gradients_with_correct_signs() {
    let left = Variable::from_vec(vec![0.3, -0.8], [2, 1], true).unwrap();
    let right = Variable::from_vec(vec![1.2, -0.4, 0.7], [3], true).unwrap();
    let output = (&left - &right).unwrap();
    assert_eq!(output.data().shape().dims(), &[2, 3]);
    output
        .backward_with_grad(Tensor::from_vec(vec![0.2, -0.7, 1.3, -1.1, 0.4, 0.9], [2, 3]).unwrap())
        .unwrap();
    assert_gradient(&left, &[0.8, 0.2]);
    assert_gradient(&right, &[0.9, 0.3, -2.2]);

    let scalar = Variable::scalar(2.0, true);
    let reverse = (&scalar - &right).unwrap();
    reverse.backward().unwrap();
    assert_gradient(&scalar, &[3.0]);
    assert_gradient(&right, &[-0.1, -0.7, -3.2]);
}

#[test]
fn mean_accepts_scalars_and_all_nonempty_ranks_with_scalar_seed() {
    for shape in [vec![], vec![1], vec![2, 1, 3]] {
        let count = shape.iter().product::<usize>();
        let data = (0..count)
            .map(|index| index as f64 - 1.5)
            .collect::<Vec<_>>();
        let input = Variable::from_vec(data.clone(), shape, true).unwrap();
        let mean = input.mean().unwrap();
        assert!(mean.data().shape().is_scalar());
        assert_close(
            mean.item().unwrap(),
            data.iter().sum::<f64>() / count as f64,
        );
        assert!(mean.backward_with_grad(Tensor::ones([1])).is_err());
        assert!(mean.grad().is_none());
        assert!(input.grad().is_none());
        mean.backward_with_grad(Tensor::scalar(-2.5)).unwrap();
        assert_gradient(&input, &vec![-2.5 / count as f64; count]);
    }
}

#[test]
fn invalid_shapes_ranks_and_empty_means_return_errors_without_gradients() {
    let matrix = Variable::<f64>::ones([2, 3], true);
    for shape in [vec![], vec![3], vec![1, 3, 2]] {
        let invalid = Variable::<f64>::ones(shape, true);
        assert!(matches!(
            matrix.matmul(&invalid),
            Err(RustMLError::InvalidShape { .. })
        ));
        assert!(matches!(
            invalid.matmul(&matrix),
            Err(RustMLError::InvalidShape { .. })
        ));
        assert!(invalid.grad().is_none());
    }
    let incompatible = Variable::<f64>::ones([4, 2], true);
    assert!(matches!(
        matrix.matmul(&incompatible),
        Err(RustMLError::DimensionMismatch { .. })
    ));
    assert!((&matrix - &incompatible).is_err());
    assert!(matrix.grad().is_none());
    assert!(incompatible.grad().is_none());
    for shape in [vec![0], vec![2, 0], vec![0, 2, 3]] {
        let empty = Variable::<f64>::zeros(shape, true);
        assert!(empty.mean().is_err());
        assert!(empty.grad().is_none());
    }
}

#[test]
fn empty_matrix_axes_are_valid_and_backward_preserves_operand_shapes() {
    for (m, k, n) in [(0, 3, 2), (2, 3, 0), (2, 0, 3), (0, 0, 0)] {
        let left = Variable::<f64>::ones([m, k], true);
        let right = Variable::<f64>::ones([k, n], true);
        let output = left.matmul(&right).unwrap();
        assert_eq!(output.data().shape().dims(), &[m, n]);
        assert_eq!(values(output.data()), vec![0.0; m * n]);
        output.backward().unwrap();
        assert_gradient(&left, &vec![0.0; m * k]);
        assert_gradient(&right, &vec![0.0; k * n]);
    }
    let empty = Variable::<f64>::zeros([0, 3], true);
    let row = Variable::<f64>::ones([1, 3], true);
    (&row - &empty).unwrap().backward().unwrap();
    assert_gradient(&empty, &[]);
    assert_gradient(&row, &[0.0; 3]);
}

#[test]
fn constants_track_only_when_a_matmul_or_subtraction_operand_requires_it() {
    for (left_tracks, right_tracks) in [(false, false), (true, false), (false, true)] {
        let left = Variable::<f64>::ones([2, 3], left_tracks);
        let right = Variable::<f64>::ones([3, 2], right_tracks);
        let output = left.matmul(&right).unwrap().mean().unwrap();
        assert_eq!(output.requires_grad(), left_tracks || right_tracks);
        assert_close(output.item().unwrap(), 3.0);
        if output.requires_grad() {
            output.backward().unwrap();
        } else {
            assert!(output.backward().is_err());
        }
        if left_tracks {
            assert_gradient(&left, &[0.5; 6]);
        } else {
            assert!(left.grad().is_none());
        }
        if right_tracks {
            assert_gradient(&right, &[0.5; 6]);
        } else {
            assert!(right.grad().is_none());
        }

        let left = Variable::scalar(4.0, left_tracks);
        let right = Variable::scalar(1.0, right_tracks);
        let output = (&left - &right).unwrap().mean().unwrap();
        assert_eq!(output.requires_grad(), left_tracks || right_tracks);
        assert_close(output.item().unwrap(), 3.0);
        if output.requires_grad() {
            output.backward().unwrap();
        }
        if left_tracks {
            assert_gradient(&left, &[1.0]);
        } else {
            assert!(left.grad().is_none());
        }
        if right_tracks {
            assert_gradient(&right, &[-1.0]);
        } else {
            assert!(right.grad().is_none());
        }
    }
}

#[test]
fn saved_training_inputs_cannot_mutate_until_the_graph_is_dropped() {
    let mut input = Variable::from_vec(vec![1.0, 2.0, 3.0, 4.0], [2, 2], true).unwrap();
    let mut constant = Variable::<f64>::ones([2, 2], false);
    let mut loss = (&input.matmul(&constant).unwrap() - &constant)
        .unwrap()
        .mean()
        .unwrap();
    assert!(input.data_mut().is_err());
    assert!(input.set_requires_grad(false).is_err());
    assert!(constant.data_mut().is_err());
    assert!(constant.set_requires_grad(true).is_err());
    assert!(loss.data_mut().is_err());
    assert!(loss.set_requires_grad(false).is_err());
    let mut detached = loss.detach();
    detached.data_mut().unwrap().data_mut().fill(-10.0);
    assert_close(loss.item().unwrap(), 4.0);
    assert_close(detached.item().unwrap(), -10.0);
    assert!(!detached.requires_grad());
    loss.backward().unwrap();
    assert_gradient(&input, &[0.5; 4]);
    assert!(constant.grad().is_none());
    drop(loss);
    input.data_mut().unwrap().data_mut().fill(2.0);
    constant.data_mut().unwrap().data_mut().fill(3.0);
    assert!(input.grad().is_none());
    let loss = input.matmul(&constant).unwrap().mean().unwrap();
    loss.backward().unwrap();
    assert_gradient(&input, &[1.5; 4]);

    let mut mean_input = Variable::<f64>::ones([2], true);
    let mean = mean_input.mean().unwrap();
    assert!(mean_input.data_mut().is_err());
    drop(mean);
    assert!(mean_input.data_mut().is_ok());
}

#[derive(Debug)]
struct NamedCpu {
    available: bool,
}

impl Device for NamedCpu {
    fn kind(&self) -> DeviceKind {
        DeviceKind::Cpu
    }
    fn is_available(&self) -> bool {
        self.available
    }
    fn name(&self) -> &str {
        "training test CPU"
    }
    fn synchronize(&self) -> rustml_core::Result<()> {
        Ok(())
    }
}

#[test]
fn training_operations_preserve_device_metadata_and_reject_unavailable_cpu() {
    let make = |available| {
        Variable::new(
            Tensor::new(
                Tensor::<f64>::ones([2, 2]).into_data(),
                Arc::new(NamedCpu { available }),
            ),
            true,
        )
    };
    let available = make(true);
    let other = Variable::<f64>::ones([2, 2], false);
    for output in [
        available.matmul(&other).unwrap(),
        (&available - &other).unwrap(),
        available.mean().unwrap(),
    ] {
        assert_eq!(output.data().device().name(), "training test CPU");
    }
    let unavailable = make(false);
    assert!(unavailable.matmul(&other).is_err());
    assert!(other.matmul(&unavailable).is_err());
    assert!((&unavailable - &other).is_err());
    assert!((&other - &unavailable).is_err());
    assert!(unavailable.mean().is_err());
    assert!(unavailable.grad().is_none());
}

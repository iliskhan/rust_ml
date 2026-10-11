use rustml_autograd::{IntoScalar, Scalar, Variable};
use rustml_core::{Device, DeviceKind};
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

#[test]
fn shared_broadcast_graph_matches_finite_differences() {
    let x_data = [1.25, -0.7];
    let a_data = [0.4, -1.3, 2.1];
    let weights = [0.2, -0.5, 1.1, -1.7, 0.3, 0.9];
    let objective = |x: &[f64; 2], a: &[f64; 3]| {
        let mut result = 0.0;
        for i in 0..2 {
            for j in 0..3 {
                let p = x[i] * a[j];
                result += (p * p + p) * weights[i * 3 + j];
            }
        }
        result
    };
    let x = Variable::from_vec(x_data.to_vec(), [2, 1], true).unwrap();
    let a = Variable::from_vec(a_data.to_vec(), [3], true).unwrap();
    let product = (&x * &a).unwrap();
    let square = (&product * &product).unwrap();
    let output = (&square + &product).unwrap();
    output
        .backward_with_grad(Tensor::from_vec(weights.to_vec(), [2, 3]).unwrap())
        .unwrap();
    let dx = x.grad().unwrap();
    let da = a.grad().unwrap();
    assert_eq!(dx.shape().dims(), &[2, 1]);
    assert_eq!(da.shape().dims(), &[3]);
    let epsilon = 1e-6;
    for i in 0..2 {
        let mut plus = x_data;
        let mut minus = x_data;
        plus[i] += epsilon;
        minus[i] -= epsilon;
        let numerical = (objective(&plus, &a_data) - objective(&minus, &a_data)) / (2.0 * epsilon);
        assert_close(dx.data()[[i, 0]], numerical);
    }
    for j in 0..3 {
        let mut plus = a_data;
        let mut minus = a_data;
        plus[j] += epsilon;
        minus[j] -= epsilon;
        let numerical = (objective(&x_data, &plus) - objective(&x_data, &minus)) / (2.0 * epsilon);
        assert_close(da.data()[[j]], numerical);
    }
}

#[test]
fn repeated_backward_propagates_only_new_deltas() {
    let x = Variable::scalar(2.0_f64, true);
    let square = (&x * &x).unwrap();
    let output = (&square * &x).unwrap();
    output.backward().unwrap();
    assert_eq!(x.grad().unwrap().item().unwrap(), 12.0);
    assert_eq!(square.grad().unwrap().item().unwrap(), 2.0);
    output.backward().unwrap();
    assert_eq!(x.grad().unwrap().item().unwrap(), 24.0);
    assert_eq!(square.grad().unwrap().item().unwrap(), 4.0);
    x.zero_grad();
    output.backward_with_grad(Tensor::scalar(3.0)).unwrap();
    assert_eq!(x.grad().unwrap().item().unwrap(), 36.0);
    assert_eq!(square.grad().unwrap().item().unwrap(), 10.0);
    assert_eq!(output.grad().unwrap().item().unwrap(), 5.0);
}

#[test]
fn addition_reduces_all_broadcast_axes_and_scalar_gradients() {
    let x = Variable::<f64>::ones([2, 1, 3], true);
    let bias = Variable::<f64>::ones([4, 1], true);
    let scalar = Variable::scalar(5.0, true);
    let output = (&(&x + &bias).unwrap() + &scalar).unwrap();
    assert_eq!(output.data().shape().dims(), &[2, 4, 3]);
    output.backward().unwrap();
    assert_eq!(x.grad().unwrap().shape().dims(), &[2, 1, 3]);
    assert_eq!(values(&x.grad().unwrap()), vec![4.0; 6]);
    assert_eq!(bias.grad().unwrap().shape().dims(), &[4, 1]);
    assert_eq!(values(&bias.grad().unwrap()), vec![6.0; 4]);
    assert!(scalar.grad().unwrap().shape().is_scalar());
    assert_eq!(scalar.grad().unwrap().item().unwrap(), 24.0);
}

#[test]
fn empty_broadcast_gradients_preserve_shapes_and_sum_to_zero() {
    for multiply in [false, true] {
        let x = Variable::<f64>::zeros([0, 3], true);
        let bias = Variable::<f64>::ones([1, 3], true);
        let output = if multiply { &x * &bias } else { &x + &bias }.unwrap();
        output.backward().unwrap();
        assert_eq!(x.grad().unwrap().shape().dims(), &[0, 3]);
        assert_eq!(x.grad().unwrap().numel(), 0);
        assert_eq!(bias.grad().unwrap().shape().dims(), &[1, 3]);
        assert_eq!(values(&bias.grad().unwrap()), vec![0.0; 3]);
    }
}

#[test]
fn seed_requires_exact_shape_and_tracking_without_modifying_gradients() {
    let x = Variable::<f64>::ones([2, 1], true);
    let output = (&x * &x).unwrap();
    assert!(output.backward_with_grad(Tensor::ones([2])).is_err());
    assert!(output.backward_with_grad(Tensor::scalar(1.0)).is_err());
    assert!(output.grad().is_none());
    assert!(x.grad().is_none());
    output
        .backward_with_grad(Tensor::from_vec(vec![2.0, -3.0], [2, 1]).unwrap())
        .unwrap();
    assert_eq!(values(&x.grad().unwrap()), vec![4.0, -6.0]);
    assert!(output.backward_with_grad(Tensor::ones([1, 2])).is_err());
    assert_eq!(values(&x.grad().unwrap()), vec![4.0, -6.0]);
    let constant = Variable::scalar(1.0_f64, false);
    assert!(constant.backward().is_err());
    assert!(constant.backward_with_grad(Tensor::scalar(1.0)).is_err());
    assert!(constant.grad().is_none());
}

#[test]
fn clones_share_identity_and_mutation_requires_a_unique_leaf() {
    let mut x = Variable::scalar(2.0_f64, true);
    let alias = x.clone();
    assert!(std::ptr::eq(x.data(), alias.data()));
    x.backward().unwrap();
    assert_eq!(alias.grad().unwrap().item().unwrap(), 1.0);
    assert!(x.data_mut().is_err());
    assert!(x.set_requires_grad(false).is_err());
    assert!(alias.requires_grad());
    assert_eq!(x.grad().unwrap().item().unwrap(), 1.0);
    alias.zero_grad();
    assert!(x.grad().is_none());
    drop(alias);

    let mut output = (&x * &x).unwrap();
    output.backward().unwrap();
    assert!(x.data_mut().is_err());
    assert!(x.set_requires_grad(false).is_err());
    assert!(output.data_mut().is_err());
    assert!(output.set_requires_grad(false).is_err());
    assert_eq!(x.grad().unwrap().item().unwrap(), 4.0);
    drop(output);
    x.data_mut().unwrap().data_mut().fill(3.0);
    assert!(x.grad().is_none());
    assert!(x.requires_grad());
    let output = (&x * &x).unwrap();
    output.backward().unwrap();
    assert_eq!(x.grad().unwrap().item().unwrap(), 6.0);
    drop(output);
    x.set_requires_grad(false).unwrap();
    assert!(x.grad().is_none());
    assert!(!x.requires_grad());
    x.set_requires_grad(true).unwrap();
    assert!(x.requires_grad());
}

#[test]
fn saved_constants_cannot_change_and_detach_is_independent() {
    let x = Variable::scalar(2.0_f64, true);
    let mut constant = Variable::scalar(3.0, false);
    let output = (&x * &constant).unwrap();
    assert!(constant.data_mut().is_err());
    assert!(constant.set_requires_grad(true).is_err());
    let mut detached = output.detach();
    detached.data_mut().unwrap().data_mut().fill(10.0);
    assert_eq!(output.item().unwrap(), 6.0);
    assert_eq!(detached.item().unwrap(), 10.0);
    assert!(!detached.requires_grad());
    output.backward().unwrap();
    assert_eq!(x.grad().unwrap().item().unwrap(), 3.0);
    assert!(constant.grad().is_none());
    drop(output);
    constant.data_mut().unwrap().data_mut().fill(5.0);
    assert_eq!(constant.item().unwrap(), 5.0);
}

#[test]
fn scalar_arithmetic_on_both_sides_tracks_gradients() {
    let x = Variable::from_vec(vec![2.0_f64, -4.0], [2], true).unwrap();
    let left = (Scalar(3.0) * &x).unwrap();
    let right = (&x * 3.0).unwrap();
    assert_eq!(values(left.data()), vec![6.0, -12.0]);
    assert_eq!(values(left.data()), values(right.data()));
    let shifted = (2.0_f64.into_scalar() + &left).unwrap();
    assert_eq!(values(shifted.data()), vec![8.0, -10.0]);
    shifted.backward().unwrap();
    right.backward().unwrap();
    assert_eq!(values(&x.grad().unwrap()), vec![6.0, 6.0]);
    let constant = Variable::scalar(2.0_f64, false);
    let output = (&constant * 3.0).unwrap();
    assert_eq!(output.item().unwrap(), 6.0);
    assert!(!output.requires_grad());
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
        "Unavailable CPU"
    }

    fn synchronize(&self) -> rustml_core::Result<()> {
        Ok(())
    }
}

fn unavailable_scalar(value: f64) -> Tensor<f64> {
    Tensor::new(
        Tensor::scalar(value).data().clone(),
        Arc::new(UnavailableCpu),
    )
}

#[test]
fn unavailable_seed_is_rejected_before_any_gradient_accumulation() {
    let x = Variable::scalar(2.0_f64, true);
    let output = (&x * &x).unwrap();
    assert!(output.backward_with_grad(unavailable_scalar(1.0)).is_err());
    assert!(output.grad().is_none());
    assert!(x.grad().is_none());

    output.backward().unwrap();
    assert!(output.backward_with_grad(unavailable_scalar(3.0)).is_err());
    assert_eq!(output.grad().unwrap().item().unwrap(), 1.0);
    assert_eq!(x.grad().unwrap().item().unwrap(), 4.0);

    assert!(x.backward_with_grad(unavailable_scalar(1.0)).is_err());
    assert_eq!(x.grad().unwrap().item().unwrap(), 4.0);
}

#[test]
fn unavailable_leaf_data_is_rejected_before_gradient_accumulation() {
    let leaf = Variable::new(unavailable_scalar(2.0), true);
    assert!(leaf.backward_with_grad(Tensor::scalar(1.0)).is_err());
    assert!(leaf.grad().is_none());
    assert!(leaf.backward().is_err());
    assert!(leaf.grad().is_none());
}

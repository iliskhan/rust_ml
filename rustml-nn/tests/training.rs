use rustml_autograd::Variable;
use rustml_core::Result;
use rustml_nn::{mse_loss, Linear, Sgd};
use rustml_tensor::Tensor;

fn close(actual: f64, expected: f64) {
    assert!((actual - expected).abs() < 1e-10, "{actual} != {expected}");
}

#[test]
fn repeated_sgd_steps_use_fresh_graphs_and_converge() -> Result<()> {
    let input = Variable::from_vec(vec![-2.0_f64, -1.0, 0.0, 1.0, 2.0], [5, 1], false)?;
    let target = Variable::from_vec(vec![-3.0, -1.0, 1.0, 3.0, 5.0], [5, 1], false)?;
    let mut model = Linear::new(1, 1)?;
    let optimizer = Sgd::new(0.1)?;
    let mut previous_loss = f64::INFINITY;
    for step in 1..=100 {
        let prediction = model.forward(&input)?;
        let loss = mse_loss(&prediction, &target)?;
        let value = loss.item()?;
        assert!(value < previous_loss);
        if step == 1 {
            close(value, 9.0);
        }
        previous_loss = value;
        loss.backward()?;
        assert_eq!(model.weight().grad().unwrap().shape().dims(), &[1, 1]);
        assert_eq!(model.bias().grad().unwrap().shape().dims(), &[1]);
        close(
            model.weight().grad().unwrap().data()[[0, 0]],
            4.0 * (model.weight().data().data()[[0, 0]] - 2.0),
        );
        close(
            model.bias().grad().unwrap().data()[[0]],
            2.0 * (model.bias().data().data()[[0]] - 1.0),
        );
        // Every live graph keeps the parameters immutable, including after backward.
        assert!(optimizer.step(model.parameters_mut()[0]).is_err());
        assert!(model.weight().grad().is_some());
        drop(loss);
        drop(prediction);
        for parameter in model.parameters_mut() {
            optimizer.step(parameter)?;
            assert!(parameter.grad().is_none());
        }
        close(
            model.weight().data().data()[[0, 0]],
            2.0 * (1.0 - 0.6_f64.powi(step)),
        );
        close(model.bias().data().data()[[0]], 1.0 - 0.8_f64.powi(step));
    }
    let final_loss = mse_loss(&model.forward(&input)?, &target)?.item()?;
    assert!(final_loss < 1e-18);
    assert!((model.weight().data().data()[[0, 0]] - 2.0).abs() < 1e-8);
    assert!((model.bias().data().data()[[0]] - 1.0).abs() < 1e-8);
    Ok(())
}

#[test]
fn linear_multi_feature_f32_forward_and_parameter_gradients() -> Result<()> {
    let model = Linear::from_tensors(
        Tensor::from_vec(vec![1.0_f32, 2.0, 3.0, 4.0], [2, 2])?,
        Tensor::from_vec(vec![0.5, -0.5], [2])?,
    )?;
    let input = Variable::from_vec(vec![1.0_f32, 2.0, -1.0, 1.0], [2, 2], true)?;
    let prediction = model.forward(&input)?;
    assert_eq!(
        prediction.data().data().iter().copied().collect::<Vec<_>>(),
        [7.5, 9.5, 2.5, 1.5]
    );
    prediction.mean()?.backward()?;
    assert_eq!(
        model
            .weight()
            .grad()
            .unwrap()
            .data()
            .iter()
            .copied()
            .collect::<Vec<_>>(),
        [0.0, 0.0, 0.75, 0.75]
    );
    assert_eq!(
        model
            .bias()
            .grad()
            .unwrap()
            .data()
            .iter()
            .copied()
            .collect::<Vec<_>>(),
        [0.5, 0.5]
    );
    assert_eq!(
        input
            .grad()
            .unwrap()
            .data()
            .iter()
            .copied()
            .collect::<Vec<_>>(),
        [0.75, 1.75, 0.75, 1.75]
    );
    model.zero_grad();
    assert!(model.weight().grad().is_none());
    assert!(model.bias().grad().is_none());
    Ok(())
}

#[test]
fn linear_rejects_invalid_dimensions_and_input_shapes() -> Result<()> {
    assert!(Linear::<f64>::new(0, 1).is_err());
    assert!(Linear::<f64>::new(1, 0).is_err());
    assert!(Linear::<f64>::new(usize::MAX, 2).is_err());
    assert!(Linear::from_tensors(Tensor::<f64>::ones([2]), Tensor::ones([2])).is_err());
    assert!(Linear::from_tensors(Tensor::<f64>::ones([2, 3]), Tensor::ones([1, 3])).is_err());
    assert!(Linear::from_tensors(Tensor::<f64>::ones([2, 3]), Tensor::ones([2])).is_err());
    let model = Linear::<f64>::new(2, 3)?;
    assert!(model.forward(&Variable::ones([2], false)).is_err());
    assert!(model.forward(&Variable::ones([1, 3], false)).is_err());
    assert!(model.forward(&Variable::ones([1, 1, 2], false)).is_err());
    assert_eq!(
        model
            .forward(&Variable::zeros([0, 2], false))?
            .data()
            .shape()
            .dims(),
        &[0, 3]
    );
    Ok(())
}

#[test]
fn mse_requires_exact_nonempty_shapes_and_tracks_both_operands() -> Result<()> {
    let prediction = Variable::from_vec(vec![1.0_f64, 3.0], [2, 1], true)?;
    assert!(mse_loss(&prediction, &Variable::ones([2], false)).is_err());
    assert!(mse_loss(&prediction, &Variable::ones([1], false)).is_err());
    assert!(mse_loss(
        &Variable::<f64>::zeros([0, 2], true),
        &Variable::zeros([0, 2], false)
    )
    .is_err());
    let target = Variable::from_vec(vec![2.0, 1.0], [2, 1], true)?;
    let loss = mse_loss(&prediction, &target)?;
    close(loss.item()?, 2.5);
    loss.backward()?;
    assert_eq!(
        prediction
            .grad()
            .unwrap()
            .data()
            .iter()
            .copied()
            .collect::<Vec<_>>(),
        [-1.0, 2.0]
    );
    assert_eq!(
        target
            .grad()
            .unwrap()
            .data()
            .iter()
            .copied()
            .collect::<Vec<_>>(),
        [1.0, -2.0]
    );
    let same_loss = mse_loss(&prediction, &prediction)?;
    prediction.zero_grad();
    same_loss.backward()?;
    assert!(prediction.grad().unwrap().data().iter().all(|&g| g == 0.0));
    let constant = Variable::scalar(2.0_f64, false);
    assert!(!mse_loss(&constant, &constant)?.requires_grad());
    Ok(())
}

#[test]
fn sgd_rejects_invalid_rate_missing_gradient_and_nonfinite_update() -> Result<()> {
    for rate in [0.0, -0.1, f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
        assert!(Sgd::new(rate).is_err());
    }
    let optimizer = Sgd::new(0.1)?;
    let mut parameter = Variable::scalar(2.0_f64, true);
    assert!(optimizer.step(&mut parameter).is_err());
    assert!(parameter.grad().is_none());
    for seed in [f64::NAN, f64::INFINITY] {
        parameter.zero_grad();
        parameter.backward_with_grad(Tensor::scalar(seed))?;
        assert!(optimizer.step(&mut parameter).is_err());
        close(parameter.item()?, 2.0);
        assert!(parameter.grad().is_some());
    }
    let mut huge = Variable::scalar(-f64::MAX, true);
    huge.backward_with_grad(Tensor::scalar(f64::MAX))?;
    assert!(Sgd::new(2.0)?.step(&mut huge).is_err());
    assert_eq!(huge.item()?, -f64::MAX);
    assert_eq!(huge.grad().unwrap().item()?, f64::MAX);
    Ok(())
}

#[test]
fn sgd_preserves_shared_parameters_and_nonleaf_results_on_rejection() -> Result<()> {
    let optimizer = Sgd::new(0.25)?;
    let mut parameter = Variable::scalar(2.0_f64, true);
    let alias = parameter.clone();
    parameter.backward()?;
    assert!(optimizer.step(&mut parameter).is_err());
    close(alias.item()?, 2.0);
    close(alias.grad().unwrap().item()?, 1.0);
    drop(alias);
    optimizer.step(&mut parameter)?;
    close(parameter.item()?, 1.75);
    assert!(parameter.grad().is_none());
    let mut result = (&parameter * &parameter)?;
    result.backward()?;
    assert!(optimizer.step(&mut result).is_err());
    close(result.item()?, 3.0625);
    close(result.grad().unwrap().item()?, 1.0);
    Ok(())
}

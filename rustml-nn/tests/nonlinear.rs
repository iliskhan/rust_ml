use rustml_autograd::Variable;
use rustml_core::Result;
use rustml_nn::{mse_loss, Linear, Sgd};
use rustml_tensor::Tensor;

#[test]
fn seeded_initialization_is_reproducible_and_breaks_symmetry() -> Result<()> {
    let first = Linear::<f64>::with_seed(2, 8, 42)?;
    let repeat = Linear::<f64>::with_seed(2, 8, 42)?;
    let other = Linear::<f64>::with_seed(2, 8, 43)?;
    assert_eq!(first.weight().data().data(), repeat.weight().data().data());
    assert_ne!(first.weight().data().data(), other.weight().data().data());
    let weights = first.weight().data().data();
    // Pin samples from the documented fixed algorithm, not just two calls.
    for (&actual, expected) in weights.iter().zip([
        0.836805286714029,
        -1.1781049573266253,
        -0.7669481822728474,
        -0.5397391905439235,
    ]) {
        assert!((actual - expected).abs() < 1e-14);
    }
    assert!(weights.iter().any(|&value| value > 0.0));
    assert!(weights.iter().any(|&value| value < 0.0));
    assert!(weights
        .iter()
        .all(|value| value.is_finite() && value.abs() <= 3.0_f64.sqrt()));
    assert!(first.bias().data().data().iter().all(|&value| value == 0.0));
    assert_eq!(first.weight().data().shape().dims(), &[2, 8]);
    for seed in [0, u64::MAX] {
        let layer = Linear::<f32>::with_seed(3, 2, seed)?;
        assert!(layer
            .weight()
            .data()
            .data()
            .iter()
            .all(|value| value.is_finite()));
        assert_eq!(
            layer.weight().data().data(),
            Linear::<f32>::with_seed(3, 2, seed)?.weight().data().data()
        );
    }
    assert!(Linear::<f64>::with_seed(0, 1, 42).is_err());
    assert!(Linear::<f64>::with_seed(1, 0, 42).is_err());
    assert!(Linear::<f64>::with_seed(usize::MAX, 2, 42).is_err());
    Ok(())
}

fn explicit_network(parameters: &[f64; 9]) -> Result<(Linear<f64>, Linear<f64>)> {
    Ok((
        Linear::from_tensors(
            Tensor::from_vec(parameters[..4].to_vec(), [2, 2])?,
            Tensor::from_vec(parameters[4..6].to_vec(), [2])?,
        )?,
        Linear::from_tensors(
            Tensor::from_vec(parameters[6..8].to_vec(), [2, 1])?,
            Tensor::from_vec(parameters[8..].to_vec(), [1])?,
        )?,
    ))
}

#[test]
fn multilayer_parameter_gradients_match_finite_differences() -> Result<()> {
    let values = [0.8, -0.6, -0.2, 0.9, 0.3, 0.7, 0.4, -0.5, 0.2];
    let input = Variable::from_vec(
        vec![0.0_f64, 0.0, 0.0, 1.0, 1.0, 0.0, 1.0, 1.0],
        [4, 2],
        false,
    )?;
    let target = Variable::from_vec(vec![0.0_f64, 1.0, 1.0, 0.0], [4, 1], false)?;
    let (hidden, output) = explicit_network(&values)?;
    let activation = hidden.forward(&input)?.relu()?;
    let loss = mse_loss(&output.forward(&activation)?, &target)?;
    loss.backward()?;
    let analytic: Vec<f64> = [
        hidden.weight(),
        hidden.bias(),
        output.weight(),
        output.bias(),
    ]
    .iter()
    .flat_map(|parameter| {
        parameter
            .grad()
            .unwrap()
            .data()
            .iter()
            .copied()
            .collect::<Vec<_>>()
    })
    .collect();
    for index in 0..values.len() {
        let evaluate = |delta| -> Result<f64> {
            let mut perturbed = values;
            perturbed[index] += delta;
            let (hidden, output) = explicit_network(&perturbed)?;
            mse_loss(&output.forward(&hidden.forward(&input)?.relu()?)?, &target)?.item()
        };
        let numeric = (evaluate(1e-6)? - evaluate(-1e-6)?) / 2e-6;
        assert!(
            (analytic[index] - numeric).abs() < 1e-9,
            "parameter {index}: {} != {numeric}",
            analytic[index]
        );
    }
    Ok(())
}

fn train_xor() -> Result<(f64, Vec<f64>)> {
    let input = Variable::from_vec(
        vec![0.0_f64, 0.0, 0.0, 1.0, 1.0, 0.0, 1.0, 1.0],
        [4, 2],
        false,
    )?;
    let target = Variable::from_vec(vec![0.0_f64, 1.0, 1.0, 0.0], [4, 1], false)?;
    let mut hidden = Linear::with_seed(2, 8, 42)?;
    let mut output = Linear::with_seed(8, 1, 43)?;
    let optimizer = Sgd::new(0.05)?;
    let initial_loss =
        mse_loss(&output.forward(&hidden.forward(&input)?.relu()?)?, &target)?.item()?;
    for _ in 0..2000 {
        // The scope drops every graph, including the hidden activation, before SGD.
        {
            let activation = hidden.forward(&input)?.relu()?;
            let prediction = output.forward(&activation)?;
            let loss = mse_loss(&prediction, &target)?;
            assert!(loss.item()?.is_finite());
            loss.backward()?;
        }
        for parameter in hidden
            .parameters_mut()
            .into_iter()
            .chain(output.parameters_mut())
        {
            optimizer.step(parameter)?;
        }
    }
    let prediction = output.forward(&hidden.forward(&input)?.relu()?)?;
    let final_loss = mse_loss(&prediction, &target)?.item()?;
    assert!(
        final_loss < initial_loss * 1e-4,
        "loss {initial_loss} -> {final_loss}"
    );
    assert!(final_loss < 1e-4);
    Ok((
        final_loss,
        prediction.data().data().iter().copied().collect(),
    ))
}

#[test]
fn xor_training_converges_and_is_reproducible() -> Result<()> {
    let (loss, predictions) = train_xor()?;
    let repeat = train_xor()?;
    assert_eq!(loss, repeat.0);
    assert_eq!(predictions, repeat.1);
    for (prediction, target) in predictions.iter().zip([false, true, true, false]) {
        assert_eq!(*prediction >= 0.5, target, "prediction {prediction}");
    }
    Ok(())
}

//! Deterministic full-batch training of y = 2x + 1 with genuine autograd.

use rustml_autograd::Variable;
use rustml_core::Result;
use rustml_nn::{mse_loss, Linear, Sgd};

fn main() -> Result<()> {
    let input = Variable::from_vec(vec![-2.0_f64, -1.0, 0.0, 1.0, 2.0], [5, 1], false)?;
    let target = Variable::from_vec(vec![-3.0, -1.0, 1.0, 3.0, 5.0], [5, 1], false)?;
    let mut model = Linear::new(1, 1)?;
    let optimizer = Sgd::new(0.1)?;
    let initial_loss = mse_loss(&model.forward(&input)?, &target)?.item()?;
    for _ in 0..100 {
        let prediction = model.forward(&input)?;
        let loss = mse_loss(&prediction, &target)?;
        loss.backward()?;
        drop(loss);
        drop(prediction);
        for parameter in model.parameters_mut() {
            optimizer.step(parameter)?;
        }
    }
    let final_loss = mse_loss(&model.forward(&input)?, &target)?.item()?;
    let weight = model.weight().data().data()[[0, 0]];
    let bias = model.bias().data().data()[[0]];
    assert!(final_loss < initial_loss * 1e-12);
    assert!((weight - 2.0).abs() < 1e-8);
    assert!((bias - 1.0).abs() < 1e-8);
    println!(
        "100 SGD steps: loss {initial_loss:.6} -> {final_loss:.3e}, w={weight:.10}, b={bias:.10}"
    );
    Ok(())
}

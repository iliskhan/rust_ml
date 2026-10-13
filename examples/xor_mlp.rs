//! Reproducible CPU/f64 XOR training with a 2 -> 8 -> 1 ReLU network.
//! MSE learns raw scores; the 0.5 threshold gives labels, not probabilities.

use rustml_autograd::Variable;
use rustml_core::Result;
use rustml_nn::{mse_loss, Linear, Sgd};

fn main() -> Result<()> {
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
        {
            let activation = hidden.forward(&input)?.relu()?;
            let prediction = output.forward(&activation)?;
            let loss = mse_loss(&prediction, &target)?;
            loss.backward()?;
        } // Drop all saved graph values before mutating uniquely owned parameters.
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
    let mut correct = 0;
    for (index, (&score, &label)) in prediction
        .data()
        .data()
        .iter()
        .zip(target.data().data())
        .enumerate()
    {
        let predicted = usize::from(score >= 0.5);
        correct += usize::from(predicted == label as usize);
        println!(
            "{} XOR {}: score={score:.6}, class={predicted}, target={label}",
            index / 2,
            index % 2
        );
    }
    assert!(final_loss < 1e-4);
    assert_eq!(correct, 4);
    println!("2000 full-batch SGD steps, seeds 42/43: MSE {initial_loss:.6} -> {final_loss:.3e}, accuracy {correct}/4");
    Ok(())
}

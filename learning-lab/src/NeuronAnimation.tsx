import type { RefObject } from 'react'
import fixture from '../animations/neuron/fixture.json'
import { LessonAnimation } from './LessonAnimation'
import { fmt } from './ui'

const chapters = [
  { title: 'Входы и веса', start: 0, frame: 8 },
  { title: 'Сумма и смещение', start: 10, frame: 15 },
  { title: 'Предскажите ReLU', start: 18, frame: 22 },
  { title: 'Сдвиг смещения', start: 26, frame: 34 },
  { title: 'Теперь ваша очередь', start: 38, frame: 41 },
]

export function NeuronAnimation({ videoRef, z, output, activation }: {
  videoRef: RefObject<HTMLVideoElement | null>; z: number; output: number; activation: string
}) {
  return <LessonAnimation videoRef={videoRef} media="neuron" title="Как смещение включает нейрон"
    label="Один нейрон: входы, веса, сумма и ReLU"
    description={<>Фиксированный пример: <strong>x = [1; 2], w = [1; −1], ReLU, b от 0 до 2</strong>. Ползунки лаборатории не меняют ролик. Сейчас в лаборатории: z = {fmt(z)}, a = {fmt(output)}, активация {activation}.</>}
    chapters={chapters} target="neuron-controls" jumpLabel="Собрать свой нейрон ↓">
    <ol className="lesson-animation-transcript">
      <li><strong>Входы и веса.</strong> Два входа x₁ = {fixture.inputs[0]}, x₂ = {fixture.inputs[1]} умножаем на веса w₁ = {fixture.weights[0]}, w₂ = {fixture.weights[1]}. Вес может усиливать вход или давать отрицательный вклад.</li>
      <li><strong>Сумма и смещение.</strong> x₁w₁ = {fmt(fixture.contributions[0])}, x₂w₂ = {fmt(fixture.contributions[1])}. Складываем произведения и смещение: z = 1 + (−2) + b. При b = {fixture.initial.bias} получаем z = {fixture.initial.z}.</li>
      <li><strong>Предскажите ReLU.</strong> Какой выход получится при z = {fixture.initial.z}? ReLU(z) = max(0, z) оставляет положительную часть, поэтому a = {fixture.initial.output}.</li>
      <li><strong>Сдвиг смещения.</strong> Меняем только b до {fixture.final.bias}: z = −1 + 2 = {fixture.final.z}, a = {fixture.final.output}. Входы и веса сохраняются.</li>
      <li><strong>Теперь ваша очередь.</strong> Предскажите, при каком смещении выход станет положительным, затем проверьте в лаборатории. Здесь z = −1 + b, поэтому порог — b = 1, а положительный выход появляется при b &gt; 1.</li>
    </ol>
    <p>Наклон ReLU: при z &lt; 0 производная da/dz = 0, при z &gt; 0 она равна 1. В z = 0 производная не определена; лаборатория использует 0.</p>
    <table className="data-table"><caption>Фиксированный пример: меняется только смещение b</caption>
      <thead><tr><th scope="col">Величина</th><th scope="col">До</th><th scope="col">После</th></tr></thead>
      <tbody>
        <tr><th scope="row">Смещение b</th><td>{fixture.initial.bias}</td><td>{fixture.final.bias}</td></tr>
        <tr><th scope="row">Сумма z = −1 + b</th><td>{fixture.initial.z}</td><td>{fixture.final.z}</td></tr>
        <tr><th scope="row">Выход a = ReLU(z)</th><td>{fixture.initial.output}</td><td>{fixture.final.output}</td></tr>
        <tr><th scope="row">Наклон da/dz</th><td>{fixture.initial.derivative}</td><td>{fixture.final.derivative}</td></tr>
      </tbody>
    </table>
  </LessonAnimation>
}

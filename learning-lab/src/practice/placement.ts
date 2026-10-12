import chapters from './placement.json' with { type: 'json' };

/** Stable topic IDs; chapter positions are UI locators, never database identities. */
export const practiceChapterIds: Record<string, string[]> = chapters;
export const practiceChapter = (lessonId: string, index: number) => practiceChapterIds[lessonId]?.[index];

export const practiceLessonLabels: Record<string, string> = {
  math: 'Математические основания',
  neuron: 'Нейрон и слои', loss: 'Функции потерь', backprop: 'Обратный проход',
  optimizers: 'Оптимизаторы', network: 'Сеть целиком', architectures: 'Семейства сетей',
  transformer: 'Transformer по шагам', advanced: 'Новые архитектуры',
  frontiers: 'Новые механизмы и обучение', vae: 'VAE', gan: 'GAN',
  diffusion: 'Diffusion', gnn: 'GNN', rl: 'Обучение с подкреплением',
};

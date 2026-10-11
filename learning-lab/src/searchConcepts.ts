import { concepts } from './concepts.ts';

const normalize = (text: string) => text.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');

export function searchConcepts(query: string) {
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  return concepts.filter(concept => {
    const text = normalize(`${concept.title} ${concept.id} ${concept.idea}`);
    return words.every(word => text.includes(word));
  });
}

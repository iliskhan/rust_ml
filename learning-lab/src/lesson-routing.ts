import { practiceChapterIds } from './practice/placement.ts';

export function lessonRoute(hash: string) {
  const [lessonId, query = ''] = hash.replace(/^#/, '').split('?');
  return { lessonId, topicId: new URLSearchParams(query).get('topic') };
}

export const explanationHref = (lessonId: string, topicId: string) => `#${lessonId}?topic=${encodeURIComponent(topicId)}`;

export function topicChapter(lessonId: string, topicId: string | null) {
  if (!topicId) return -1;
  const chapters = practiceChapterIds[lessonId] ?? [];
  let best = -1;
  chapters.forEach((id, index) => {
    if ((topicId === id || topicId.startsWith(`${id}.`) || topicId.startsWith(`${id}-`)) && id.length > (chapters[best]?.length ?? 0)) best = index;
  });
  return best;
}

export function explanationAnchor(lessonId: string, topicId: string | null) {
  const anchors: Record<string, string[]> = {
    neuron: ['neuron-result', 'neuron-activation', 'neuron-batch'],
    loss: ['loss-mse-controls', 'loss-bce-controls'],
    backprop: ['backprop-walkthrough', 'backprop-check'],
    network: ['boundary-lesson-settings', 'boundary-experiment', 'network-representations', 'network-xor', 'boundary-lesson-diagnostics'],
  };
  return anchors[lessonId]?.[topicChapter(lessonId, topicId)];
}

export function openExplanation(event: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; currentTarget: HTMLAnchorElement; preventDefault: () => void }) {
  if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  const hash = event.currentTarget.hash;
  if (window.location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else window.location.hash = hash;
}

import { useRef, type SyntheticEvent } from 'react';
import { TopicAnimation, type TopicFilm } from './TopicAnimation';
import { useAnimationExample } from './useAnimationExample';
import clip from '../animations/clip/fixture.json';
import flowmatching from '../animations/flowmatching/fixture.json';
import superposition from '../animations/superposition/fixture.json';
import egnn from '../animations/egnn/fixture.json';
import neuralfield from '../animations/neuralfield/fixture.json';
import dpo from '../animations/dpo/fixture.json';
import qlora from '../animations/qlora/fixture.json';
import speculative from '../animations/speculative/fixture.json';
import longcontext from '../animations/longcontext/fixture.json';
import jepa from '../animations/jepa/fixture.json';
import maskedtext from '../animations/maskedtext/fixture.json';
import kan from '../animations/kan/fixture.json';
import vittraining from '../animations/vittraining/fixture.json';
import moetraining from '../animations/moetraining/fixture.json';
import ssmtraining from '../animations/ssmtraining/fixture.json';
import imagedenoisertraining from '../animations/imagedenoisertraining/fixture.json';
const fixtures = { clip, flowmatching, superposition, egnn, neuralfield, dpo, qlora, speculative, longcontext, jepa, maskedtext, kan, vittraining, moetraining, ssmtraining, imagedenoisertraining };
export type FrontierFilmSlug = keyof typeof fixtures;

/** The parent supplies its entire mutable state; repeated apply retains its first snapshot. */
export function useFrontierFilm<T>(slug: FrontierFilmSlug, current: T, update: (state: T) => void, onPlayback?: () => void) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fixture = fixtures[slug];
  const example = useAnimationExample(current, update, fixture.state as unknown as T);
  function pauseOnLabAction(event: SyntheticEvent) {
    if (event.target instanceof Element && !event.target.closest('.lesson-animation')) videoRef.current?.pause();
  }
  return {
    animation: <><TopicAnimation film={fixture.lesson satisfies TopicFilm} videoRef={videoRef} example={example} onPlayback={onPlayback} /><div id={fixture.lesson.target} tabIndex={-1} /></>,
    labEvents: { onClickCapture: pauseOnLabAction, onChangeCapture: pauseOnLabAction, onKeyDownCapture: pauseOnLabAction },
  };
}

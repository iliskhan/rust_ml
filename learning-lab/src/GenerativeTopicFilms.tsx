import { useRef, type SyntheticEvent } from 'react';
import { TopicAnimation, type TopicFilm } from './TopicAnimation';
import { useAnimationExample } from './useAnimationExample';
import vaeposterior from '../animations/vaeposterior/fixture.json';
import vaeelbo from '../animations/vaeelbo/fixture.json';
import vaetraining from '../animations/vaetraining/fixture.json';
import vaegeneration from '../animations/vaegeneration/fixture.json';
import ganforward from '../animations/ganforward/fixture.json';
import ganobjectives from '../animations/ganobjectives/fixture.json';
import gantraining from '../animations/gantraining/fixture.json';
import gandiversity from '../animations/gandiversity/fixture.json';
import diffusionforward from '../animations/diffusionforward/fixture.json';
import diffusiontraining from '../animations/diffusiontraining/fixture.json';
import diffusionreverse from '../animations/diffusionreverse/fixture.json';
import diffusionsampling from '../animations/diffusionsampling/fixture.json';
import diffusionguidance from '../animations/diffusionguidance/fixture.json';
import gnnadjacency from '../animations/gnnadjacency/fixture.json';
import gnnmessage from '../animations/gnnmessage/fixture.json';
import gnntraining from '../animations/gnntraining/fixture.json';
import gnndepth from '../animations/gnndepth/fixture.json';
import gnnvariants from '../animations/gnnvariants/fixture.json';
import rltransition from '../animations/rltransition/fixture.json';
import rlbellman from '../animations/rlbellman/fixture.json';
import rlqlearning from '../animations/rlqlearning/fixture.json';
import rlpolicy from '../animations/rlpolicy/fixture.json';

const films = { vaeposterior, vaeelbo, vaetraining, vaegeneration, ganforward, ganobjectives, gantraining, gandiversity, diffusionforward, diffusiontraining, diffusionreverse, diffusionsampling, diffusionguidance, gnnadjacency, gnnmessage, gnntraining, gnndepth, gnnvariants, rltransition, rlbellman, rlqlearning, rlpolicy };
export type GenerativeFilmSlug = keyof typeof films;

/** Ordinary laboratory controls pause every film in this course, including a hidden chapter. */
export function pauseCourseFilms(event: SyntheticEvent<HTMLElement>) {
  if ((event.target as Element).closest('.lesson-animation')) return;
  event.currentTarget.querySelectorAll('video').forEach(video => video.pause());
}

export function GenerativeTopicFilm<T>({ slug, current, update, fixed, onPlayback }: {
  slug: GenerativeFilmSlug; current: T; update: (value: T) => void; fixed: NoInfer<T>; onPlayback?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const example = useAnimationExample(current, value => { videoRef.current?.pause(); update(value); }, fixed);
  return <TopicAnimation film={films[slug].lesson as TopicFilm} videoRef={videoRef} example={example} onPlayback={onPlayback} />;
}

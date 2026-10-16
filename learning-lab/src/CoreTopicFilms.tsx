import {useId, useRef, type ReactNode} from 'react'
import {TopicAnimation} from './TopicAnimation'
import {useAnimationExample} from './useAnimationExample'
import dense from '../animations/dense/fixture.json'
import cnnforward from '../animations/cnnforward/fixture.json'
import cnntraining from '../animations/cnntraining/fixture.json'
import recurrent from '../animations/recurrent/fixture.json'
import bptt from '../animations/bptt/fixture.json'
import transformerforward from '../animations/transformerforward/fixture.json'
import embeddings from '../animations/embeddings/fixture.json'
import transformerblock from '../animations/transformerblock/fixture.json'
import crossmask from '../animations/crossmask/fixture.json'
import sampling from '../animations/sampling/fixture.json'
import outputtraining from '../animations/outputtraining/fixture.json'
import tinytraining from '../animations/tinytraining/fixture.json'
import bpe from '../animations/bpe/fixture.json'
import swiglu from '../animations/swiglu/fixture.json'
import lora from '../animations/lora/fixture.json'
import vit from '../animations/vit/fixture.json'
import moe from '../animations/moe/fixture.json'
import mla from '../animations/mla/fixture.json'
import exactsoftmax from '../animations/exactsoftmax/fixture.json'
import ssm from '../animations/ssm/fixture.json'
import unetdit from '../animations/unetdit/fixture.json'

const films={dense,cnnforward,cnntraining,recurrent,bptt,transformerforward,embeddings,transformerblock,crossmask,sampling,outputtraining,tinytraining,bpe,swiglu,lora,vit,moe,mla,exactsoftmax,ssm,unetdit}
type Slug=keyof typeof films

/** Keep each lab's complete snapshot in its existing parent, including training history. */
export function CoreTopicFilm<T>({slug,current,example,restore,onPlayback,children}: {
  slug:Slug; current:T; example:NoInfer<T>; restore:(value:T)=>void; onPlayback?:()=>void; children:ReactNode
}) {
  const instance=useId()
  const target=films[slug].lesson.target+instance.replaceAll(':','')
  const videoRef=useRef<HTMLVideoElement>(null)
  const controls=useAnimationExample(current, value=>{videoRef.current?.pause();restore(value)},example)
  function pauseForLab(event:{target:EventTarget|null}) {
    if(event.target instanceof Element && !event.target.closest('.lesson-animation')) videoRef.current?.pause()
  }
  return <div onInputCapture={pauseForLab} onClickCapture={pauseForLab} onKeyDownCapture={pauseForLab}>
    <TopicAnimation film={{...films[slug].lesson,target}} videoRef={videoRef} example={controls} onPlayback={onPlayback}/>
    <div id={target} className="lesson-anchor" tabIndex={-1}>{children}</div>
  </div>
}

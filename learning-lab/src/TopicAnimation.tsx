import type { RefObject } from 'react'
import { LessonAnimation, type AnimationQuestion } from './LessonAnimation'
import type { AnimationExampleControls } from './useAnimationExample'

export type TopicFilm = {
  media: string
  title: string
  label: string
  description: string
  target: string
  jumpLabel: string
  chapters: { title: string; start: number; frame: number }[]
  question: AnimationQuestion & { time: number }
  practice: AnimationQuestion
  transcript: string[]
  table: { caption: string; headers: string[]; rows: (string | number)[][] }
  note: string
}

export function TopicAnimation({ film, videoRef, example, onPlayback }: {
  film: TopicFilm
  videoRef: RefObject<HTMLVideoElement | null>
  example: AnimationExampleControls
  onPlayback?: () => void
}) {
  return <LessonAnimation {...film} videoRef={videoRef} example={example} onPlayback={onPlayback}>
    <ol className="lesson-animation-transcript">{film.transcript.map((line, index) => <li key={index}>{line}</li>)}</ol>
    <table className="data-table"><caption>{film.table.caption}</caption>
      <thead><tr>{film.table.headers.map((label, index) => <th key={index} scope="col">{label}</th>)}</tr></thead>
      <tbody>{film.table.rows.map((row, index) => <tr key={index}>{row.map((value, column) => column === 0
        ? <th key={column} scope="row">{value}</th> : <td key={column}>{value}</td>)}</tr>)}</tbody>
    </table>
    <p>{film.note}</p>
  </LessonAnimation>
}

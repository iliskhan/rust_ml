import { lazy, Suspense } from 'react';
import type { Scene3DProps } from './scene3dMath';

const Renderer = lazy(() => import('./Scene3D'));
export type { Vec3, SceneAxis, SceneAxes, SceneSurface, SceneLine, ScenePoint, Scene3DProps } from './scene3dMath';

export function Scene3D(props: Scene3DProps) {
  return <Suspense fallback={<p role="status">Загружается 3D-сцена «{props.title}»…</p>}><Renderer {...props} /></Suspense>;
}

import { useId, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { fmt, Range } from './ui';
import { buildSceneGeometry, inCube, normalizePoint, projectPoint, sceneColors, sortByDepth, type Scene3DProps, type Vec3 } from './scene3dMath';
import './scene3d.css';

const initialCamera = { yaw: 35, pitch: 25, zoom: 1 };
const axisNames = ['X', 'Y', 'Z'];
const axisColors = ['#27694e', '#9f4a19', '#6a52a0'];

export default function Scene3D({ title, description, axes, surfaces = [], lines = [], points = [], showLegend = true }: Scene3DProps) {
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointer: number; x: number; y: number; yaw: number; pitch: number; touch: boolean } | null>(null);
  const [width, setWidth] = useState(480);
  const [camera, setCamera] = useState(initialCamera);
  const height = Math.max(280, Math.min(420, width * .6 + 90));

  useLayoutEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(entries => {
      const measured = entries[0].contentRect.width;
      // Hidden lesson panels report zero; keep the last useful camera viewport.
      if (measured > 0) setWidth(measured);
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);

  const geometry = useMemo(() => {
    try { return { ...buildSceneGeometry({ axes, surfaces, lines, points }), error: '' }; }
    catch (error) { return { primitives: [], outside: 0, invalid: 0, error: error instanceof Error ? error.message : 'Не удалось построить сцену.' }; }
  }, [axes, surfaces, lines, points]);
  const sorted = useMemo(() => sortByDepth(geometry.primitives, camera.yaw, camera.pitch), [geometry, camera.yaw, camera.pitch]);
  const project = (point: Vec3) => projectPoint(point, camera.yaw, camera.pitch, width, height, camera.zoom);
  const projectedPath = (vertices: readonly Vec3[]) => vertices.map((point, i) => {
    const { x, y } = project(point);
    return `${i ? 'L' : 'M'}${x},${y}`;
  }).join(' ');
  const origin: Vec3 = [-1, -1, -1];
  const updateAngle = (event: PointerEvent<SVGSVGElement>) => {
    const start = drag.current;
    if (!start || start.pointer !== event.pointerId) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    setCamera(current => ({ ...current,
      yaw: ((start.yaw + dx * .6 + 180) % 360 + 360) % 360 - 180,
      pitch: start.touch ? start.pitch : Math.max(-85, Math.min(90, start.pitch - dy * .4)),
    }));
  };
  const legend = [
    ...surfaces.map((item, i) => ({ ...item, kind: 'surface', color: item.color ?? sceneColors[i % sceneColors.length] })),
    ...lines.map((item, i) => ({ ...item, kind: 'line', color: item.color ?? sceneColors[(surfaces.length + i) % sceneColors.length] })),
    ...points.map((item, i) => ({ ...item, kind: 'point', color: item.color ?? sceneColors[(surfaces.length + lines.length + i) % sceneColors.length] })),
  ];

  return <figure className="scene3d" aria-labelledby={`${id}-heading`}>
    <figcaption id={`${id}-heading`} className="scene3d-heading">{title}</figcaption>
    <p className="scene3d-description">{description}</p>
    <div className="scene3d-view" ref={container}>
      {geometry.error ? <p role="status">{geometry.error}</p> : <svg
        viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img"
        aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
        onPointerDown={event => {
          if (event.button !== 0 || !event.isPrimary) return;
          drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, yaw: camera.yaw, pitch: camera.pitch, touch: event.pointerType === 'touch' };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={updateAngle}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
        onLostPointerCapture={() => { drag.current = null; }}>
        <title id={`${id}-title`}>{title}</title>
        <desc id={`${id}-description`}>{description} Ортографическая 3D-проекция. {axes.map((axis, i) => `${axisNames[i]}: ${axis.label}, от ${fmt(axis.min)} до ${fmt(axis.max)}`).join('; ')}. Поворот и масштаб доступны ползунками под сценой.{points.length > 0 && ' Координаты отмеченных точек доступны в таблице.'}</desc>
        <defs><clipPath id={`${id}-clip`}><rect width={width} height={height} /></clipPath></defs>
        <g clipPath={`url(#${id}-clip)`}>
          {/* Frame edges precede data so they never masquerade as foreground data. */}
          {[0, 1, 2].flatMap(axis => [-1, 1].flatMap(a => [-1, 1].map(b => {
            const start = [-1, -1, -1] as [number, number, number];
            start[(axis + 1) % 3] = a; start[(axis + 2) % 3] = b;
            const end = [...start] as [number, number, number]; end[axis] = 1;
            return <path key={`${axis}-${a}-${b}`} d={projectedPath([start, end])} className="scene3d-frame" />;
          })))}
          {sorted.map((primitive, index) => {
            if (primitive.kind === 'surface') return <path key={index} d={`${projectedPath(primitive.vertices)} Z`} fill={primitive.color} fillOpacity={primitive.opacity} stroke={primitive.color} strokeOpacity=".3" strokeWidth=".45" />;
            if (primitive.kind === 'line') {
              const length = Math.hypot(...primitive.vertices[0].map((v, i) => v - primitive.vertices[1][i]));
              return <path key={index} d={projectedPath(primitive.vertices)} fill="none" stroke={primitive.color} strokeWidth="2.3" pathLength={length || .001} strokeDasharray={primitive.dashed ? '.06 .04' : undefined} strokeDashoffset={primitive.dashed ? -(primitive.lineDistance ?? 0) : undefined} />;
            }
            const position = project(primitive.vertices[0]);
            const fill = primitive.hollow ? 'var(--paper)' : primitive.color;
            const stroke = primitive.hollow ? primitive.color : 'var(--paper)';
            return primitive.shape === 'triangle'
              ? <path key={index} d={`M${position.x},${position.y - 5.5}l5,9h-10Z`} fill={fill} stroke={stroke} strokeWidth="1.3"><title>{primitive.name}</title></path>
              : <circle key={index} cx={position.x} cy={position.y} r="4.5" fill={fill} stroke={stroke} strokeWidth="1.3"><title>{primitive.name}</title></circle>;
          })}
          {axes.map((axis, index) => {
            const endpoint = [...origin] as [number, number, number]; endpoint[index] = 1;
            const start = project(origin), end = project(endpoint);
            const dx = end.x - start.x, dy = end.y - start.y, length = Math.hypot(dx, dy);
            // An axis pointing into the camera has no visible span in the front/top view.
            if (length < 12) return null;
            let ox = -dy / length, oy = dx / length;
            const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
            if (ox * (middle.x - width / 2) + oy * (middle.y - height / 2) < 0) { ox *= -1; oy *= -1; }
            return <g key={index} className="scene3d-axis">
              <path d={projectedPath([origin, endpoint])} fill="none" stroke={axisColors[index]} strokeWidth="1.4" />
              {/* The three minimum ticks share one vertex; show their ranges in the key instead. */}
              {(length < 50 ? [1] : [.5, 1]).map(t => {
                const x = start.x + dx * t, y = start.y + dy * t;
                return <g key={t}><line x1={x} y1={y} x2={x + ox * 4} y2={y + oy * 4} stroke={axisColors[index]} />
                  <text x={Math.max(17, Math.min(width - 17, x + ox * 15))} y={Math.max(14, Math.min(height - 7, y + oy * 15 + 4))} textAnchor="middle">{fmt(axis.min + (axis.max - axis.min) * t, 2)}</text></g>;
              })}
              <text x={Math.max(10, Math.min(width - 10, end.x + dx / length * 20))} y={Math.max(14, Math.min(height - 7, end.y + dy / length * 20 + 4))} textAnchor="middle" className="scene3d-axis-name">{axisNames[index]}</text>
            </g>;
          })}
        </g>
      </svg>}
    </div>
    <ul className="scene3d-axis-key">{axes.map((axis, i) => <li key={i}><strong>{axisNames[i]}</strong> — {axis.label}: {fmt(axis.min)}…{fmt(axis.max)}</li>)}</ul>
    <p className="scene3d-note">{axes.every(axis => axis.max - axis.min === axes[0].max - axes[0].min)
      ? 'Масштаб единицы одинаков на всех осях. Проекция на экран искажает видимые длины и углы; сравнивайте исходные числа.'
      : 'Оси масштабируются независимо. По видимым углам и длинам нельзя сравнивать исходные величины.'}</p>
    <div className="scene3d-controls">
      <Range label="Поворот, °" value={camera.yaw} min={-180} max={180} step={1} onChange={yaw => setCamera(current => ({ ...current, yaw }))} />
      <Range label="Наклон, °" value={camera.pitch} min={-85} max={90} step={1} onChange={pitch => setCamera(current => ({ ...current, pitch }))} />
      <Range label="Масштаб" value={camera.zoom} min={.65} max={1.8} step={.05} onChange={zoom => setCamera(current => ({ ...current, zoom }))} />
    </div>
    <div className="scene3d-buttons">
      <button onClick={() => setCamera(initialCamera)}>Сбросить вид</button>
      <button onClick={() => setCamera({ yaw: 0, pitch: 0, zoom: 1 })}>Спереди · X–Z</button>
      <button onClick={() => setCamera({ yaw: 0, pitch: 90, zoom: 1 })}>Сверху · X–Y</button>
    </div>
    <p className="scene3d-note">Мышь: перетаскивайте сцену. На сенсорном экране: движение вбок вращает, вверх и вниз прокручивает страницу. Все настройки доступны с клавиатуры через ползунки.</p>
    {camera.zoom > 1 && <p className="scene3d-note">При увеличении часть сцены может выйти за рамку. «Сбросить вид» вернёт её целиком.</p>}
    {(geometry.outside > 0 || geometry.invalid > 0) && <p className="scene3d-note" role="status">За диапазоном осей: {geometry.outside} исходных координат. Линии и поверхности отсечены на границах; внешние точки скрыты.{geometry.invalid > 0 && ` Неконечных координат пропущено: ${geometry.invalid}.`}</p>}
    {showLegend && <ul className="scene3d-legend" aria-label="Легенда 3D-сцены">{legend.map((item, i) => <li key={i}>
      <svg viewBox="0 0 24 16" width="24" height="16" aria-hidden="true">{item.kind === 'surface' ? <rect x="4" y="3" width="16" height="10" fill={item.color} fillOpacity=".7" /> : item.kind === 'line' ? <line x1="1" x2="23" y1="8" y2="8" stroke={item.color} strokeWidth="2.5" strokeDasharray={'dashed' in item && item.dashed ? '5 3' : undefined} /> : 'shape' in item && item.shape === 'triangle' ? <path d="M12,2l6,11H6Z" fill={'hollow' in item && item.hollow ? 'var(--paper)' : item.color} stroke={item.color} /> : <circle cx="12" cy="8" r="4" fill={'hollow' in item && item.hollow ? 'var(--paper)' : item.color} stroke={item.color} />}</svg>
      <span>{item.name}{'dashed' in item && item.dashed ? ' · пунктир' : ''}</span></li>)}</ul>}
    {points.length > 0 && !geometry.error && <details className="scene3d-data"><summary>Координаты отмеченных точек ({Math.min(24, points.length)}{points.length > 24 ? ` из ${points.length}` : ''})</summary>
      <div className="scene3d-table-wrap"><table><caption>Исходные значения до масштабирования осей. {points.length > 24 ? 'Показаны первые 24 точки.' : 'Все отмеченные точки.'}</caption><thead><tr><th scope="col">Точка</th>{axisNames.map(name => <th scope="col" key={name}>{name}</th>)}<th scope="col">В диапазоне</th></tr></thead><tbody>{points.slice(0, 24).map((point, i) => {
        const position = normalizePoint(point.position, axes);
        return <tr key={i}><th scope="row">{point.name}</th>{point.position.map((value, j) => <td key={j}>{fmt(value, 4)}</td>)}<td>{!position ? 'Нет: нечисловое значение' : inCube(position) ? 'Да' : 'Нет'}</td></tr>;
      })}</tbody></table></div></details>}
    {surfaces.length > 0 && <p className="scene3d-note scene3d-render-note">Поверхность состоит из плоских граней между образцами. Перекрытия приближённо упорядочены по глубине; на пересечении граней возможны артефакты.</p>}
  </figure>;
}

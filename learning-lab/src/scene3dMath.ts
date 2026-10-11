export type Vec3 = readonly [number, number, number];
export type SceneAxis = { label: string; min: number; max: number };
export type SceneAxes = readonly [SceneAxis, SceneAxis, SceneAxis];
export type SceneSurface = { name: string; rows: readonly (readonly Vec3[])[]; color?: string; opacity?: number };
export type SceneLine = { name: string; points: readonly Vec3[]; color?: string; dashed?: boolean };
export type ScenePoint = { name: string; position: Vec3; color?: string };
export type Scene3DProps = {
  title: string;
  description: string;
  showLegend?: boolean;
  axes: SceneAxes;
  surfaces?: readonly SceneSurface[];
  lines?: readonly SceneLine[];
  points?: readonly ScenePoint[];
};

export const sceneColors = ['#27694e', '#9f4a19', '#6a52a0', '#2a7293'];

export function assertAxes(axes: SceneAxes) {
  if (axes.some(({ min, max }) => !Number.isFinite(min) || !Number.isFinite(max) || !(max > min) || !Number.isFinite(max - min))) {
    throw new RangeError('Каждой оси нужен конечный диапазон: минимум меньше максимума.');
  }
}

/** Coordinates use independent axis scales. Distances/angles in this cube are not data-space distances/angles. */
export function normalizePoint(point: Vec3, axes: SceneAxes): Vec3 | null {
  const result = point.map((value, i) => 2 * ((value - axes[i].min) / (axes[i].max - axes[i].min)) - 1) as unknown as Vec3;
  return result.every(Number.isFinite) ? result : null;
}

export function inCube(point: Vec3) {
  return point.every(value => Number.isFinite(value) && value >= -1 && value <= 1);
}

/** Orthographic camera: Z is vertical at pitch=0; positive depth faces the viewer. Angles are degrees. */
export function rotatePoint([x, y, z]: Vec3, yaw: number, pitch: number): Vec3 {
  const a = yaw * Math.PI / 180, b = pitch * Math.PI / 180;
  const across = Math.cos(a) * x - Math.sin(a) * y;
  const groundDepth = Math.sin(a) * x + Math.cos(a) * y;
  return [across, Math.cos(b) * z - Math.sin(b) * groundDepth, Math.sin(b) * z + Math.cos(b) * groundDepth];
}

export function projectPoint(point: Vec3, yaw: number, pitch: number, width: number, height: number, zoom = 1) {
  const [across, up, depth] = rotatePoint(point, yaw, pitch);
  // A sphere enclosing the normalized cube fits at every angle when zoom=1.
  const scale = Math.max(1, Math.min(width - 80, height - 80)) / (2 * Math.sqrt(3)) * zoom;
  return { x: width / 2 + across * scale, y: height / 2 - up * scale, depth };
}

function interpolate(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Slab clipping keeps crossings even when both endpoints are outside. */
export function clipSegment(a: Vec3, b: Vec3): readonly [Vec3, Vec3] | null {
  if (![...a, ...b].every(Number.isFinite)) return null;
  let start = 0, end = 1;
  for (let axis = 0; axis < 3; axis++) {
    const delta = b[axis] - a[axis];
    if (delta === 0) {
      if (a[axis] < -1 || a[axis] > 1) return null;
      continue;
    }
    const t1 = (-1 - a[axis]) / delta, t2 = (1 - a[axis]) / delta;
    start = Math.max(start, Math.min(t1, t2));
    end = Math.min(end, Math.max(t1, t2));
    if (start > end) return null;
  }
  return [interpolate(a, b, start), interpolate(a, b, end)];
}

/** Sutherland–Hodgman clipping of a convex polygon to all six cube planes. */
export function clipPolygon(polygon: readonly Vec3[]): Vec3[] {
  if (polygon.some(point => !point.every(Number.isFinite))) return [];
  let output = [...polygon];
  for (let axis = 0; axis < 3; axis++) {
    for (const sign of [-1, 1]) {
      const input = output;
      output = [];
      for (let i = 0; i < input.length; i++) {
        const a = input[i], b = input[(i + 1) % input.length];
        const aInside = sign * a[axis] <= 1, bInside = sign * b[axis] <= 1;
        if (aInside) output.push(a);
        if (aInside !== bInside) output.push(interpolate(a, b, (sign - a[axis]) / (b[axis] - a[axis])));
      }
    }
  }
  return output;
}

export type ScenePrimitive = {
  kind: 'surface' | 'line' | 'point';
  vertices: readonly Vec3[];
  name: string;
  color: string;
  opacity?: number;
  dashed?: boolean;
  lineDistance?: number;
};

export function buildSceneGeometry({ axes, surfaces = [], lines = [], points = [] }: Pick<Scene3DProps, 'axes' | 'surfaces' | 'lines' | 'points'>) {
  assertAxes(axes);
  const primitives: ScenePrimitive[] = [];
  let outside = 0, invalid = 0;
  const normalize = (point: Vec3) => {
    const normalized = normalizePoint(point, axes);
    if (!normalized) invalid++;
    else if (!inCube(normalized)) outside++;
    return normalized;
  };
  surfaces.forEach((surface, index) => {
    const rows = surface.rows.map(row => row.map(normalize));
    const color = surface.color ?? sceneColors[index % sceneColors.length];
    for (let i = 0; i < rows.length - 1; i++) {
      for (let j = 0; j < Math.min(rows[i].length, rows[i + 1].length) - 1; j++) {
        const [a, b, c, d] = [rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]];
        for (const triangle of [[a, b, c], [a, c, d]]) {
          if (triangle.some(point => !point)) continue;
          const vertices = clipPolygon(triangle as Vec3[]);
          if (vertices.length >= 3) primitives.push({ kind: 'surface', vertices, name: surface.name, color,
            opacity: Number.isFinite(surface.opacity) ? Math.max(0, Math.min(1, surface.opacity!)) : .72 });
        }
      }
    }
  });
  lines.forEach((line, index) => {
    const vertices = line.points.map(normalize);
    const color = line.color ?? sceneColors[(surfaces.length + index) % sceneColors.length];
    let lineDistance = 0;
    for (let i = 0; i < vertices.length - 1; i++) {
      const a = vertices[i], b = vertices[i + 1];
      if (!a || !b) continue;
      const clipped = clipSegment(a, b);
      if (!clipped) continue;
      // Short segments make painter ordering useful for lines crossing the surface mesh.
      const length = Math.hypot(...clipped[0].map((v, j) => v - clipped[1][j]));
      const count = Math.max(1, Math.ceil(length / .14));
      for (let piece = 0; piece < count; piece++) {
        primitives.push({ kind: 'line', vertices: [interpolate(...clipped, piece / count), interpolate(...clipped, (piece + 1) / count)], name: line.name, color, dashed: line.dashed, lineDistance: lineDistance + length * piece / count });
      }
      lineDistance += length;
    }
  });
  points.forEach((point, index) => {
    const position = normalize(point.position);
    if (position && inCube(position)) primitives.push({ kind: 'point', vertices: [position], name: point.name,
      color: point.color ?? sceneColors[(surfaces.length + lines.length + index) % sceneColors.length] });
  });
  return { primitives, outside, invalid };
}

export function sortByDepth(primitives: readonly ScenePrimitive[], yaw: number, pitch: number) {
  // ponytail: mean-depth painter ordering approximates intersecting triangles; use a depth buffer if exact occlusion becomes necessary.
  return primitives.map(primitive => ({ ...primitive,
    depth: primitive.vertices.reduce((sum, point) => sum + rotatePoint(point, yaw, pitch)[2], 0) / primitive.vertices.length,
  })).sort((a, b) => a.depth - b.depth);
}

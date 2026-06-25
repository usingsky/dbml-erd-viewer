import { memo, type ReactNode } from 'react';
import {
  getBezierPath,
  getSmoothStepPath,
  Position,
  useInternalNode,
  type EdgeProps,
  type InternalNode,
  type Node,
} from '@xyflow/react';
import type { Cardinality, RelationKind } from '../types';

/** Cardinality + optionality of one rendered edge end. */
export interface EdgeEndSpec {
  cardinality: Cardinality;
  /** `true` = optional, `false` = mandatory, `undefined` = unspecified (pure cardinality). */
  optional?: boolean;
}

export interface ErdEdgeData {
  kind: RelationKind;
  /** Glyph at the source point. */
  sourceEnd: EdgeEndSpec;
  /** Glyph at the target point. */
  targetEnd: EdgeEndSpec;
  /** Set while the relation is hovered, to emphasize the edge. */
  hovered?: boolean;
  [key: string]: unknown;
}

// Geometry of the crow's-foot glyphs, in px measured outward from the connection point.
const PRONG = 8; // half-height of bars / crow's-foot spread
const FOOT = 13; // crow's-foot depth
const BAR_1 = 7; // inner bar distance
const BAR_2 = 13; // outer bar distance ("one and only one")
const RING_ONE = 16; // ring distance for "zero or one"

// Rotation (deg) that maps the canonical "+x = outward" frame onto each attachment side.
const POSITION_ANGLE: Record<Position, number> = {
  [Position.Right]: 0,
  [Position.Left]: 180,
  [Position.Top]: -90,
  [Position.Bottom]: 90,
};

/**
 * Render the MySQL-Workbench-style end glyph at a connection point.
 *
 * The glyph is built in a canonical frame — connection point at the origin, "outward" (away
 * from the table) pointing along +x — then translated to `(x, y)` and rotated so +x points
 * outward on the actual attachment side. That lets one implementation serve left/right
 * (column-anchored) and any side (floating) attachments. Stroke/fill are inline (not CSS
 * classes) so image export — which clones the DOM without our stylesheet — still renders them.
 */
function renderEnd(
  x: number,
  y: number,
  position: Position,
  spec: EdgeEndSpec,
  stroke: string,
  strokeWidth: number,
): ReactNode {
  const parts: ReactNode[] = [];
  const lineStyle = { stroke, strokeWidth };

  const bar = (dist: number, key: string) =>
    parts.push(<line key={key} x1={dist} y1={-PRONG} x2={dist} y2={PRONG} style={lineStyle} />);
  const ring = (dist: number, key: string) =>
    parts.push(
      <circle
        key={key}
        cx={dist}
        cy={0}
        r={4}
        style={{ stroke, strokeWidth, fill: 'var(--dv-bg)' }}
      />,
    );

  if (spec.cardinality === '*') {
    // Crow's foot (toes at the border, apex outward) + a cardinality glyph beyond it:
    // a ring for "zero or many" when explicitly marked optional, otherwise a bar.
    parts.push(
      <line key="cf1" x1={FOOT} y1={0} x2={0} y2={-PRONG} style={lineStyle} />,
      <line key="cf2" x1={FOOT} y1={0} x2={0} y2={0} style={lineStyle} />,
      <line key="cf3" x1={FOOT} y1={0} x2={0} y2={PRONG} style={lineStyle} />,
    );
    if (spec.optional === true) ring(FOOT + 4, 'fr');
    else bar(FOOT + 1, 'fb');
  } else {
    bar(BAR_1, 'b1'); // the "one"
    if (spec.optional === true)
      ring(RING_ONE, 'r'); // zero or one (nullable FK)
    else if (spec.optional === false) bar(BAR_2, 'b2'); // one and only one (not-null FK)
    // undefined → single bar only (cardinality "one", participation unspecified)
  }

  return (
    <g
      className="dv-erd-marker"
      transform={`translate(${x}, ${y}) rotate(${POSITION_ANGLE[position]})`}
    >
      {parts}
    </g>
  );
}

/** The shared edge body: hit-area path, visible path, and the two end glyphs. */
function edgeBody(
  path: string,
  d: ErdEdgeData | undefined,
  active: boolean,
  sx: number,
  sy: number,
  sourcePosition: Position,
  tx: number,
  ty: number,
  targetPosition: Position,
): ReactNode {
  const dashed = d?.kind === 'non-identifying';
  // Inline color/width (via theme vars) so the diagram exports correctly as an image.
  const stroke = active ? 'var(--dv-edge-active)' : 'var(--dv-edge)';
  const strokeWidth = active ? 2 : 1.5;
  return (
    <g className={`dv-erd-edge${active ? ' dv-erd-edge--active' : ''}`}>
      {/* Transparent wide path widens the pointer hit area for hovering. */}
      <path className="dv-erd-edge__interaction" d={path} fill="none" />
      <path
        className="dv-erd-edge__path"
        d={path}
        fill="none"
        style={{ stroke, strokeWidth }}
        strokeDasharray={dashed ? '6 4' : undefined}
      />
      {d && renderEnd(sx, sy, sourcePosition, d.sourceEnd, stroke, strokeWidth)}
      {d && renderEnd(tx, ty, targetPosition, d.targetEnd, stroke, strokeWidth)}
    </g>
  );
}

/**
 * Column-anchored edge: endpoints are fixed to per-column handles on the left/right of each
 * table (the default rendering). React Flow supplies the resolved handle coordinates.
 */
function ErdEdgeComponent({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps) {
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
  });
  const d = data as ErdEdgeData | undefined;
  return edgeBody(
    path,
    d,
    Boolean(selected || d?.hovered),
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  );
}

export const ErdEdge = memo(ErdEdgeComponent);

// --- Floating edges: connect table-to-table, attaching wherever the two nodes face each
//     other (like https://reactflow.dev/examples/edges/simple-floating-edges). ---

interface NodeRect {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

function nodeRect(node: InternalNode<Node>): NodeRect {
  const w = node.measured?.width ?? 0;
  const h = node.measured?.height ?? 0;
  const { x, y } = node.internals.positionAbsolute;
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
}

/** Point where the line from `node`'s center toward `other`'s center crosses `node`'s border. */
function borderIntersection(node: InternalNode<Node>, other: InternalNode<Node>) {
  const a = nodeRect(node);
  const b = nodeRect(other);
  const w = a.w / 2;
  const h = a.h / 2;
  const xx = (b.cx - a.cx) / (2 * w) - (b.cy - a.cy) / (2 * h);
  const yy = (b.cx - a.cx) / (2 * w) + (b.cy - a.cy) / (2 * h);
  const k = 1 / (Math.abs(xx) + Math.abs(yy) || 1);
  return { x: w * k * (xx + yy) + a.cx, y: h * k * (-xx + yy) + a.cy };
}

/** Which side of `node` the intersection point sits on. */
function intersectionSide(node: InternalNode<Node>, point: { x: number; y: number }): Position {
  const a = nodeRect(node);
  const px = Math.round(point.x);
  const py = Math.round(point.y);
  if (px <= Math.round(a.x) + 1) return Position.Left;
  if (px >= Math.round(a.x + a.w) - 1) return Position.Right;
  if (py <= Math.round(a.y) + 1) return Position.Top;
  return Position.Bottom;
}

const SELF_LOOP_SPREAD = 14; // vertical gap between a self-loop's two endpoints

function FloatingEdgeComponent({ id, source, target, data, selected }: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  if (!sourceNode || !targetNode) return null;
  const d = data as ErdEdgeData | undefined;
  const active = Boolean(selected || d?.hovered);

  let sx: number;
  let sy: number;
  let tx: number;
  let ty: number;
  let sourcePosition: Position;
  let targetPosition: Position;

  if (source === target) {
    // Self-reference: bow a loop out the right side instead of degenerating to a point.
    const a = nodeRect(sourceNode);
    sx = tx = a.x + a.w;
    sy = a.cy - SELF_LOOP_SPREAD;
    ty = a.cy + SELF_LOOP_SPREAD;
    sourcePosition = targetPosition = Position.Right;
  } else {
    const sp = borderIntersection(sourceNode, targetNode);
    const tp = borderIntersection(targetNode, sourceNode);
    sx = sp.x;
    sy = sp.y;
    tx = tp.x;
    ty = tp.y;
    sourcePosition = intersectionSide(sourceNode, sp);
    targetPosition = intersectionSide(targetNode, tp);
  }

  const [path] = getBezierPath({
    sourceX: sx,
    sourceY: sy,
    sourcePosition,
    targetX: tx,
    targetY: ty,
    targetPosition,
  });
  void id;
  return edgeBody(path, d, active, sx, sy, sourcePosition, tx, ty, targetPosition);
}

export const FloatingEdge = memo(FloatingEdgeComponent);

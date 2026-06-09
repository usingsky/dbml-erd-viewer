import { memo, type ReactNode } from 'react';
import { getSmoothStepPath, Position, type EdgeProps } from '@xyflow/react';
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

/**
 * Render the MySQL-Workbench-style end glyph at a connection point.
 *
 * Edges attach to the left/right side of a table, so glyphs are laid out horizontally:
 * `toTable` points from the connection point toward the table body, `out` points along
 * the line away from it (where the notation symbols stack).
 */
function renderEnd(
  x: number,
  y: number,
  position: Position,
  spec: EdgeEndSpec,
  stroke: string,
  strokeWidth: number,
): ReactNode {
  const toTable = position === Position.Left ? 1 : -1;
  const out = -toTable;
  const parts: ReactNode[] = [];
  // Stroke/fill are set inline (not via CSS classes) so image export — which clones
  // the DOM without our stylesheet — still renders them.
  const lineStyle = { stroke, strokeWidth };

  const bar = (dist: number, key: string) =>
    parts.push(
      <line
        key={key}
        x1={x + out * dist}
        y1={y - PRONG}
        x2={x + out * dist}
        y2={y + PRONG}
        style={lineStyle}
      />,
    );
  const ring = (dist: number, key: string) =>
    parts.push(
      <circle
        key={key}
        cx={x + out * dist}
        cy={y}
        r={4}
        style={{ stroke, strokeWidth, fill: 'var(--dv-bg)' }}
      />,
    );

  if (spec.cardinality === '*') {
    // Crow's foot + a cardinality glyph just beyond it (MySQL Workbench's "many" style):
    // a ring for "zero or many" when explicitly marked optional, otherwise a bar.
    const apexX = x + out * FOOT;
    parts.push(
      <line key="cf1" x1={apexX} y1={y} x2={x} y2={y - PRONG} style={lineStyle} />,
      <line key="cf2" x1={apexX} y1={y} x2={x} y2={y} style={lineStyle} />,
      <line key="cf3" x1={apexX} y1={y} x2={x} y2={y + PRONG} style={lineStyle} />,
    );
    // Glyph sits flush against the crow's-foot apex (no gap).
    if (spec.optional === true)
      ring(FOOT + 4, 'fr'); // zero or many (opt-in via note)
    else bar(FOOT + 1, 'fb'); // cardinality bar, flush to the foot
  } else {
    bar(BAR_1, 'b1'); // the "one"
    if (spec.optional === true)
      ring(RING_ONE, 'r'); // zero or one (nullable FK)
    else if (spec.optional === false) bar(BAR_2, 'b2'); // one and only one (not-null FK)
    // undefined → single bar only (cardinality "one", participation unspecified)
  }

  return <g className="dv-erd-marker">{parts}</g>;
}

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
  const dashed = d?.kind === 'non-identifying';
  const active = selected || d?.hovered;
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
      {d && renderEnd(sourceX, sourceY, sourcePosition, d.sourceEnd, stroke, strokeWidth)}
      {d && renderEnd(targetX, targetY, targetPosition, d.targetEnd, stroke, strokeWidth)}
    </g>
  );
}

export const ErdEdge = memo(ErdEdgeComponent);

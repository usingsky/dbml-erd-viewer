import type { ParsedSchema, TableInfo } from '../types';

/** Visual sizing used both for layout math and for the node component. */
export const MIN_NODE_WIDTH = 160;
export const MAX_NODE_WIDTH = 320;
/**
 * @deprecated A node's width is now content-derived per table — use {@link tableWidth}.
 * Kept as a stable reference (equal to {@link MAX_NODE_WIDTH}) for back-compat.
 */
export const NODE_WIDTH = MAX_NODE_WIDTH;
export const HEADER_HEIGHT = 40;
export const ROW_HEIGHT = 28;

/** Position and measured size of a laid-out table node. */
export interface NodeBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Layout algorithm to position the table nodes. */
export type LayoutAlgorithm = 'simple' | 'dagre' | 'elk';

/** Primary flow direction of the layout. */
export type LayoutDirection = 'LR' | 'TB';

export interface LayoutOptions {
  /**
   * Algorithm used to place nodes. Default `'simple'` (built-in, no dependency).
   * `'dagre'` requires `@dagrejs/dagre`; `'elk'` requires `elkjs` — both optional
   * peer dependencies, loaded on demand.
   */
  algorithm?: LayoutAlgorithm;
  /** Primary direction: `'LR'` (left→right, default) or `'TB'` (top→bottom). */
  direction?: LayoutDirection;
  /** Horizontal gap between layers. */
  horizontalGap?: number;
  /** Vertical gap between stacked tables. */
  verticalGap?: number;
  /** Minimum table-node width in px. Default {@link MIN_NODE_WIDTH} (160). */
  minNodeWidth?: number;
  /**
   * Maximum table-node width in px; content wider than this is truncated with an ellipsis.
   * Default {@link MAX_NODE_WIDTH} (320). If set below `minNodeWidth`, the max wins.
   */
  maxNodeWidth?: number;
}

/** Lower/upper bounds for {@link tableWidth}. Unset fields fall back to the module defaults. */
export interface NodeWidthBounds {
  minWidth?: number;
  maxWidth?: number;
}

/** Height of a table node given its column count. */
export function tableHeight(table: TableInfo): number {
  return HEADER_HEIGHT + Math.max(table.columns.length, 1) * ROW_HEIGHT;
}

// Horizontal sizing constants for the width estimate (mirror styles.css / TableNode).
const ROW_PADDING_X = 24; // 12px left + 12px right
const NAME_TYPE_GAP = 8; // min gap between the name and type columns
const BADGE_WIDTH = 24; // a PK/FK badge plus its gap
const NULL_DOT_WIDTH = 12; // nullability dot plus its gap
const HEADER_PADDING_X = 24;
const CHAR_BODY = 6.8; // approx px per char at the 12px body font
const CHAR_HEADER = 7.4; // approx px per char at the 13px bold header font

/**
 * Estimate a table node's natural width from its content (the longest column row and the
 * header), clamped to `[MIN_NODE_WIDTH, MAX_NODE_WIDTH]`. Used for both layout math and the
 * rendered node, so they stay in sync. Text is measured by an average-character heuristic
 * (no DOM); any underestimate is absorbed by the CSS ellipsis at the max width.
 */
export function tableWidth(table: TableInfo, bounds: NodeWidthBounds = {}): number {
  const min = bounds.minWidth ?? MIN_NODE_WIDTH;
  const max = bounds.maxWidth ?? MAX_NODE_WIDTH;
  let widest = HEADER_PADDING_X + headerTextLength(table) * CHAR_HEADER;
  for (const col of table.columns) {
    const badge = col.pk || col.isForeignKey ? BADGE_WIDTH : 0;
    const nameW = badge + col.name.length * CHAR_BODY;
    const typeW = col.type.length * CHAR_BODY + NULL_DOT_WIDTH;
    widest = Math.max(widest, ROW_PADDING_X + nameW + NAME_TYPE_GAP + typeW);
  }
  // `min(max, …)` last so an out-of-order `min > max` still yields a sane (max) result.
  return Math.round(Math.min(max, Math.max(min, widest)));
}

function headerTextLength(table: TableInfo): number {
  return (table.schema ? table.schema.length + 1 : 0) + table.name.length;
}

/**
 * Assign each table to a layer (x-axis level) using longest-path layering over the
 * FK graph (referencing table sits left of the table it references). Relaxation runs
 * at most `n` rounds, which also bounds the effect of cycles.
 */
function assignLayers(schema: ParsedSchema): Map<string, number> {
  const level = new Map<string, number>();
  for (const t of schema.tables) level.set(t.id, 0);

  const edges = schema.relations
    .map((r) => [r.from.tableId, r.to.tableId] as const)
    .filter(([u, v]) => u !== v && level.has(u) && level.has(v));

  for (let i = 0; i < schema.tables.length; i++) {
    let changed = false;
    for (const [u, v] of edges) {
      const next = level.get(u)! + 1;
      if (level.get(v)! < next) {
        level.set(v, next);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return level;
}

/**
 * Compute node positions for the parsed schema.
 *
 * Tables are arranged left-to-right by their layer in the FK graph and stacked
 * vertically within each layer. The result is keyed by {@link TableInfo.id}.
 */
export function layoutSchema(
  schema: ParsedSchema,
  options: LayoutOptions = {},
): Map<string, NodeBox> {
  const horizontalGap = options.horizontalGap ?? 120;
  const verticalGap = options.verticalGap ?? 40;
  const widthBounds: NodeWidthBounds = {
    minWidth: options.minNodeWidth,
    maxWidth: options.maxNodeWidth,
  };

  const level = assignLayers(schema);
  const byLevel = new Map<number, TableInfo[]>();
  for (const table of schema.tables) {
    const l = level.get(table.id) ?? 0;
    let bucket = byLevel.get(l);
    if (!bucket) {
      bucket = [];
      byLevel.set(l, bucket);
    }
    bucket.push(table);
  }

  const boxes = new Map<string, NodeBox>();
  const sortedLevels = [...byLevel.keys()].sort((a, b) => a - b);

  // Each level is its own column; advance x by the widest node in the level so variable
  // node widths don't cause neighbouring columns to overlap.
  let x = 0;
  for (const l of sortedLevels) {
    const tables = byLevel.get(l)!.sort((a, b) => a.name.localeCompare(b.name));
    let columnWidth = 0;
    let y = 0;
    for (const table of tables) {
      const width = tableWidth(table, widthBounds);
      const height = tableHeight(table);
      boxes.set(table.id, { x, y, width, height });
      columnWidth = Math.max(columnWidth, width);
      y += height + verticalGap;
    }
    x += columnWidth + horizontalGap;
  }

  return boxes;
}

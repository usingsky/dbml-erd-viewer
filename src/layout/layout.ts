import type { ParsedSchema, TableInfo } from '../types';

/** Visual sizing used both for layout math and for the node component. */
export const NODE_WIDTH = 240;
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
}

/** Height of a table node given its column count. */
export function tableHeight(table: TableInfo): number {
  return HEADER_HEIGHT + Math.max(table.columns.length, 1) * ROW_HEIGHT;
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

  sortedLevels.forEach((l, columnIndex) => {
    const tables = byLevel.get(l)!.sort((a, b) => a.name.localeCompare(b.name));
    const x = columnIndex * (NODE_WIDTH + horizontalGap);
    let y = 0;
    for (const table of tables) {
      const height = tableHeight(table);
      boxes.set(table.id, { x, y, width: NODE_WIDTH, height });
      y += height + verticalGap;
    }
  });

  return boxes;
}

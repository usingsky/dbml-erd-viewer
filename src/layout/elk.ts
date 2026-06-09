import type { ParsedSchema } from '../types';
import { NODE_WIDTH, tableHeight, type LayoutOptions, type NodeBox } from './layout';

// Minimal shape of the elkjs API we use, so we don't couple to its full types.
interface ElkNode {
  id: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  layoutOptions?: Record<string, string>;
  children?: ElkNode[];
  edges?: { id: string; sources: string[]; targets: string[] }[];
}
interface ElkInstance {
  layout(graph: ElkNode): Promise<ElkNode>;
}

/**
 * Lay out the schema with ELK's `layered` algorithm. Requires the optional `elkjs`
 * dependency, imported on demand. ELK does stronger crossing reduction than the
 * built-in layout and is a good fit for dense schemas.
 */
export async function elkLayout(
  schema: ParsedSchema,
  options: LayoutOptions = {},
): Promise<Map<string, NodeBox>> {
  const mod = (await import('elkjs/lib/elk.bundled.js')) as unknown as {
    default: new () => ElkInstance;
  };
  const elk = new mod.default();

  const horizontalGap = options.horizontalGap ?? 120;
  const verticalGap = options.verticalGap ?? 40;
  const direction = options.direction === 'TB' ? 'DOWN' : 'RIGHT';

  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction,
      'elk.layered.spacing.nodeNodeBetweenLayers': String(horizontalGap),
      'elk.spacing.nodeNode': String(verticalGap),
    },
    children: schema.tables.map((table) => ({
      id: table.id,
      width: NODE_WIDTH,
      height: tableHeight(table),
    })),
    // Edge child -> parent, matching the other algorithms' orientation.
    edges: schema.relations.map((rel, i) => ({
      id: `e${i}`,
      sources: [rel.from.tableId],
      targets: [rel.to.tableId],
    })),
  };

  const result = await elk.layout(graph);

  const boxes = new Map<string, NodeBox>();
  for (const child of result.children ?? []) {
    boxes.set(child.id, {
      x: child.x ?? 0,
      y: child.y ?? 0,
      width: child.width ?? NODE_WIDTH,
      height: child.height ?? 0,
    });
  }
  return boxes;
}

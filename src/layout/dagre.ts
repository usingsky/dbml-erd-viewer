import type { ParsedSchema } from '../types';
import { NODE_WIDTH, tableHeight, type LayoutOptions, type NodeBox } from './layout';

/**
 * Lay out the schema with dagre's Sugiyama-style layered algorithm (crossing
 * minimization + coordinate assignment). Requires the optional `@dagrejs/dagre`
 * dependency, which is imported on demand.
 */
export async function dagreLayout(
  schema: ParsedSchema,
  options: LayoutOptions = {},
): Promise<Map<string, NodeBox>> {
  const dagre = await import('@dagrejs/dagre');
  const horizontalGap = options.horizontalGap ?? 120;
  const verticalGap = options.verticalGap ?? 40;
  const rankdir = options.direction === 'TB' ? 'TB' : 'LR';

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir, ranksep: horizontalGap, nodesep: verticalGap });
  g.setDefaultEdgeLabel(() => ({}));

  for (const table of schema.tables) {
    g.setNode(table.id, { width: NODE_WIDTH, height: tableHeight(table) });
  }
  // Edge child -> parent keeps the referenced table on the later rank.
  for (const rel of schema.relations) {
    if (g.hasNode(rel.from.tableId) && g.hasNode(rel.to.tableId)) {
      g.setEdge(rel.from.tableId, rel.to.tableId);
    }
  }

  dagre.layout(g);

  const boxes = new Map<string, NodeBox>();
  for (const id of g.nodes()) {
    const node = g.node(id);
    if (!node) continue;
    // dagre reports node centers; convert to top-left for xyflow.
    boxes.set(id, {
      x: node.x - node.width / 2,
      y: node.y - node.height / 2,
      width: node.width,
      height: node.height,
    });
  }
  return boxes;
}

import { useCallback, useMemo, useState } from 'react';
import type { Edge } from '@xyflow/react';
import type { RelationInfo } from '../types';
import type { TableNodeType } from './TableNode';
import type { ErdEdgeData } from './ErdEdge';

export interface RelationHighlight {
  /** Nodes with `highlightedColumns` injected on the hovered relation's endpoints. */
  displayNodes: TableNodeType[];
  /** Edges with the hovered relation flagged for emphasis. */
  displayEdges: Edge<ErdEdgeData>[];
  onEdgeMouseEnter: (event: unknown, edge: Edge) => void;
  onEdgeMouseLeave: () => void;
}

/**
 * Track the hovered relation and derive highlighted nodes/edges from it: the two
 * endpoint columns get highlighted and the edge is emphasized. Nodes/edges not
 * involved keep their original reference so memoized children skip re-rendering.
 */
export function useRelationHighlight(
  relations: RelationInfo[],
  nodes: TableNodeType[],
  edges: Edge<ErdEdgeData>[],
): RelationHighlight {
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);

  const relationsById = useMemo(() => {
    const map = new Map<string, RelationInfo>();
    for (const rel of relations) map.set(rel.id, rel);
    return map;
  }, [relations]);

  // tableId -> set of column names to highlight for the hovered relation.
  const highlightByTable = useMemo(() => {
    const map = new Map<string, Set<string>>();
    const rel = hoveredEdgeId ? relationsById.get(hoveredEdgeId) : undefined;
    if (!rel) return map;
    for (const ep of [rel.from, rel.to]) {
      const set = map.get(ep.tableId) ?? new Set<string>();
      ep.columns.forEach((c) => set.add(c));
      map.set(ep.tableId, set);
    }
    return map;
  }, [hoveredEdgeId, relationsById]);

  const displayNodes = useMemo(() => {
    if (!hoveredEdgeId) return nodes;
    return nodes.map((node) => {
      const highlightedColumns = highlightByTable.get(node.id);
      return highlightedColumns ? { ...node, data: { ...node.data, highlightedColumns } } : node;
    });
  }, [nodes, hoveredEdgeId, highlightByTable]);

  const displayEdges = useMemo(() => {
    if (!hoveredEdgeId) return edges;
    return edges.map((edge) =>
      edge.id === hoveredEdgeId
        ? { ...edge, data: { ...(edge.data as ErdEdgeData), hovered: true }, zIndex: 1 }
        : edge,
    );
  }, [edges, hoveredEdgeId]);

  const onEdgeMouseEnter = useCallback((_: unknown, edge: Edge) => setHoveredEdgeId(edge.id), []);
  const onEdgeMouseLeave = useCallback(() => setHoveredEdgeId(null), []);

  return { displayNodes, displayEdges, onEdgeMouseEnter, onEdgeMouseLeave };
}

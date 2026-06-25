import { useCallback, useMemo, useState } from 'react';
import type { Edge } from '@xyflow/react';
import type { RelationInfo } from '../types';
import type { TableNodeType } from './TableNode';
import type { ErdEdgeData } from './ErdEdge';

export interface RelationHighlight {
  /** Nodes with `highlightedColumns` injected on the active relations' endpoints. */
  displayNodes: TableNodeType[];
  /** Edges with the active relations flagged for emphasis. */
  displayEdges: Edge<ErdEdgeData>[];
  onEdgeMouseEnter: (event: unknown, edge: Edge) => void;
  onEdgeMouseLeave: () => void;
  /** Stable handler for a column hover (`null` on leave); provide via `ColumnHoverContext`. */
  onColumnHover: (tableId: string, column: string | null) => void;
}

/** A hovered column, identifying its table and name. */
interface HoveredColumn {
  tableId: string;
  column: string;
}

/**
 * Track the hovered relation ? driven from either side: hovering an edge, or hovering a
 * column (the returned `onColumnHover`, wired to `TableNode` via `ColumnHoverContext`). The
 * active relations' endpoint columns get highlighted and the matching edges are emphasized.
 * Nodes/edges not involved keep their original reference so memoized children skip
 * re-rendering ? and `onColumnHover` is NOT stored in node data, so a drag doesn't churn it.
 */
export function useRelationHighlight(
  relations: RelationInfo[],
  nodes: TableNodeType[],
  edges: Edge<ErdEdgeData>[],
): RelationHighlight {
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [hoveredColumn, setHoveredColumn] = useState<HoveredColumn | null>(null);

  const relationsById = useMemo(() => {
    const map = new Map<string, RelationInfo>();
    for (const rel of relations) map.set(rel.id, rel);
    return map;
  }, [relations]);

  // The relations to emphasize: the hovered edge, plus every relation touching the hovered
  // column on either endpoint.
  const activeRelationIds = useMemo(() => {
    const ids = new Set<string>();
    if (hoveredEdgeId) ids.add(hoveredEdgeId);
    if (hoveredColumn) {
      for (const rel of relations) {
        const touches = (ep: RelationInfo['from']) =>
          ep.tableId === hoveredColumn.tableId && ep.columns.includes(hoveredColumn.column);
        if (touches(rel.from) || touches(rel.to)) ids.add(rel.id);
      }
    }
    return ids;
  }, [hoveredEdgeId, hoveredColumn, relations]);

  // tableId -> set of column names to highlight across all active relations.
  const highlightByTable = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const id of activeRelationIds) {
      const rel = relationsById.get(id);
      if (!rel) continue;
      for (const ep of [rel.from, rel.to]) {
        const set = map.get(ep.tableId) ?? new Set<string>();
        ep.columns.forEach((c) => set.add(c));
        map.set(ep.tableId, set);
      }
    }
    return map;
  }, [activeRelationIds, relationsById]);

  const onColumnHover = useCallback((tableId: string, column: string | null) => {
    setHoveredColumn(column ? { tableId, column } : null);
  }, []);

  const displayNodes = useMemo(() => {
    if (activeRelationIds.size === 0) return nodes;
    return nodes.map((node) => {
      const highlightedColumns = highlightByTable.get(node.id);
      return highlightedColumns ? { ...node, data: { ...node.data, highlightedColumns } } : node;
    });
  }, [nodes, activeRelationIds, highlightByTable]);

  const displayEdges = useMemo(() => {
    if (activeRelationIds.size === 0) return edges;
    return edges.map((edge) =>
      activeRelationIds.has(edge.id)
        ? { ...edge, data: { ...(edge.data as ErdEdgeData), hovered: true }, zIndex: 1 }
        : edge,
    );
  }, [edges, activeRelationIds]);

  const onEdgeMouseEnter = useCallback((_: unknown, edge: Edge) => setHoveredEdgeId(edge.id), []);
  const onEdgeMouseLeave = useCallback(() => setHoveredEdgeId(null), []);

  return { displayNodes, displayEdges, onEdgeMouseEnter, onEdgeMouseLeave, onColumnHover };
}

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type CSSProperties,
} from 'react';
import {
  Background,
  ControlButton,
  Controls,
  getNodesBounds,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type ReactFlowInstance,
} from '@xyflow/react';
import { parseDbml, DbmlParseError } from '../parser/parseDbml';
import { layoutSchema, type LayoutOptions, type NodeBox } from '../layout/layout';
import { computeLayout, LayoutError } from '../layout/computeLayout';
import {
  renderDiagram,
  downloadDataUrl,
  expandBoundsWithEdges,
  ExportError,
  type DiagramExportOptions,
} from '../export';
import { TableNode, type TableNodeType } from './TableNode';
import { ErdEdge, type ErdEdgeData } from './ErdEdge';
import { useRelationHighlight } from './useRelationHighlight';
import { handleId } from './handles';
import { themeToCssVars, type DbmlViewerTheme } from '../theme';
import type { ParsedSchema, RelationInfo } from '../types';

const NO_RELATIONS: RelationInfo[] = [];

const nodeTypes = { table: TableNode };
const edgeTypes = { erd: ErdEdge };

/** Simple 2×2 grid icon for the "auto layout" control button. */
function AutoLayoutIcon() {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor" aria-hidden="true">
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </svg>
  );
}

export interface DbmlViewerProps {
  /** DBML source text to render. */
  dbml: string;
  /** Class applied to the wrapping element. */
  className?: string;
  /** Inline style for the wrapping element. Defaults to filling its container. */
  style?: CSSProperties;
  /** Theme tokens applied as CSS variables on the viewer (partial overrides allowed). */
  theme?: DbmlViewerTheme;
  /** Fit the diagram into view on load. Default `true`. */
  fitView?: boolean;
  /** Show the zoom/pan controls. Default `true`. */
  showControls?: boolean;
  /** Show the minimap. Default `false`. */
  showMiniMap?: boolean;
  /** Show the dotted background. Default `true`. */
  showBackground?: boolean;
  /** Layout tuning: algorithm (`'simple'` | `'dagre'` | `'elk'`), direction, gaps. */
  layoutOptions?: LayoutOptions;
  /** Called when the DBML fails to parse. */
  onParseError?: (error: DbmlParseError) => void;
  /** Called when a non-default layout fails (e.g. optional dependency missing). */
  onLayoutError?: (error: LayoutError) => void;
  /**
   * Saved table positions (`id → {x, y}`) to restore. Applied when the schema/layout
   * (re)builds; tables without a saved position fall back to auto-layout. To return to a
   * fresh auto-layout, pass `undefined`/`{}`.
   */
  nodePositions?: NodePositions;
  /** Called after the user finishes dragging a table, with the full positions map to persist. */
  onNodePositionsChange?: (positions: NodePositions) => void;
}

/** Imperative handle exposed via `ref` for exporting the diagram as an image. */
export interface DbmlViewerHandle {
  /**
   * Render the full diagram to an image data URL (`'png'` or `'svg'`).
   * @throws {ExportError} when the optional `html-to-image` dependency is missing.
   */
  toDataUrl(options?: DiagramExportOptions): Promise<string>;
  /** Render the diagram and trigger a browser download. */
  download(filename: string, options?: DiagramExportOptions): Promise<void>;
}

type ParseResult = { ok: true; schema: ParsedSchema } | { ok: false; error: DbmlParseError };

/** A 2D position. */
export interface XYPosition {
  x: number;
  y: number;
}

/** Map of table id → position, used to persist and restore where the user dragged tables. */
export type NodePositions = Record<string, XYPosition>;

/**
 * Resolve each table's effective position, by priority: an explicitly saved position
 * (`saved`), then a position to preserve (`prior` — e.g. the current/dragged position),
 * then the auto-layout box. Used for both nodes and edge handle-side decisions so they stay
 * in sync.
 */
function resolvePositions(
  schema: ParsedSchema,
  boxes: Map<string, NodeBox>,
  saved?: NodePositions,
  prior?: Map<string, XYPosition>,
): Map<string, XYPosition> {
  const positions = new Map<string, XYPosition>();
  for (const table of schema.tables) {
    const box = boxes.get(table.id);
    positions.set(
      table.id,
      saved?.[table.id] ?? prior?.get(table.id) ?? { x: box?.x ?? 0, y: box?.y ?? 0 },
    );
  }
  return positions;
}

/** Whether two id lists contain the same set of ids. */
function sameIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

/** Run the requested layout, falling back to the built-in `simple` layout (and reporting) on failure. */
async function computeLayoutOrFallback(
  schema: ParsedSchema,
  opts: LayoutOptions,
  onError: (error: LayoutError) => void,
): Promise<Map<string, NodeBox>> {
  try {
    return await computeLayout(schema, opts);
  } catch (err) {
    onError(err instanceof LayoutError ? err : new LayoutError(String(err), { cause: err }));
    return layoutSchema(schema, opts);
  }
}

function buildNodes(schema: ParsedSchema, positions: Map<string, XYPosition>): TableNodeType[] {
  return schema.tables.map((table) => ({
    id: table.id,
    type: 'table',
    position: positions.get(table.id) ?? { x: 0, y: 0 },
    data: { table },
  }));
}

function buildEdges(schema: ParsedSchema, positions: Map<string, XYPosition>): Edge<ErdEdgeData>[] {
  return schema.relations.map((rel) => {
    // `from` is the child (FK holder), `to` is the parent (referenced).
    const fromPos = positions.get(rel.from.tableId);
    const toPos = positions.get(rel.to.tableId);
    // Attach on the inward-facing side of each table so edges don't cross the body.
    const fromOnLeft = (fromPos?.x ?? 0) > (toPos?.x ?? 0);
    const fromSide = fromOnLeft ? 'left' : 'right';
    const toSide = fromOnLeft ? 'right' : 'left';

    const fromCol = rel.from.columns[0] ?? '';
    const toCol = rel.to.columns[0] ?? '';

    return {
      id: rel.id,
      source: rel.from.tableId,
      target: rel.to.tableId,
      sourceHandle: handleId(fromCol, fromSide, 'source'),
      targetHandle: handleId(toCol, toSide, 'target'),
      type: 'erd',
      data: {
        kind: rel.kind,
        sourceEnd: { cardinality: rel.from.relation, optional: rel.from.optional },
        targetEnd: { cardinality: rel.to.relation, optional: rel.to.optional },
      },
    } satisfies Edge<ErdEdgeData>;
  });
}

/**
 * Render a DBML schema as an interactive diagram. Tables become draggable nodes and
 * foreign-key relations become edges connecting the related columns.
 *
 * Pass a `ref` to access the imperative {@link DbmlViewerHandle} (image export).
 */
export const DbmlViewer = forwardRef<DbmlViewerHandle, DbmlViewerProps>(function DbmlViewer(
  {
    dbml,
    className,
    style,
    theme,
    fitView = true,
    showControls = true,
    showMiniMap = false,
    showBackground = true,
    layoutOptions,
    onParseError,
    onLayoutError,
    nodePositions,
    onNodePositionsChange,
  },
  ref,
) {
  const result = useMemo<ParseResult>(() => {
    try {
      return { ok: true, schema: parseDbml(dbml) };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof DbmlParseError
            ? error
            : new DbmlParseError(String(error), { cause: error }),
      };
    }
  }, [dbml]);

  const [nodes, setNodes, onNodesChange] = useNodesState<TableNodeType>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge<ErdEdgeData>>([]);
  const flowRef = useRef<ReactFlowInstance<TableNodeType, Edge<ErdEdgeData>> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Mirror of our controlled `nodes` state. This is the source of truth for current
  // positions — unlike `flowRef.getNodes()`, it never lags behind a remount/render.
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  // Imperative export API (PNG/SVG). Reads live state via refs, so deps stay empty.
  useImperativeHandle(ref, () => {
    const toDataUrl = async (options?: DiagramExportOptions) => {
      const instance = flowRef.current;
      const viewport = containerRef.current?.querySelector<HTMLElement>('.react-flow__viewport');
      if (!instance || !viewport) {
        throw new ExportError('The diagram is not ready to export yet.');
      }
      // Include edges/markers, not just nodes, so an edge routing past the outermost
      // table doesn't eat into the export padding.
      const bounds = expandBoundsWithEdges(getNodesBounds(instance.getNodes()), viewport);
      const backgroundColor =
        options?.backgroundColor ??
        (containerRef.current ? getComputedStyle(containerRef.current).backgroundColor : undefined);
      return renderDiagram(viewport, bounds, { ...options, backgroundColor });
    };
    return {
      toDataUrl,
      download: async (filename, options) => {
        downloadDataUrl(await toDataUrl(options), filename);
      },
    };
  }, []);

  // Keep the latest callbacks/positions in refs so they don't force the layout effect to
  // re-run (which would recompute dagre/elk and reset drags); the effect reads them on rebuild.
  const onLayoutErrorRef = useRef(onLayoutError);
  onLayoutErrorRef.current = onLayoutError;
  const onNodePositionsChangeRef = useRef(onNodePositionsChange);
  onNodePositionsChangeRef.current = onNodePositionsChange;
  const nodePositionsRef = useRef(nodePositions);
  nodePositionsRef.current = nodePositions;

  // Emit the full positions map after a drag so the consumer can persist it.
  const handleNodeDragStop = useCallback(() => {
    const cb = onNodePositionsChangeRef.current;
    if (!cb) return;
    const positions: NodePositions = {};
    for (const node of nodesRef.current) {
      positions[node.id] = { x: node.position.x, y: node.position.y };
    }
    cb(positions);
  }, []);

  // Primitive option fields make stable effect deps (layoutOptions identity churns).
  const {
    algorithm = 'simple',
    direction = 'LR',
    horizontalGap,
    verticalGap,
  } = layoutOptions ?? {};

  // Tracks the table-id set + layout options last used to position nodes, so we can skip
  // re-layout when only column-level details (or relations) change.
  const layoutStateRef = useRef<{ ids: string[]; optionsKey: string } | null>(null);

  const optionsKey = `${algorithm}|${direction}|${horizontalGap}|${verticalGap}`;

  // Seed the flow from a set of layout boxes: resolve positions, set nodes/edges, record the
  // layout state, and optionally persist the arrangement and fit the view.
  const applyBoxes = useCallback(
    (
      schema: ParsedSchema,
      ids: string[],
      key: string,
      boxes: Map<string, NodeBox>,
      opts: {
        saved?: NodePositions;
        prior?: Map<string, XYPosition>;
        emit?: boolean;
        fit?: boolean;
      },
    ) => {
      const positions = resolvePositions(schema, boxes, opts.saved, opts.prior);
      setNodes(buildNodes(schema, positions));
      setEdges(buildEdges(schema, positions));
      layoutStateRef.current = { ids, optionsKey: key };
      if (opts.emit) {
        const map: NodePositions = {};
        positions.forEach((p, id) => {
          map[id] = p;
        });
        onNodePositionsChangeRef.current?.(map);
      }
      if (opts.fit) requestAnimationFrame(() => void flowRef.current?.fitView());
    },
    [setNodes, setEdges],
  );

  // Compute the layout (possibly async for 'elk'/'dagre') and seed the flow.
  useEffect(() => {
    if (!result.ok) {
      setNodes([]);
      setEdges([]);
      layoutStateRef.current = null;
      return;
    }
    const schema = result.schema;
    const opts: LayoutOptions = { algorithm, direction, horizontalGap, verticalGap };
    const ids = schema.tables.map((t) => t.id);

    // Positions currently on screen (includes user drags), from our controlled state.
    const livePositions = new Map<string, XYPosition>(
      nodesRef.current.map((n) => [n.id, { x: n.position.x, y: n.position.y }]),
    );

    const prev = layoutStateRef.current;
    // Skip layout when the same tables are shown with the same options — only columns, types,
    // notes or relations changed. Keep exactly what's on screen (preserving drags); refresh edges.
    // Guard: only skip if we actually have a live position for every table, otherwise fall
    // through to a full layout (avoids collapsing everything to the origin after a remount).
    const haveAllLive = ids.every((id) => livePositions.has(id));
    if (prev && prev.optionsKey === optionsKey && haveAllLive && sameIdSet(prev.ids, ids)) {
      applyBoxes(schema, ids, optionsKey, new Map(), { prior: livePositions });
      return;
    }

    // Full (re)layout: first render, a table was added/removed, or options changed. Existing
    // tables are kept in place when only the table set changed; an options change reshuffles all.
    const preserve = prev && prev.optionsKey === optionsKey ? livePositions : undefined;
    let cancelled = false;
    void computeLayoutOrFallback(schema, opts, (e) => onLayoutErrorRef.current?.(e)).then(
      (boxes) => {
        if (cancelled) return;
        applyBoxes(schema, ids, optionsKey, boxes, {
          saved: nodePositionsRef.current,
          prior: preserve,
          fit: fitView,
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [
    result,
    algorithm,
    direction,
    horizontalGap,
    verticalGap,
    optionsKey,
    fitView,
    applyBoxes,
    setNodes,
    setEdges,
  ]);

  // Intentional auto-layout (Controls button): reposition ALL tables by the layout algorithm,
  // ignoring saved/dragged positions, then fit and persist the fresh arrangement.
  const relayout = useCallback(() => {
    if (!result.ok) return;
    const schema = result.schema;
    const opts: LayoutOptions = { algorithm, direction, horizontalGap, verticalGap };
    const ids = schema.tables.map((t) => t.id);
    void computeLayoutOrFallback(schema, opts, (e) => onLayoutErrorRef.current?.(e)).then(
      (boxes) => {
        applyBoxes(schema, ids, optionsKey, boxes, { emit: true, fit: true });
      },
    );
  }, [result, algorithm, direction, horizontalGap, verticalGap, optionsKey, applyBoxes]);

  const handleError = useCallback(() => {
    if (!result.ok) onParseError?.(result.error);
  }, [result, onParseError]);

  useEffect(handleError, [handleError]);

  // Relation hover: highlight the edge and its two connected columns.
  const relations = result.ok ? result.schema.relations : NO_RELATIONS;
  const { displayNodes, displayEdges, onEdgeMouseEnter, onEdgeMouseLeave } = useRelationHighlight(
    relations,
    nodes,
    edges,
  );

  // Theme tokens become CSS variables; explicit `style` still wins over them.
  const wrapperStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    ...themeToCssVars(theme),
    ...style,
  };

  if (!result.ok) {
    return (
      <div className={`dv-error${className ? ` ${className}` : ''}`} style={wrapperStyle}>
        <pre className="dv-error__message">{result.error.message}</pre>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`dv-viewer${className ? ` ${className}` : ''}`}
      style={wrapperStyle}
    >
      <ReactFlow<TableNodeType, Edge<ErdEdgeData>>
        nodes={displayNodes}
        edges={displayEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onEdgeMouseEnter={onEdgeMouseEnter}
        onEdgeMouseLeave={onEdgeMouseLeave}
        onNodeDragStop={handleNodeDragStop}
        onInit={(instance) => {
          flowRef.current = instance;
        }}
        fitView={fitView}
        nodesConnectable={false}
        elementsSelectable
        minZoom={0.1}
        proOptions={{ hideAttribution: true }}
      >
        {showBackground && <Background />}
        {showControls && (
          <Controls>
            <ControlButton onClick={relayout} title="Auto layout" aria-label="Auto layout">
              <AutoLayoutIcon />
            </ControlButton>
          </Controls>
        )}
        {showMiniMap && <MiniMap pannable zoomable />}
      </ReactFlow>
    </div>
  );
});

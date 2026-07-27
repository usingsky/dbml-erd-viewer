import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
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
  type FitViewOptions,
  type ReactFlowInstance,
  type Rect as FlowRect,
  type SetCenterOptions,
  type Viewport,
  type ViewportHelperFunctionOptions,
} from '@xyflow/react';
import { parseDbml, DbmlParseError } from '../parser/parseDbml';
import {
  layoutSchema,
  tableHeight,
  tableWidth,
  type LayoutOptions,
  type NodeWidthBounds,
  type NodeBox,
} from '../layout/layout';
import { computeLayout, LayoutError } from '../layout/computeLayout';
import {
  renderDiagram,
  downloadDataUrl,
  expandBoundsWithEdges,
  ExportError,
  type DiagramExportOptions,
} from '../export';
import {
  TableNode,
  EdgeConnectionContext,
  type TableNodeType,
  type EdgeConnection,
} from './TableNode';
import { ErdEdge, FloatingEdge, type ErdEdgeData } from './ErdEdge';
import { useRelationHighlight } from './useRelationHighlight';
import { handleId } from './handles';
import { ColumnHoverContext } from './columnHoverContext';
import { themeToCssVars, type DbmlViewerTheme } from '../theme';
import type { ParsedSchema, RelationInfo, TableInfo } from '../types';

const NO_RELATIONS: RelationInfo[] = [];
/** Placeholder while an async parse is in flight, so the flow renders empty (not an error). */
const EMPTY_SCHEMA: ParsedSchema = { tables: [], relations: [] };

const nodeTypes = { table: TableNode };
const edgeTypes = { erd: ErdEdge, 'erd-floating': FloatingEdge };

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
  /**
   * DBML source text to render. Parsing pulls in `@dbml/core` (a large dependency, loaded on
   * demand). If you already have a parsed schema, prefer {@link DbmlViewerProps.schema} to
   * avoid bundling the parser. Provide exactly one of `dbml` / `schema`.
   */
  dbml?: string;
  /**
   * A pre-parsed schema (e.g. produced on the server or at build time with `parseDbml`). When
   * set, the viewer skips parsing entirely, so `@dbml/core` never enters your bundle. Memoize
   * it (stable reference) to avoid needless work. Provide exactly one of `dbml` / `schema`.
   */
  schema?: ParsedSchema;
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
  /**
   * How edges attach to tables. `'column'` (default) anchors each edge to its specific
   * FK/PK column rows. `'floating'` connects table-to-table, attaching wherever the two
   * tables face each other and following them as they move.
   */
  edgeConnection?: EdgeConnection;
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

  // --- Viewport control (delegates to the underlying xyflow instance) ---
  /** Fit the whole diagram into the viewport. */
  fitView(options?: FitViewOptions): void;
  /** Zoom in by one step. */
  zoomIn(options?: ViewportHelperFunctionOptions): void;
  /** Zoom out by one step. */
  zoomOut(options?: ViewportHelperFunctionOptions): void;
  /** Zoom to a specific level (e.g. `1` = 100%). */
  zoomTo(zoomLevel: number, options?: ViewportHelperFunctionOptions): void;
  /** Center the viewport on a flow-coordinate point. */
  setCenter(x: number, y: number, options?: SetCenterOptions): void;
  /** Fit a specific flow-coordinate rectangle into the viewport. */
  fitBounds(bounds: FlowRect, options?: ViewportHelperFunctionOptions): void;
  /** Set the viewport position and zoom directly. */
  setViewport(viewport: Viewport, options?: ViewportHelperFunctionOptions): void;
  /** Read the current viewport (`{ x, y, zoom }`); returns `undefined` before the diagram mounts. */
  getViewport(): Viewport | undefined;
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

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function rectsOverlap(a: Rect, b: Rect, margin: number): boolean {
  return (
    a.x < b.x + b.w + margin &&
    a.x + a.w + margin > b.x &&
    a.y < b.y + b.h + margin &&
    a.y + a.h + margin > b.y
  );
}

/**
 * When tables are added to an existing diagram, the freshly-computed layout box for a new
 * table is in a different coordinate space than the preserved (kept/dragged) tables, so it
 * can land on top of them. Keep its layout x (a relational hint) but push it down into free
 * space so it never overlaps a fixed table or another just-placed new one. Mutates `positions`.
 */
function placeAddedTables(
  schema: ParsedSchema,
  positions: Map<string, XYPosition>,
  isFixed: (id: string) => boolean,
  gap: number,
  widthBounds: NodeWidthBounds,
): void {
  const rectOf = (table: TableInfo, p: XYPosition): Rect => ({
    x: p.x,
    y: p.y,
    w: tableWidth(table, widthBounds),
    h: tableHeight(table),
  });
  const occupied: Rect[] = [];
  for (const table of schema.tables) {
    if (isFixed(table.id)) occupied.push(rectOf(table, positions.get(table.id)!));
  }
  for (const table of schema.tables) {
    if (isFixed(table.id)) continue;
    let pos = positions.get(table.id)!;
    let rect = rectOf(table, pos);
    let guard = 0;
    // Drop below the lowest table it currently collides with, repeat until clear.
    while (guard++ < 1000) {
      const hits = occupied.filter((o) => rectsOverlap(rect, o, gap));
      if (hits.length === 0) break;
      const bottom = Math.max(...hits.map((o) => o.y + o.h));
      pos = { x: pos.x, y: bottom + gap };
      rect = rectOf(table, pos);
    }
    positions.set(table.id, pos);
    occupied.push(rect);
  }
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

/** Map each table id to the set of its columns that an edge attaches to. */
function connectedColumnsByTable(schema: ParsedSchema): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  const add = (tableId: string, column: string | undefined) => {
    if (!column) return;
    let set = map.get(tableId);
    if (!set) {
      set = new Set<string>();
      map.set(tableId, set);
    }
    set.add(column);
  };
  for (const rel of schema.relations) {
    rel.from.columns.forEach((c) => add(rel.from.tableId, c));
    rel.to.columns.forEach((c) => add(rel.to.tableId, c));
  }
  return map;
}

function buildNodes(
  schema: ParsedSchema,
  positions: Map<string, XYPosition>,
  widthBounds: NodeWidthBounds,
  connectedColumns: Map<string, Set<string>>,
): TableNodeType[] {
  return schema.tables.map((table) => ({
    id: table.id,
    type: 'table',
    position: positions.get(table.id) ?? { x: 0, y: 0 },
    data: { table, widthBounds, connectedColumns: connectedColumns.get(table.id) },
  }));
}

/**
 * Pick the source/target column handles for a column-anchored edge. Attaches on each table's
 * inward-facing side so the edge runs between the facing edges and doesn't cross a node body;
 * a self-reference keeps both ends on the right so the loop bows outward.
 */
function columnHandles(
  rel: RelationInfo,
  positions: Map<string, XYPosition>,
): { sourceHandle: string; targetHandle: string } {
  const selfRef = rel.from.tableId === rel.to.tableId;
  const fromOnLeft = selfRef
    ? false
    : (positions.get(rel.from.tableId)?.x ?? 0) > (positions.get(rel.to.tableId)?.x ?? 0);
  const fromSide = fromOnLeft ? 'left' : 'right';
  const toSide = selfRef ? 'right' : fromOnLeft ? 'right' : 'left';
  return {
    sourceHandle: handleId(rel.from.columns[0] ?? '', fromSide, 'source'),
    targetHandle: handleId(rel.to.columns[0] ?? '', toSide, 'target'),
  };
}

function buildEdges(
  schema: ParsedSchema,
  positions: Map<string, XYPosition>,
  edgeConnection: EdgeConnection,
): Edge<ErdEdgeData>[] {
  const floating = edgeConnection === 'floating';
  return schema.relations.map((rel) => {
    // Floating edges compute their own attachment from node geometry, so they connect to the
    // table's single centre handle (no specific handle id) rather than a column row.
    const handles = floating
      ? { sourceHandle: undefined, targetHandle: undefined }
      : columnHandles(rel, positions);
    return {
      id: rel.id,
      source: rel.from.tableId,
      target: rel.to.tableId,
      ...handles,
      type: floating ? 'erd-floating' : 'erd',
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
    schema: schemaProp,
    className,
    style,
    theme,
    fitView = true,
    showControls = true,
    showMiniMap = false,
    showBackground = true,
    layoutOptions,
    edgeConnection = 'column',
    onParseError,
    onLayoutError,
    nodePositions,
    onNodePositionsChange,
  },
  ref,
) {
  // A pre-parsed `schema` prop renders synchronously (no parser). Otherwise `dbml` is parsed
  // asynchronously — `@dbml/core` is imported on demand — and the result is held in state.
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  useEffect(() => {
    if (schemaProp !== undefined || dbml === undefined) return;
    let cancelled = false;
    parseDbml(dbml).then(
      (s) => !cancelled && setParsed({ ok: true, schema: s }),
      (error) =>
        !cancelled &&
        setParsed({
          ok: false,
          error:
            error instanceof DbmlParseError
              ? error
              : new DbmlParseError(String(error), { cause: error }),
        }),
    );
    return () => {
      cancelled = true;
    };
  }, [dbml, schemaProp]);

  const result = useMemo<ParseResult>(() => {
    if (schemaProp !== undefined) return { ok: true, schema: schemaProp };
    return parsed ?? { ok: true, schema: EMPTY_SCHEMA };
  }, [schemaProp, parsed]);

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
      // Viewport control delegates to the live xyflow instance (no-ops before mount).
      fitView: (options) => flowRef.current?.fitView(options as FitViewOptions<TableNodeType>),
      zoomIn: (options) => flowRef.current?.zoomIn(options),
      zoomOut: (options) => flowRef.current?.zoomOut(options),
      zoomTo: (zoomLevel, options) => flowRef.current?.zoomTo(zoomLevel, options),
      setCenter: (x, y, options) => flowRef.current?.setCenter(x, y, options),
      fitBounds: (bounds, options) => flowRef.current?.fitBounds(bounds, options),
      setViewport: (viewport, options) => flowRef.current?.setViewport(viewport, options),
      getViewport: () => flowRef.current?.getViewport(),
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
    minNodeWidth,
    maxNodeWidth,
  } = layoutOptions ?? {};

  // Tracks the table-id set + layout options last used to position nodes, so we can skip
  // re-layout when only column-level details (or relations) change.
  const layoutStateRef = useRef<{ ids: string[]; optionsKey: string } | null>(null);

  const optionsKey = `${algorithm}|${direction}|${horizontalGap}|${verticalGap}|${minNodeWidth}|${maxNodeWidth}`;

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
      const widthBounds: NodeWidthBounds = { minWidth: minNodeWidth, maxWidth: maxNodeWidth };
      const positions = resolvePositions(schema, boxes, opts.saved, opts.prior);
      // Incremental update (existing tables preserved): drop newly-added tables into free
      // space so they don't overlap the kept ones. Skipped on a full layout (no `prior`).
      if (opts.prior) {
        const prior = opts.prior;
        const saved = opts.saved;
        placeAddedTables(
          schema,
          positions,
          (id) => prior.has(id) || saved?.[id] !== undefined,
          verticalGap ?? 40,
          widthBounds,
        );
      }
      setNodes(buildNodes(schema, positions, widthBounds, connectedColumnsByTable(schema)));
      setEdges(buildEdges(schema, positions, edgeConnection));
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
    [setNodes, setEdges, verticalGap, minNodeWidth, maxNodeWidth, edgeConnection],
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
    const opts: LayoutOptions = {
      algorithm,
      direction,
      horizontalGap,
      verticalGap,
      minNodeWidth,
      maxNodeWidth,
    };
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
    minNodeWidth,
    maxNodeWidth,
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
    const opts: LayoutOptions = {
      algorithm,
      direction,
      horizontalGap,
      verticalGap,
      minNodeWidth,
      maxNodeWidth,
    };
    const ids = schema.tables.map((t) => t.id);
    void computeLayoutOrFallback(schema, opts, (e) => onLayoutErrorRef.current?.(e)).then(
      (boxes) => {
        applyBoxes(schema, ids, optionsKey, boxes, { emit: true, fit: true });
      },
    );
  }, [
    result,
    algorithm,
    direction,
    horizontalGap,
    verticalGap,
    minNodeWidth,
    maxNodeWidth,
    optionsKey,
    applyBoxes,
  ]);

  const handleError = useCallback(() => {
    if (!result.ok) onParseError?.(result.error);
  }, [result, onParseError]);

  useEffect(handleError, [handleError]);

  // Relation hover: highlight the edge and its two connected columns.
  const relations = result.ok ? result.schema.relations : NO_RELATIONS;
  const { displayNodes, displayEdges, onEdgeMouseEnter, onEdgeMouseLeave, onColumnHover } =
    useRelationHighlight(relations, nodes, edges);

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
      <EdgeConnectionContext.Provider value={edgeConnection}>
        <ColumnHoverContext.Provider value={onColumnHover}>
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
        </ColumnHoverContext.Provider>
      </EdgeConnectionContext.Provider>
    </div>
  );
});

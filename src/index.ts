import '@xyflow/react/dist/style.css';
import './styles.css';

export { DbmlViewer } from './components/DbmlViewer';
export type {
  DbmlViewerProps,
  DbmlViewerHandle,
  NodePositions,
  XYPosition,
} from './components/DbmlViewer';

export { renderDiagram, downloadDataUrl, ExportError } from './export';
export type { DiagramExportOptions, ExportFormat } from './export';

// Re-exported so consumers can type their viewport-control calls (see DbmlViewerHandle).
export type {
  FitViewOptions,
  Rect,
  SetCenterOptions,
  Viewport,
  ViewportHelperFunctionOptions,
} from '@xyflow/react';

export { TableNode } from './components/TableNode';
export type { TableNodeData, TableNodeType } from './components/TableNode';

export { ErdEdge } from './components/ErdEdge';
export type { ErdEdgeData, EdgeEndSpec } from './components/ErdEdge';

export { parseDbml, DbmlParseError } from './parser/parseDbml';
export type { DbmlDiagnostic } from './parser/parseDbml';
export {
  layoutSchema,
  tableHeight,
  tableWidth,
  NODE_WIDTH,
  MIN_NODE_WIDTH,
  MAX_NODE_WIDTH,
  HEADER_HEIGHT,
  ROW_HEIGHT,
} from './layout/layout';
export type {
  LayoutOptions,
  LayoutAlgorithm,
  LayoutDirection,
  NodeBox,
  NodeWidthBounds,
} from './layout/layout';
export { computeLayout, LayoutError } from './layout/computeLayout';

export { themeToCssVars, lightTheme, darkTheme } from './theme';
export type { DbmlViewerTheme } from './theme';

export type {
  Cardinality,
  ColumnInfo,
  TableInfo,
  RelationEndpoint,
  RelationInfo,
  RelationKind,
  ParsedSchema,
} from './types';

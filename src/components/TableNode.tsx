import { createContext, memo, useContext } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { TableInfo } from '../types';
import { HEADER_HEIGHT, ROW_HEIGHT, tableWidth, type NodeWidthBounds } from '../layout/layout';
import { handleId } from './handles';
import { ColumnHoverContext } from './columnHoverContext';

/** How edges attach to tables. */
export type EdgeConnection = 'column' | 'floating';

/**
 * Edge attachment mode, provided by the viewer. `'column'` renders a connection handle per
 * relation-endpoint column; `'floating'` renders a single centre source/target pair and lets
 * {@link FloatingEdge} compute border attachment points from node geometry.
 */
export const EdgeConnectionContext = createContext<EdgeConnection>('column');

export type TableNodeData = {
  table: TableInfo;
  /** Columns currently highlighted (e.g. endpoints of a hovered relation). */
  highlightedColumns?: Set<string>;
  /** Min/max width bounds; must match what layout used so render and layout agree. */
  widthBounds?: NodeWidthBounds;
  /** Columns that an edge attaches to; only these get connection handles. */
  connectedColumns?: Set<string>;
};

export type TableNodeType = Node<TableNodeData, 'table'>;

/** Vertical center of a column row, relative to the top of the node. */
function rowCenter(index: number): number {
  return HEADER_HEIGHT + index * ROW_HEIGHT + ROW_HEIGHT / 2;
}

// Nudge source handles slightly above the row center and target handles below it, so a
// self-reference whose FK and referenced column are the SAME row still has two distinct
// connection points and renders a visible loop instead of a degenerate dot. The offset is
// tiny, so it's imperceptible on ordinary table-to-table edges.
const HANDLE_OFFSET = 4;

function ColumnHandles({ column, top }: { column: string; top: number }) {
  // Four hidden handles per column let predefined edges attach on whichever side
  // the layout puts the related table, in either direction.
  const sourceStyle = { top: top - HANDLE_OFFSET, opacity: 0 } as const;
  const targetStyle = { top: top + HANDLE_OFFSET, opacity: 0 } as const;
  return (
    <>
      <Handle
        id={handleId(column, 'left', 'target')}
        type="target"
        position={Position.Left}
        style={targetStyle}
        isConnectable={false}
      />
      <Handle
        id={handleId(column, 'left', 'source')}
        type="source"
        position={Position.Left}
        style={sourceStyle}
        isConnectable={false}
      />
      <Handle
        id={handleId(column, 'right', 'target')}
        type="target"
        position={Position.Right}
        style={targetStyle}
        isConnectable={false}
      />
      <Handle
        id={handleId(column, 'right', 'source')}
        type="source"
        position={Position.Right}
        style={sourceStyle}
        isConnectable={false}
      />
    </>
  );
}

function TableNodeComponent({ data }: NodeProps<TableNodeType>) {
  const { table, highlightedColumns, widthBounds, connectedColumns } = data;
  const onColumnHover = useContext(ColumnHoverContext);
  const edgeConnection = useContext(EdgeConnectionContext);
  const floating = edgeConnection === 'floating';
  return (
    <div className="dv-table" style={{ width: tableWidth(table, widthBounds) }}>
      {/* Floating edges attach to a single centre handle pair and compute their own
          geometry; column edges use the per-column handles rendered in each row. */}
      {floating && (
        <>
          <Handle
            type="source"
            position={Position.Right}
            style={{ opacity: 0 }}
            isConnectable={false}
          />
          <Handle
            type="target"
            position={Position.Left}
            style={{ opacity: 0 }}
            isConnectable={false}
          />
        </>
      )}
      <div
        className="dv-table__header"
        style={
          table.headerColor
            ? { background: table.headerColor, height: HEADER_HEIGHT }
            : { height: HEADER_HEIGHT }
        }
        title={table.note}
      >
        {table.schema && <span className="dv-table__schema">{table.schema}.</span>}
        <span className="dv-table__name" title={table.name}>
          {table.name}
        </span>
      </div>

      <div className="dv-table__body">
        {table.columns.map((col, i) => {
          const highlighted = highlightedColumns?.has(col.name);
          return (
            <div
              key={col.name}
              className={`dv-row${highlighted ? ' dv-row--highlighted' : ''}`}
              style={{ height: ROW_HEIGHT }}
              title={col.note}
              onMouseEnter={() => onColumnHover?.(table.id, col.name)}
              onMouseLeave={() => onColumnHover?.(table.id, null)}
            >
              <span className={`dv-row__name${col.pk ? ' dv-row__name--pk' : ''}`}>
                {col.pk && (
                  <span className="dv-badge dv-badge--pk" title="Primary key">
                    PK
                  </span>
                )}
                {col.isForeignKey && !col.pk && (
                  <span className="dv-badge dv-badge--fk" title="Foreign key">
                    FK
                  </span>
                )}
                <span className="dv-row__label" title={col.name}>
                  {col.name}
                </span>
              </span>
              <span className="dv-row__type">
                <span className="dv-row__typename" title={col.type}>
                  {col.type}
                </span>
                <span
                  className={`dv-row__null${col.notNull ? ' dv-row__null--notnull' : ''}`}
                  title={col.notNull ? 'Not null' : 'Nullable'}
                />
              </span>
              {!floating && connectedColumns?.has(col.name) && (
                <ColumnHandles column={col.name} top={rowCenter(i)} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const TableNode = memo(TableNodeComponent);

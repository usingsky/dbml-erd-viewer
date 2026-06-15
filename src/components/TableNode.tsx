import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { TableInfo } from '../types';
import { HEADER_HEIGHT, ROW_HEIGHT, tableWidth, type NodeWidthBounds } from '../layout/layout';
import { handleId } from './handles';

export type TableNodeData = {
  table: TableInfo;
  /** Columns currently highlighted (e.g. endpoints of a hovered relation). */
  highlightedColumns?: Set<string>;
  /** Min/max width bounds; must match what layout used so render and layout agree. */
  widthBounds?: NodeWidthBounds;
};

export type TableNodeType = Node<TableNodeData, 'table'>;

/** Vertical center of a column row, relative to the top of the node. */
function rowCenter(index: number): number {
  return HEADER_HEIGHT + index * ROW_HEIGHT + ROW_HEIGHT / 2;
}

function ColumnHandles({ column, top }: { column: string; top: number }) {
  // Four hidden handles per column let predefined edges attach on whichever side
  // the layout puts the related table, in either direction.
  const style = { top, opacity: 0 } as const;
  return (
    <>
      <Handle
        id={handleId(column, 'left', 'target')}
        type="target"
        position={Position.Left}
        style={style}
        isConnectable={false}
      />
      <Handle
        id={handleId(column, 'left', 'source')}
        type="source"
        position={Position.Left}
        style={style}
        isConnectable={false}
      />
      <Handle
        id={handleId(column, 'right', 'target')}
        type="target"
        position={Position.Right}
        style={style}
        isConnectable={false}
      />
      <Handle
        id={handleId(column, 'right', 'source')}
        type="source"
        position={Position.Right}
        style={style}
        isConnectable={false}
      />
    </>
  );
}

function TableNodeComponent({ data }: NodeProps<TableNodeType>) {
  const { table, highlightedColumns, widthBounds } = data;
  return (
    <div className="dv-table" style={{ width: tableWidth(table, widthBounds) }}>
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
              <ColumnHandles column={col.name} top={rowCenter(i)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const TableNode = memo(TableNodeComponent);

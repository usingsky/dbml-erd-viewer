import { createContext } from 'react';

/** Notified when a column row is hovered (`null` on leave) so related edges can highlight. */
export type ColumnHoverHandler = (tableId: string, column: string | null) => void;

/**
 * Carries the column-hover handler to {@link TableNode} via context rather than per-node
 * `data`. Keeping it out of node data means a drag (which churns the nodes array every
 * frame) doesn't change any node's `data` identity, so memoized nodes don't all re-render.
 */
export const ColumnHoverContext = createContext<ColumnHoverHandler | undefined>(undefined);

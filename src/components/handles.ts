/** Which edge of the node a handle sits on. */
export type Side = 'left' | 'right';

/**
 * Build the id for a per-column connection handle. Node and edge construction must
 * agree on this scheme, so it lives in one place.
 */
export function handleId(column: string, side: Side, type: 'source' | 'target'): string {
  return `${column}__${side}__${type}`;
}

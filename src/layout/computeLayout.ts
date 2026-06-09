import type { ParsedSchema } from '../types';
import { layoutSchema, type LayoutOptions, type NodeBox } from './layout';
import { dagreLayout } from './dagre';
import { elkLayout } from './elk';

/** Thrown when a non-default layout algorithm fails (often a missing optional dependency). */
export class LayoutError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'LayoutError';
  }
}

/**
 * Compute node positions using the requested algorithm. Always async so the three
 * strategies share one interface (`'simple'` resolves synchronously under the hood).
 *
 * @throws {LayoutError} when `'dagre'`/`'elk'` fails — typically because the optional
 *   dependency (`@dagrejs/dagre` / `elkjs`) is not installed.
 */
export async function computeLayout(
  schema: ParsedSchema,
  options: LayoutOptions = {},
): Promise<Map<string, NodeBox>> {
  const algorithm = options.algorithm ?? 'simple';
  if (algorithm === 'simple') return layoutSchema(schema, options);

  try {
    return algorithm === 'dagre'
      ? await dagreLayout(schema, options)
      : await elkLayout(schema, options);
  } catch (err) {
    const dep = algorithm === 'dagre' ? '@dagrejs/dagre' : 'elkjs';
    const detail = err instanceof Error ? err.message : String(err);
    throw new LayoutError(
      `"${algorithm}" layout failed. Is the optional dependency "${dep}" installed? (${detail})`,
      { cause: err },
    );
  }
}

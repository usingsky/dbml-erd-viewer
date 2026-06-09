import type { Rect } from '@xyflow/react';

/** Image format for diagram export. */
export type ExportFormat = 'png' | 'svg';

export interface DiagramExportOptions {
  /** Output format. Default `'png'`. */
  type?: ExportFormat;
  /** Padding (px) around the diagram bounds. Default `24`. */
  padding?: number;
  /** Background color. Defaults to the viewer's current canvas color. */
  backgroundColor?: string;
  /** Device pixel ratio for PNG (higher = sharper). Default `2`. */
  pixelRatio?: number;
}

// The viewer's CSS custom properties live on the `.dv-viewer` wrapper. html-to-image
// clones the inner viewport detached from that wrapper, so var() references would resolve
// to nothing — we copy these onto the capture root first.
const DV_VARS = [
  '--dv-canvas',
  '--dv-bg',
  '--dv-border',
  '--dv-header-bg',
  '--dv-header-fg',
  '--dv-row-fg',
  '--dv-type-fg',
  '--dv-row-hover',
  '--dv-row-highlight',
  '--dv-pk',
  '--dv-fk',
  '--dv-null',
  '--dv-edge',
  '--dv-edge-active',
  '--dv-font',
];

/** Thrown when export fails — typically the optional `html-to-image` dependency is missing. */
export class ExportError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ExportError';
  }
}

/**
 * Expand a node bounding box to also cover the rendered edges and their crow's-foot
 * markers, which `getNodesBounds` ignores. Without this, an edge that routes past the
 * outermost node would eat into (or overflow) the export padding. Edge `<g>` elements live
 * in per-edge `<svg>`s positioned at the flow origin, so `getBBox()` yields flow coordinates
 * — the same space as `bounds`.
 */
export function expandBoundsWithEdges(bounds: Rect, viewport: HTMLElement): Rect {
  let minX = bounds.x;
  let minY = bounds.y;
  let maxX = bounds.x + bounds.width;
  let maxY = bounds.y + bounds.height;
  for (const edge of viewport.querySelectorAll<SVGGraphicsElement>('.dv-erd-edge')) {
    let box: DOMRect;
    try {
      box = edge.getBBox();
    } catch {
      continue;
    }
    if (box.width === 0 && box.height === 0) continue;
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Render the React Flow viewport element to an image data URL, framing the full
 * diagram (all nodes) at 100% scale. Requires the optional `html-to-image` dependency.
 *
 * @throws {ExportError} when `html-to-image` is unavailable or rendering fails.
 */
export async function renderDiagram(
  viewport: HTMLElement,
  bounds: Rect,
  options: DiagramExportOptions = {},
): Promise<string> {
  const { type = 'png', padding = 24, backgroundColor, pixelRatio = 2 } = options;

  let htmlToImage: typeof import('html-to-image');
  try {
    htmlToImage = await import('html-to-image');
  } catch (err) {
    throw new ExportError(
      'Export requires the optional dependency "html-to-image". Install it to enable PNG/SVG export.',
      { cause: err },
    );
  }

  // Wait for any custom/web fonts to finish loading, otherwise the image captures a
  // fallback font. No-op when there are no pending fonts.
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // ignore — proceed with whatever fonts are available
    }
  }

  const width = Math.ceil(bounds.width + padding * 2);
  const height = Math.ceil(bounds.height + padding * 2);
  // Translate so the top-left of the node bounds sits at (padding, padding), scale 1.
  const transform = `translate(${-bounds.x + padding}px, ${-bounds.y + padding}px) scale(1)`;
  const config = {
    width,
    height,
    backgroundColor,
    style: { width: `${width}px`, height: `${height}px`, transform },
  };

  // Make the capture self-contained: resolve theme variables onto the root, and grow
  // each edge's small <svg> so its overflowing path isn't clipped during rasterization.
  const restore = prepareForCapture(viewport, bounds, padding);
  try {
    return type === 'svg'
      ? await htmlToImage.toSvg(viewport, config)
      : await htmlToImage.toPng(viewport, { ...config, pixelRatio });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new ExportError(`Failed to render diagram image: ${detail}`, { cause: err });
  } finally {
    restore();
  }
}

/**
 * Prepare the viewport for a self-contained capture and return a restore fn:
 * - copy the resolved `--dv-*` theme variables from the `.dv-viewer` wrapper onto the
 *   capture root, so var() references still resolve once the clone is detached;
 * - grow each per-edge `<svg>` to span the diagram so its overflowing path isn't clipped.
 */
function prepareForCapture(viewport: HTMLElement, bounds: Rect, padding: number): () => void {
  const undo: Array<() => void> = [];

  const wrapper = viewport.closest<HTMLElement>('.dv-viewer');
  if (wrapper) {
    const computed = getComputedStyle(wrapper);
    for (const name of DV_VARS) {
      const value = computed.getPropertyValue(name);
      if (!value) continue;
      const prev = viewport.style.getPropertyValue(name);
      viewport.style.setProperty(name, value);
      undo.push(() => {
        if (prev) viewport.style.setProperty(name, prev);
        else viewport.style.removeProperty(name);
      });
    }
  }

  const extentW = `${Math.ceil(bounds.x + bounds.width + padding)}px`;
  const extentH = `${Math.ceil(bounds.y + bounds.height + padding)}px`;
  for (const svg of viewport.querySelectorAll<SVGElement>('.react-flow__edges svg')) {
    const { width, height } = svg.style;
    svg.style.width = extentW;
    svg.style.height = extentH;
    undo.push(() => {
      svg.style.width = width;
      svg.style.height = height;
    });
  }

  return () => undo.forEach((fn) => fn());
}

/** Trigger a browser download of a data URL. */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

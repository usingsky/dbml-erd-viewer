import type { CSSProperties } from 'react';

/**
 * Theme tokens for {@link DbmlViewer}. Every field maps to a `--dv-*` CSS custom
 * property scoped to the viewer, so a partial theme overrides only the keys you set.
 * For finer control, target the `.dv-*` classes in your own stylesheet.
 */
export interface DbmlViewerTheme {
  /** Diagram canvas (pane) background. → `--dv-canvas` */
  canvas?: string;
  /** Table body background. → `--dv-bg` */
  background?: string;
  /** Table and row borders. → `--dv-border` */
  border?: string;
  /** Table header background. → `--dv-header-bg` */
  headerBackground?: string;
  /** Table header text color. → `--dv-header-fg` */
  headerForeground?: string;
  /** Column name text color. → `--dv-row-fg` */
  rowForeground?: string;
  /** Column type text color. → `--dv-type-fg` */
  typeForeground?: string;
  /** Row background on hover. → `--dv-row-hover` */
  rowHover?: string;
  /** Row background when highlighted by a hovered relation. → `--dv-row-highlight` */
  rowHighlight?: string;
  /** Primary-key badge color. → `--dv-pk` */
  primaryKey?: string;
  /** Foreign-key badge color. → `--dv-fk` */
  foreignKey?: string;
  /** Relation edge color. → `--dv-edge` */
  edge?: string;
  /** Relation edge color when hovered/selected. → `--dv-edge-active` */
  edgeActive?: string;
  /** Font family for table contents. → `--dv-font` */
  fontFamily?: string;
}

const TOKEN_TO_VAR: Record<keyof DbmlViewerTheme, string> = {
  canvas: '--dv-canvas',
  background: '--dv-bg',
  border: '--dv-border',
  headerBackground: '--dv-header-bg',
  headerForeground: '--dv-header-fg',
  rowForeground: '--dv-row-fg',
  typeForeground: '--dv-type-fg',
  rowHover: '--dv-row-hover',
  rowHighlight: '--dv-row-highlight',
  primaryKey: '--dv-pk',
  foreignKey: '--dv-fk',
  edge: '--dv-edge',
  edgeActive: '--dv-edge-active',
  fontFamily: '--dv-font',
};

/**
 * Light theme — matches the built-in stylesheet defaults. Useful as a base to spread
 * and tweak: `{ ...lightTheme, headerBackground: '#1e3a8a' }`.
 */
export const lightTheme: DbmlViewerTheme = {
  canvas: '#fafbfc',
  background: '#ffffff',
  border: '#d9dee5',
  headerBackground: '#2d3748',
  headerForeground: '#ffffff',
  rowForeground: '#1a202c',
  typeForeground: '#718096',
  rowHover: '#f1f5f9',
  rowHighlight: '#dbeafe',
  primaryKey: '#b7791f',
  foreignKey: '#2b6cb0',
  edge: '#94a3b8',
  edgeActive: '#2b6cb0',
};

/** Dark theme preset (neutral slate palette). Pass directly: `<DbmlViewer theme={darkTheme} />`. */
export const darkTheme: DbmlViewerTheme = {
  canvas: '#0f172a',
  background: '#1e293b',
  border: '#334155',
  headerBackground: '#334155',
  headerForeground: '#f1f5f9',
  rowForeground: '#e2e8f0',
  typeForeground: '#94a3b8',
  rowHover: '#334155',
  rowHighlight: '#1e3a5f',
  primaryKey: '#d69e2e',
  foreignKey: '#4299e1',
  edge: '#64748b',
  edgeActive: '#60a5fa',
};

/**
 * Convert a {@link DbmlViewerTheme} into inline CSS custom properties. Only the keys
 * present in `theme` are emitted, so unset tokens keep their stylesheet defaults.
 */
export function themeToCssVars(theme?: DbmlViewerTheme): CSSProperties {
  if (!theme) return {};
  const vars: Record<string, string> = {};
  for (const key of Object.keys(theme) as (keyof DbmlViewerTheme)[]) {
    const value = theme[key];
    if (value != null) vars[TOKEN_TO_VAR[key]] = value;
  }
  return vars as CSSProperties;
}

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DbmlViewer,
  darkTheme,
  lightTheme,
  type DbmlViewerHandle,
  type DbmlViewerTheme,
  type LayoutAlgorithm,
  type LayoutDirection,
  type NodePositions,
} from '../src';
import { SCHEMA_PRESETS } from './schemas';
import './playground.css';

const POSITIONS_KEY = 'dbml-erd-viewer:positions';
const loadPositions = (): NodePositions => {
  try {
    return JSON.parse(localStorage.getItem(POSITIONS_KEY) ?? '{}');
  } catch {
    return {};
  }
};

type ThemePreset = 'none' | 'light' | 'dark';
type ColorKey = 'headerBackground' | 'edge' | 'primaryKey' | 'foreignKey';
type ColorState = Record<ColorKey, { on: boolean; value: string }>;

const COLOR_FIELDS: { key: ColorKey; label: string }[] = [
  { key: 'headerBackground', label: 'Header' },
  { key: 'edge', label: 'Edge' },
  { key: 'primaryKey', label: 'PK badge' },
  { key: 'foreignKey', label: 'FK badge' },
];

const DEFAULT_COLORS: ColorState = {
  headerBackground: { on: false, value: '#2d3748' },
  edge: { on: false, value: '#94a3b8' },
  primaryKey: { on: false, value: '#b7791f' },
  foreignKey: { on: false, value: '#2b6cb0' },
};

export function Playground() {
  const [dbml, setDbml] = useState(SCHEMA_PRESETS[0].dbml);
  const [algorithm, setAlgorithm] = useState<LayoutAlgorithm>('simple');
  const [direction, setDirection] = useState<LayoutDirection>('LR');
  const [horizontalGap, setHorizontalGap] = useState(120);
  const [verticalGap, setVerticalGap] = useState(40);
  const [minNodeWidth, setMinNodeWidth] = useState(160);
  const [maxNodeWidth, setMaxNodeWidth] = useState(320);

  const [fitView, setFitView] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [showMiniMap, setShowMiniMap] = useState(false);
  const [showBackground, setShowBackground] = useState(true);

  const [themePreset, setThemePreset] = useState<ThemePreset>('none');
  const [colors, setColors] = useState<ColorState>(DEFAULT_COLORS);
  const [fontFamily, setFontFamily] = useState('');

  const [persist, setPersist] = useState(false);
  const [positions, setPositions] = useState<NodePositions>(loadPositions);

  const [parseError, setParseError] = useState<string | null>(null);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const viewerRef = useRef<DbmlViewerHandle>(null);

  // Build the theme object from the preset + enabled color overrides.
  const theme = useMemo<DbmlViewerTheme | undefined>(() => {
    const base =
      themePreset === 'light' ? lightTheme : themePreset === 'dark' ? darkTheme : undefined;
    const overrides: DbmlViewerTheme = {};
    for (const { key } of COLOR_FIELDS) {
      if (colors[key].on) overrides[key] = colors[key].value;
    }
    if (fontFamily.trim()) overrides.fontFamily = fontFamily.trim();
    if (!base && Object.keys(overrides).length === 0) return undefined;
    return { ...base, ...overrides };
  }, [themePreset, colors, fontFamily]);

  const layoutOptions = useMemo(
    () => ({ algorithm, direction, horizontalGap, verticalGap, minNodeWidth, maxNodeWidth }),
    [algorithm, direction, horizontalGap, verticalGap, minNodeWidth, maxNodeWidth],
  );

  const savePositions = (next: NodePositions) => {
    setPositions(next);
    localStorage.setItem(POSITIONS_KEY, JSON.stringify(next));
  };
  const resetPositions = () => {
    localStorage.removeItem(POSITIONS_KEY);
    setPositions({});
  };

  const setColor = (key: ColorKey, patch: Partial<{ on: boolean; value: string }>) =>
    setColors((c) => ({ ...c, [key]: { ...c[key], ...patch } }));

  const copySnippet = () => {
    void navigator.clipboard?.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const snippet = useMemo(
    () =>
      buildSnippet({
        layoutOptions,
        theme,
        fitView,
        showControls,
        showMiniMap,
        showBackground,
        persist,
      }),
    [layoutOptions, theme, fitView, showControls, showMiniMap, showBackground, persist],
  );

  // Clear stale error messages when the inputs that could fix them change.
  useEffect(() => setParseError(null), [dbml]);
  useEffect(() => setLayoutError(null), [layoutOptions]);

  // Expose the handle for automated checks.
  useEffect(() => {
    (window as unknown as { __viewer?: DbmlViewerHandle | null }).__viewer = viewerRef.current;
  });

  return (
    <div className="pg">
      <aside className="pg__panel">
        <div className="pg__header">
          <div className="pg__brand">
            <h1 className="pg__title">dbml-erd-viewer</h1>
            <a
              className="pg__brand-gh"
              href="https://github.com/usingsky/dbml-erd-viewer#readme"
              target="_blank"
              rel="noreferrer"
              aria-label="View the README on GitHub"
              title="View the README on GitHub"
            >
              <svg
                height="32"
                aria-hidden="true"
                data-component="Octicon"
                viewBox="0 0 24 24"
                version="1.1"
                width="32"
                data-view-component="true"
              >
                <path d="M10.226 17.284c-2.965-.36-5.054-2.493-5.054-5.256 0-1.123.404-2.336 1.078-3.144-.292-.741-.247-2.314.09-2.965.898-.112 2.111.36 2.83 1.01.853-.269 1.752-.404 2.853-.404 1.1 0 1.999.135 2.807.382.696-.629 1.932-1.1 2.83-.988.315.606.36 2.179.067 2.942.72.854 1.101 2 1.101 3.167 0 2.763-2.089 4.852-5.098 5.234.763.494 1.28 1.572 1.28 2.807v2.336c0 .674.561 1.056 1.235.786 4.066-1.55 7.255-5.615 7.255-10.646C23.5 6.188 18.334 1 11.978 1 5.62 1 .5 6.188.5 12.545c0 4.986 3.167 9.12 7.435 10.669.606.225 1.19-.18 1.19-.786V20.63a2.9 2.9 0 0 1-1.078.224c-1.483 0-2.359-.808-2.987-2.313-.247-.607-.517-.966-1.034-1.033-.27-.023-.359-.135-.359-.27 0-.27.45-.471.898-.471.652 0 1.213.404 1.797 1.235.45.651.921.943 1.483.943.561 0 .92-.202 1.437-.719.382-.381.674-.718.944-.943"></path>
              </svg>
            </a>
          </div>
          <p className="pg__subtitle">
            Interactive playground — tweak any prop and watch the diagram update.
          </p>
          <div className="pg__links">
            <a href="https://github.com/usingsky/dbml-erd-viewer" target="_blank" rel="noreferrer">
              GitHub
            </a>
            <a
              href="https://www.npmjs.com/package/dbml-erd-viewer"
              target="_blank"
              rel="noreferrer"
            >
              npm
            </a>
          </div>
        </div>

        <section className="pg__section">
          <h2>Source</h2>
          <div className="pg__row">
            <label>Example</label>
            <select
              onChange={(e) => {
                const preset = SCHEMA_PRESETS.find((p) => p.id === e.target.value);
                if (preset) setDbml(preset.dbml);
              }}
              defaultValue={SCHEMA_PRESETS[0].id}
            >
              {SCHEMA_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <textarea
            className="pg__textarea"
            value={dbml}
            spellCheck={false}
            onChange={(e) => setDbml(e.target.value)}
          />
          {parseError && <ErrorText text={parseError} />}
        </section>

        <section className="pg__section">
          <h2>Layout</h2>
          <div className="pg__row">
            <label>Algorithm</label>
            <select
              data-testid="algorithm"
              value={algorithm}
              onChange={(e) => setAlgorithm(e.target.value as LayoutAlgorithm)}
            >
              <option value="simple">simple</option>
              <option value="dagre">dagre</option>
              <option value="elk">elk</option>
            </select>
          </div>
          <div className="pg__row">
            <label>Direction</label>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as LayoutDirection)}
            >
              <option value="LR">LR (left→right)</option>
              <option value="TB">TB (top→bottom)</option>
            </select>
          </div>
          <div className="pg__row">
            <label>Horizontal gap: {horizontalGap}</label>
            <input
              type="range"
              min={40}
              max={320}
              step={10}
              value={horizontalGap}
              onChange={(e) => setHorizontalGap(Number(e.target.value))}
            />
          </div>
          <div className="pg__row">
            <label>Vertical gap: {verticalGap}</label>
            <input
              type="range"
              min={10}
              max={200}
              step={10}
              value={verticalGap}
              onChange={(e) => setVerticalGap(Number(e.target.value))}
            />
          </div>
          <div className="pg__row">
            <label>Min node width: {minNodeWidth}</label>
            <input
              type="range"
              min={80}
              max={320}
              step={10}
              value={minNodeWidth}
              onChange={(e) => setMinNodeWidth(Number(e.target.value))}
            />
          </div>
          <div className="pg__row">
            <label>Max node width: {maxNodeWidth}</label>
            <input
              type="range"
              min={160}
              max={600}
              step={10}
              value={maxNodeWidth}
              onChange={(e) => setMaxNodeWidth(Number(e.target.value))}
            />
          </div>
          {layoutError && <ErrorText text={layoutError} />}
        </section>

        <section className="pg__section">
          <h2>Display</h2>
          <div className="pg__checks">
            <Check label="fitView" checked={fitView} onChange={setFitView} />
            <Check label="showControls" checked={showControls} onChange={setShowControls} />
            <Check label="showMiniMap" checked={showMiniMap} onChange={setShowMiniMap} />
            <Check label="showBackground" checked={showBackground} onChange={setShowBackground} />
          </div>
        </section>

        <section className="pg__section">
          <h2>Theme</h2>
          <div className="pg__row">
            <label>Preset</label>
            <select
              value={themePreset}
              onChange={(e) => setThemePreset(e.target.value as ThemePreset)}
            >
              <option value="none">none (default)</option>
              <option value="light">lightTheme</option>
              <option value="dark">darkTheme</option>
            </select>
          </div>
          {COLOR_FIELDS.map(({ key, label }) => (
            <div className="pg__row" key={key}>
              <label className="pg__color">
                <input
                  type="checkbox"
                  checked={colors[key].on}
                  onChange={(e) => setColor(key, { on: e.target.checked })}
                />
                {label}
              </label>
              <input
                type="color"
                value={colors[key].value}
                onChange={(e) => setColor(key, { value: e.target.value, on: true })}
              />
            </div>
          ))}
          <div className="pg__row">
            <label>Font family</label>
            <input
              type="text"
              placeholder="e.g. Inter, sans-serif"
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
            />
          </div>
        </section>

        <section className="pg__section">
          <h2>Actions</h2>
          <div className="pg__btns">
            <button
              type="button"
              className="pg__btn pg__btn--primary"
              onClick={() => viewerRef.current?.download('erd.png', { type: 'png' })}
            >
              Export PNG
            </button>
            <button
              type="button"
              className="pg__btn"
              onClick={() => viewerRef.current?.download('erd.svg', { type: 'svg' })}
            >
              Export SVG
            </button>
            <button
              type="button"
              className="pg__btn"
              data-testid="reset-positions"
              onClick={resetPositions}
            >
              Reset layout
            </button>
            <Check label="persist positions" checked={persist} onChange={setPersist} inline />
          </div>
          {persist && (
            <div className="pg__positions">
              <div className="pg__positions-head">
                nodePositions ({Object.keys(positions).length})
              </div>
              {Object.keys(positions).length === 0 ? (
                <p className="pg__positions-empty">Drag a table to record its position.</p>
              ) : (
                <pre className="pg__snippet">
                  {Object.entries(positions)
                    .map(([id, p]) => `${id}: { x: ${Math.round(p.x)}, y: ${Math.round(p.y)} }`)
                    .join('\n')}
                </pre>
              )}
            </div>
          )}
        </section>

        <section className="pg__section">
          <h2>
            Usage
            <button type="button" className="pg__copy" onClick={copySnippet}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </h2>
          <pre className="pg__snippet">{snippet}</pre>
        </section>
      </aside>

      <main className="pg__viewer">
        <DbmlViewer
          ref={viewerRef}
          dbml={dbml}
          layoutOptions={layoutOptions}
          theme={theme}
          fitView={fitView}
          showControls={showControls}
          showMiniMap={showMiniMap}
          showBackground={showBackground}
          nodePositions={persist ? positions : undefined}
          onNodePositionsChange={persist ? savePositions : undefined}
          onParseError={(e) => setParseError(e.message)}
          onLayoutError={(e) => setLayoutError(e.message)}
        />
      </main>
    </div>
  );
}

function Check({
  label,
  checked,
  onChange,
  inline,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  inline?: boolean;
}) {
  return (
    <label
      style={inline ? { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 } : undefined}
    >
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function ErrorText({ text }: { text: string }) {
  return <pre className="pg__error">{text}</pre>;
}

function buildSnippet(opts: {
  layoutOptions: {
    algorithm: string;
    direction: string;
    horizontalGap: number;
    verticalGap: number;
    minNodeWidth: number;
    maxNodeWidth: number;
  };
  theme?: DbmlViewerTheme;
  fitView: boolean;
  showControls: boolean;
  showMiniMap: boolean;
  showBackground: boolean;
  persist: boolean;
}): string {
  const lines = ['<DbmlViewer', '  dbml={dbml}'];
  const lo = opts.layoutOptions;
  const loParts = [`algorithm: '${lo.algorithm}'`, `direction: '${lo.direction}'`];
  if (lo.horizontalGap !== 120) loParts.push(`horizontalGap: ${lo.horizontalGap}`);
  if (lo.verticalGap !== 40) loParts.push(`verticalGap: ${lo.verticalGap}`);
  if (lo.minNodeWidth !== 160) loParts.push(`minNodeWidth: ${lo.minNodeWidth}`);
  if (lo.maxNodeWidth !== 320) loParts.push(`maxNodeWidth: ${lo.maxNodeWidth}`);
  lines.push(`  layoutOptions={{ ${loParts.join(', ')} }}`);

  if (opts.theme) {
    const entries = Object.entries(opts.theme).map(([k, v]) => `${k}: '${v}'`);
    lines.push(`  theme={{ ${entries.join(', ')} }}`);
  }
  if (!opts.fitView) lines.push('  fitView={false}');
  if (!opts.showControls) lines.push('  showControls={false}');
  if (opts.showMiniMap) lines.push('  showMiniMap');
  if (!opts.showBackground) lines.push('  showBackground={false}');
  if (opts.persist) {
    lines.push('  nodePositions={positions}');
    lines.push('  onNodePositionsChange={setPositions}');
  }
  lines.push('/>');
  return lines.join('\n');
}

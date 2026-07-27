import type { Cardinality, ColumnInfo, ParsedSchema, RelationInfo, TableInfo } from '../types';

/** A relation endpoint with its table id resolved, before classification. */
interface ResolvedEndpoint {
  tableId: string;
  columns: string[];
  relation: Cardinality;
}

type ParserCtor = new () => DbmlParser;

interface DbmlParser {
  parse(input: string, format: string): DbmlDatabase;
}

/**
 * Resolve the `Parser` constructor from `@dbml/core`, imported dynamically so the (very large,
 * ~2.6 MB gzip) parser is code-split into its own chunk instead of the consumer's main bundle —
 * and only loaded when DBML text actually needs parsing. `@dbml/core` is CommonJS, so `Parser`
 * may sit on the namespace or the default export depending on the bundler; try both.
 */
async function loadParser(): Promise<ParserCtor> {
  const dbmlCore = (await import('@dbml/core')) as unknown as {
    Parser?: ParserCtor;
    default?: { Parser?: ParserCtor };
  };
  const resolved = dbmlCore.Parser ?? dbmlCore.default?.Parser;
  if (!resolved) throw new Error('Could not resolve `Parser` export from @dbml/core.');
  return resolved;
}

interface DbmlDatabase {
  schemas: DbmlSchema[];
}

interface DbmlSchema {
  name: string;
  tables: DbmlTable[];
  refs: DbmlRef[];
}

interface DbmlIndexColumn {
  type?: string;
  value?: string;
}

interface DbmlIndex {
  pk?: boolean;
  columns?: DbmlIndexColumn[];
}

interface DbmlTable {
  name: string;
  note?: { value?: string } | string | null;
  headerColor?: string | null;
  fields: DbmlField[];
  indexes?: DbmlIndex[];
}

interface DbmlField {
  name: string;
  type?: { type_name?: string } | null;
  pk?: boolean;
  not_null?: boolean;
  unique?: boolean;
  increment?: boolean;
  dbdefault?: { value?: string | number | boolean } | null;
  note?: { value?: string } | string | null;
}

interface DbmlEndpoint {
  schemaName?: string | null;
  tableName: string;
  fieldNames: string[];
  relation: Cardinality;
}

interface DbmlRef {
  endpoints: DbmlEndpoint[];
}

const DEFAULT_SCHEMA = 'public';

/** A single parse diagnostic (one syntax/semantic problem found in the DBML). */
export interface DbmlDiagnostic {
  /** Human-readable description of the problem. */
  message: string;
  /** 1-based line number, when the parser reported a location. */
  line?: number;
  /** 1-based column number, when the parser reported a location. */
  column?: number;
  /** Parser error code, when available. */
  code?: string | number;
}

/**
 * Thrown when DBML text cannot be parsed. `diagnostics` holds the structured problems
 * (line/column/message) and the original parser error is attached as `cause`.
 */
export class DbmlParseError extends Error {
  readonly diagnostics: DbmlDiagnostic[];

  constructor(message: string, options?: { cause?: unknown; diagnostics?: DbmlDiagnostic[] }) {
    super(message, options);
    this.name = 'DbmlParseError';
    this.diagnostics = options?.diagnostics ?? [];
  }
}

// `@dbml/core` throws a `CompilerError` (not an `Error`) carrying a `diags` array.
interface DbmlCompilerDiag {
  message?: string;
  code?: string | number;
  location?: { start?: { line?: number; column?: number } } | null;
}

/** Pull structured diagnostics out of whatever the parser threw. */
function extractDiagnostics(err: unknown): DbmlDiagnostic[] {
  const diags = (err as { diags?: unknown })?.diags;
  if (!Array.isArray(diags)) return [];
  return (diags as DbmlCompilerDiag[]).map((d) => ({
    message: d.message ?? 'Unknown error',
    line: d.location?.start?.line,
    column: d.location?.start?.column,
    code: d.code,
  }));
}

/** Build a readable multi-line message from diagnostics. */
function formatParseError(diagnostics: DbmlDiagnostic[], fallback: string): string {
  if (diagnostics.length === 0) return `Failed to parse DBML: ${fallback}`;
  const lines = diagnostics.map((d) => {
    const where =
      d.line != null ? `Line ${d.line}${d.column != null ? `:${d.column}` : ''} — ` : '';
    return `  • ${where}${d.message}`;
  });
  const heading =
    diagnostics.length === 1
      ? 'Failed to parse DBML:'
      : `Failed to parse DBML (${diagnostics.length} errors):`;
  return `${heading}\n${lines.join('\n')}`;
}

function noteText(note: DbmlField['note']): string | undefined {
  if (!note) return undefined;
  if (typeof note === 'string') return note;
  return note.value ?? undefined;
}

function tableId(schemaName: string | null | undefined, tableName: string): string {
  return schemaName && schemaName !== DEFAULT_SCHEMA ? `${schemaName}.${tableName}` : tableName;
}

/**
 * Names of every primary-key column in a table. A single-column pk is flagged on the
 * field; a composite pk is promoted by @dbml/core to a `[pk]` index instead.
 */
function primaryKeyColumns(table: DbmlTable): Set<string> {
  const pk = new Set<string>();
  for (const field of table.fields) {
    if (field.pk) pk.add(field.name);
  }
  for (const index of table.indexes ?? []) {
    if (!index.pk) continue;
    for (const col of index.columns ?? []) {
      if (col.type === 'column' && col.value) pk.add(col.value);
    }
  }
  return pk;
}

/**
 * Parse a DBML document into a normalized {@link ParsedSchema} of tables and relations.
 *
 * Async because `@dbml/core` is imported on demand (see {@link loadParser}). If you already
 * have a parsed schema (e.g. parsed on the server), pass it to `<DbmlViewer schema={...} />`
 * instead to avoid bundling the parser at all.
 *
 * @param dbml - DBML source text.
 * @throws {DbmlParseError} when the input is not valid DBML.
 */
export async function parseDbml(dbml: string): Promise<ParsedSchema> {
  let database: DbmlDatabase;
  try {
    const Parser = await loadParser();
    database = new Parser().parse(dbml, 'dbmlv2');
  } catch (err) {
    const diagnostics = extractDiagnostics(err);
    const fallback = err instanceof Error ? err.message : String(err);
    throw new DbmlParseError(formatParseError(diagnostics, fallback), { cause: err, diagnostics });
  }

  // Pass 1: index every column's pk/nullability/note so relations can be classified.
  interface ColumnMeta {
    pk: boolean;
    notNull: boolean;
    note?: string;
  }
  const columnIndex = new Map<string, Map<string, ColumnMeta>>();
  for (const schema of database.schemas) {
    for (const table of schema.tables) {
      const id = tableId(schema.name, table.name);
      const pkCols = primaryKeyColumns(table);
      const cols = new Map<string, ColumnMeta>();
      for (const field of table.fields) {
        const pk = pkCols.has(field.name);
        cols.set(field.name, {
          pk,
          notNull: pk || Boolean(field.not_null),
          note: noteText(field.note),
        });
      }
      columnIndex.set(id, cols);
    }
  }

  /** True when every listed column is part of the table's primary key. */
  const allPk = (ep: ResolvedEndpoint): boolean => {
    const cols = columnIndex.get(ep.tableId);
    if (!cols || ep.columns.length === 0) return false;
    return ep.columns.every((c) => cols.get(c)?.pk === true);
  };

  /** True when any listed column may be null (not `not null` and not a pk). */
  const anyNullable = (ep: ResolvedEndpoint): boolean =>
    ep.columns.some((c) => {
      const meta = columnIndex.get(ep.tableId)?.get(c);
      return meta ? !meta.notNull && !meta.pk : true;
    });

  /** Opt-in convention: a column note containing "optional" marks that side as optional. */
  const noteSaysOptional = (ep: ResolvedEndpoint): boolean =>
    ep.columns.some(
      (c) => columnIndex.get(ep.tableId)?.get(c)?.note?.toLowerCase().includes('optional') ?? false,
    );

  // Pass 2: classify relations and record which columns are foreign keys.
  const relations: RelationInfo[] = [];
  const fkColumns = new Set<string>();

  for (const schema of database.schemas) {
    for (const ref of schema.refs) {
      if (ref.endpoints.length !== 2) continue;
      const [epA, epB] = ref.endpoints.map(
        (e): ResolvedEndpoint => ({
          tableId: tableId(e.schemaName ?? schema.name, e.tableName),
          columns: e.fieldNames,
          relation: e.relation,
        }),
      );

      // Identify the child (FK holder) vs parent (referenced) side. Endpoint order
      // is not reliable, so use cardinality first, then pk-membership as a tiebreak.
      let child: ResolvedEndpoint;
      let parent: ResolvedEndpoint;
      const aMany = epA.relation === '*';
      const bMany = epB.relation === '*';
      if (aMany !== bMany) {
        child = aMany ? epA : epB;
        parent = aMany ? epB : epA;
      } else {
        // 1:1 (or rare N:M): the FK side is the one whose columns aren't all pk.
        const aPk = allPk(epA);
        const bPk = allPk(epB);
        if (aPk && !bPk) {
          child = epB;
          parent = epA;
        } else {
          child = epA;
          parent = epB;
        }
      }

      const identifying = allPk(child);
      const fkNullable = anyNullable(child);
      child.columns.forEach((c) => fkColumns.add(`${child.tableId}::${c}`));

      relations.push({
        id: `${child.tableId}.${child.columns.join('-')}__${parent.tableId}.${parent.columns.join('-')}`,
        kind: identifying ? 'identifying' : 'non-identifying',
        // Child (FK holder): participation isn't expressible in DBML, so it's undefined
        // (pure cardinality) unless the FK column note opts in with the word "optional".
        from: { ...child, optional: noteSaysOptional(child) ? true : undefined },
        // Parent (referenced): optional when the foreign key is nullable ("zero or one").
        to: { ...parent, optional: fkNullable },
      });
    }
  }

  // Pass 3: build tables, marking the foreign-key columns found above.
  const tables: TableInfo[] = [];
  for (const schema of database.schemas) {
    const schemaName = schema.name;
    for (const table of schema.tables) {
      const id = tableId(schemaName, table.name);
      const pkCols = primaryKeyColumns(table);
      const columns: ColumnInfo[] = table.fields.map((field) => ({
        name: field.name,
        type: field.type?.type_name ?? 'unknown',
        pk: pkCols.has(field.name),
        notNull: pkCols.has(field.name) || Boolean(field.not_null),
        unique: Boolean(field.unique),
        increment: Boolean(field.increment),
        defaultValue: field.dbdefault?.value,
        note: noteText(field.note),
        isForeignKey: fkColumns.has(`${id}::${field.name}`),
      }));

      tables.push({
        id,
        name: table.name,
        schema: schemaName !== DEFAULT_SCHEMA ? schemaName : undefined,
        note: noteText(table.note),
        headerColor: table.headerColor ?? undefined,
        columns,
      });
    }
  }

  return { tables, relations };
}

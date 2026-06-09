/** Cardinality of one side of a relation. `'1'` = one, `'*'` = many. */
export type Cardinality = '1' | '*';

/** A single column within a table. */
export interface ColumnInfo {
  /** Column name. */
  name: string;
  /** Data type as written in the DBML (e.g. `varchar`, `int`, `timestamp`). */
  type: string;
  /** Whether the column is part of the primary key. */
  pk: boolean;
  /** Whether the column is `not null`. */
  notNull: boolean;
  /** Whether the column has a unique constraint. */
  unique: boolean;
  /** Whether the column auto-increments. */
  increment: boolean;
  /** Default value, if any. */
  defaultValue?: string | number | boolean | null;
  /** Inline note/comment for the column. */
  note?: string;
  /** True when this column participates as an endpoint of a relation. */
  isForeignKey: boolean;
}

/** A table parsed from the DBML schema. */
export interface TableInfo {
  /** Stable id: `schema.table` when a non-default schema is present, otherwise `table`. */
  id: string;
  /** Table name. */
  name: string;
  /** Schema name, when not the default `public` schema. */
  schema?: string;
  /** Table-level note/comment. */
  note?: string;
  /** Optional header color set in the DBML (`headercolor`). */
  headerColor?: string;
  /** Columns in declaration order. */
  columns: ColumnInfo[];
}

/**
 * Relationship kind, mirroring MySQL Workbench's EER notation:
 * - `identifying` — the child's foreign key is part of its primary key (drawn as a solid line).
 * - `non-identifying` — the foreign key is not part of the primary key (drawn as a dashed line).
 */
export type RelationKind = 'identifying' | 'non-identifying';

/** One end of a relation. */
export interface RelationEndpoint {
  /** Id of the table this endpoint belongs to (matches {@link TableInfo.id}). */
  tableId: string;
  /** Column name(s) involved on this side. */
  columns: string[];
  /** Cardinality on this side. */
  relation: Cardinality;
  /**
   * Participation, derived from foreign-key nullability — only meaningful on the referenced
   * ("one"/parent) side: `true` = optional (nullable FK → "zero or one"), `false` = mandatory
   * (`not null` FK → "one and only one"). `undefined` on the FK-holder side, whose minimum
   * participation isn't expressible in DBML, so it renders pure cardinality with no ring.
   */
  optional?: boolean;
}

/** A relation (foreign key reference) between two tables. */
export interface RelationInfo {
  /** Stable id for the relation. */
  id: string;
  /** Identifying vs non-identifying — controls solid vs dashed line. */
  kind: RelationKind;
  /** Child endpoint: the table that holds the foreign key (the "many" side of a 1:N). */
  from: RelationEndpoint;
  /** Parent endpoint: the referenced table (the "one" side of a 1:N). */
  to: RelationEndpoint;
}

/** Result of parsing a DBML document. */
export interface ParsedSchema {
  tables: TableInfo[];
  relations: RelationInfo[];
}

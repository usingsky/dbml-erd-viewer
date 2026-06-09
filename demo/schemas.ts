/** Example DBML schemas for the playground's preset dropdown. */
export interface SchemaPreset {
  id: string;
  label: string;
  dbml: string;
}

const ECOMMERCE = `// E-commerce schema
// Solid line = identifying (FK is part of PK), dashed = non-identifying.
Table users {
  id int [pk, increment]
  email varchar [not null, unique]
  display_name varchar
}

Table categories {
  id int [pk, increment]
  name varchar [not null]
}

Table coupons {
  id int [pk, increment]
  code varchar [not null, unique]
}

Table products {
  id int [pk, increment]
  category_id int [not null, ref: > categories.id]
  name varchar [not null]
  price decimal [not null]
}

Table orders {
  id int [pk, increment]
  user_id int [not null, ref: > users.id]   // mandatory: "one and only one"
  coupon_id int [ref: > coupons.id]          // nullable: "zero or one"
  status varchar [note: 'pending | paid | shipped']
  created_at timestamp [default: \`now()\`]
}

// Junction table: composite PK made of the two FKs -> identifying relationships.
Table order_items {
  order_id int [ref: > orders.id]
  product_id int [ref: > products.id]
  quantity int [not null]
  indexes {
    (order_id, product_id) [pk]
  }
}
`;

const BLOG = `// Minimal blog
Table authors {
  id int [pk, increment]
  name varchar [not null]
}

Table articles {
  id int [pk, increment]
  author_id int [not null, ref: > authors.id]
  title varchar [not null]
  published_at timestamp
}
`;

const ORDERS = `// Orders with a composite-key line items table (identifying relations)
Table customers {
  id int [pk, increment]
  name varchar [not null]
}

Table products {
  id int [pk, increment]
  sku varchar [not null, unique]
  price decimal
}

Table orders {
  id int [pk, increment]
  customer_id int [not null, ref: > customers.id]
  placed_at timestamp
}

Table order_items {
  order_id int [ref: > orders.id]
  product_id int [ref: > products.id]
  quantity int [not null]
  indexes {
    (order_id, product_id) [pk]
  }
}
`;

const SCHEMAS = `// Multi-schema example (note the schema-qualified table ids)
Table auth.users {
  id int [pk]
  email varchar [not null, unique]
}

Table app.profiles {
  id int [pk]
  user_id int [not null, ref: > auth.users.id]
  bio text
}
`;

export const SCHEMA_PRESETS: SchemaPreset[] = [
  { id: 'ecommerce', label: 'E-commerce', dbml: ECOMMERCE },
  { id: 'blog', label: 'Blog (minimal)', dbml: BLOG },
  { id: 'orders', label: 'Orders (composite key)', dbml: ORDERS },
  { id: 'schemas', label: 'Multi-schema', dbml: SCHEMAS },
];

import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// One atomically replaced document per encounter. Revision is the CAS guard.
export const rooms = sqliteTable("rooms", {
  code: text("code").primaryKey(),
  revision: integer("revision").notNull(),
  payload: text("payload").notNull(),
  updatedAt: integer("updated_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
}, (table) => [index("rooms_expiry_idx").on(table.expiresAt)]);

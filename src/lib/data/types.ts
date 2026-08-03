/**
 * The bridge between the generated Supabase schema and the read shapes the app
 * actually uses.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every nested query in this codebase currently re-declares its own row
 * interface by hand — `ApplicationRecord` in the student board, `AppRecord` in
 * the parent portal, `StudentAppRecord` in the chat context, `ApplicationJoin`
 * in two more pages — and each one is reached through `as unknown as`. Four
 * hand-written descriptions of one table is four things that drift, and the
 * cast means the compiler cannot tell you when they have.
 *
 * A read shape is a *narrowing* of the generated row, so it should be spelled
 * as one: `Pick<Row<'applications'>, …>`. Then a column that changes type, or
 * disappears, is a compile error at every read shape that names it — which is
 * the only reason to have types here at all.
 *
 * Rule: row types in `src/lib/data/**` are DERIVED. If you find yourself
 * writing `id: string`, stop — write `id: Row<'applications'>['id']`.
 *
 * Deliberately minimal: `Insert<>` / `Update<>` / `ViewRow<>` belong here too,
 * and should be added by the first write repo that needs one rather than sitting
 * unused now.
 */

import type { Database } from '@/lib/types/database';

type PublicSchema = Database['public'];

type TableName = keyof PublicSchema['Tables'];

/** The generated Row type for a table. The base of every read shape. */
export type Row<T extends TableName> = PublicSchema['Tables'][T]['Row'];

/** A database enum, by name — `DbEnum<'application_status'>`. */
export type DbEnum<E extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][E];

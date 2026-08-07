/**
 * Escapes a user-supplied value for use inside a PostgREST filter expression
 * such as `.or()`.
 *
 * The value MUST be wrapped in double quotes by the caller — see
 * `ilikeContains()`. Quoting is what actually contains the value: PostgREST
 * splits an `or=(...)` list on commas and treats `.` and parentheses as
 * grammar, so an unquoted value like `foo,title.eq.bar` injects an extra OR
 * branch (and a value containing a plain comma just 400s).
 *
 * Escaping happens in two passes, and the order matters:
 *   1. ILIKE metacharacters (`%`, `_`) are escaped with a backslash so a
 *      literal `%` in the search term matches a literal `%`. PostgreSQL's
 *      LIKE/ILIKE uses backslash as its default escape character.
 *   2. Backslashes and double quotes are then escaped for PostgREST's quoted
 *      string syntax. This runs second so the backslashes introduced by step 1
 *      are themselves doubled and survive into the SQL pattern.
 */
export function escapePostgrestValue(input: string): string {
  return input
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

/**
 * Builds a quoted `ilike` "contains" filter term for the given column, e.g.
 * `title.ilike."%facemoji%"`. The surrounding `%` wildcards are added outside
 * the escaped value so they stay wildcards.
 */
export function ilikeContains(column: string, search: string): string {
  return `${column}.ilike."%${escapePostgrestValue(search)}%"`;
}

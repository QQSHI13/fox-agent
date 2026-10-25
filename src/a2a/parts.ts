/**
 * A2A part lists → text.
 *
 * The client and the server each had this function, byte for byte. It lives
 * here because the two must agree: the server decides what a task says, the
 * client decides what it reads back, and a format change in one copy would
 * silently truncate every delegated result.
 *
 * Only `kind: "text"` parts carry text; file and data parts are not extracted
 * (a delegated agent's return value is prose, and inlining arbitrary bytes into
 * a prompt is not what a caller wants).
 */
export function partsText(parts: any[] | undefined): string {
  return (parts ?? [])
    .filter((p) => p?.kind === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("\n");
}

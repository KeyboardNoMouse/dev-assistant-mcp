/**
 * Split text into chunks of roughly `chunkSize` characters,
 * breaking at newlines where possible to avoid splitting mid-line.
 */
export function chunkText(text: string, chunkSize = 4000): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);

    // Try to break at a newline to avoid cutting mid-line
    if (end < text.length) {
      const lastNewline = text.lastIndexOf("\n", end);
      if (lastNewline > start) end = lastNewline + 1;
    }

    chunks.push(text.slice(start, end));
    start = end;
  }

  return chunks;
}

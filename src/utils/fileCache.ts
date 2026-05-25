import fs from "fs-extra";
import crypto from "crypto";

interface CacheEntry {
  mtime: number;
  size: number;
  content: string;
}

const fileCache = new Map<string, CacheEntry>();

/**
 * Read a file, using an in-memory cache keyed by path + mtime.
 * If the file hasn't changed since last read, returns cached content.
 */
export async function readFileCached(filePath: string): Promise<string> {
  const stat = await fs.stat(filePath);
  const mtime = stat.mtimeMs;
  const size = stat.size;

  const cached = fileCache.get(filePath);
  if (cached && cached.mtime === mtime && cached.size === size) {
    return cached.content;
  }

  const content = await fs.readFile(filePath, "utf-8");
  fileCache.set(filePath, { mtime, size, content });
  return content;
}

export function hashContent(content: string): string {
  return crypto.createHash("md5").update(content).digest("hex").slice(0, 8);
}

import fs from "fs-extra";
import crypto from "crypto";

interface CacheEntry {
  mtime: number;
  size: number;
  content: string;
  lastAccessed: number;
}

const MAX_CACHE_ENTRIES = 500;        // evict when over this
const MAX_ENTRY_SIZE_BYTES = 512_000; // don't cache files over 500KB

const fileCache = new Map<string, CacheEntry>();

/** Evict the LRU half of the cache when it's too large. */
function evictIfNeeded(): void {
  if (fileCache.size <= MAX_CACHE_ENTRIES) return;

  const entries = Array.from(fileCache.entries())
    .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

  const toEvict = Math.floor(entries.length / 2);
  for (let i = 0; i < toEvict; i++) {
    fileCache.delete(entries[i][0]);
  }
}

/**
 * Read a file, using an in-memory LRU cache keyed by path + mtime + size.
 * Files larger than 500KB are read directly (not cached) to avoid OOM.
 */
export async function readFileCached(filePath: string): Promise<string> {
  const stat = await fs.stat(filePath);
  const mtime = stat.mtimeMs;
  const size = stat.size;

  if (size > MAX_ENTRY_SIZE_BYTES) {
    return fs.readFile(filePath, "utf-8");
  }

  const cached = fileCache.get(filePath);
  if (cached && cached.mtime === mtime && cached.size === size) {
    cached.lastAccessed = Date.now();
    return cached.content;
  }

  const content = await fs.readFile(filePath, "utf-8");
  fileCache.set(filePath, { mtime, size, content, lastAccessed: Date.now() });
  evictIfNeeded();
  return content;
}

export function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
}

export function clearCache(): void {
  fileCache.clear();
}

export function cacheStats(): { entries: number; maxEntries: number } {
  return { entries: fileCache.size, maxEntries: MAX_CACHE_ENTRIES };
}

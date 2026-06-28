import { glob } from "glob";

// Supported source file extensions — extend here to add more languages
export const SOURCE_EXTENSIONS = "{ts,tsx,js,jsx,mjs,cjs,py,java,go,rs,rb,cs,php,json,md,yaml,yml,toml,sh,bash}";

/** Paths always excluded from repo scans */
const ALWAYS_IGNORE = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/coverage/**",
  "**/__pycache__/**",
  "**/*.min.js",
  "**/*.bak",        // fix: write_file backups were being scanned
  "**/*.bak.*",
  "**/data/*.db",    // exclude runtime SQLite databases
];

export async function scanRepository(repoPath: string): Promise<string[]> {
  return await glob(`${repoPath}/**/*.${SOURCE_EXTENSIONS}`, {
    nodir: true,
    ignore: ALWAYS_IGNORE,
  });
}

export async function scanAll(repoPath: string): Promise<string[]> {
  return await glob(`${repoPath}/**/*`, {
    nodir: true,
    ignore: ALWAYS_IGNORE,
  });
}

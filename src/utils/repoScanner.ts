import { glob } from "glob";

// Supported source file extensions — extend here to add more languages
export const SOURCE_EXTENSIONS = "{ts,tsx,js,jsx,py,java,go,rs,rb,cs,php,json,md,yaml,yml,toml,env,sh,bash}";

export async function scanRepository(repoPath: string): Promise<string[]> {
  return await glob(`${repoPath}/**/*.${SOURCE_EXTENSIONS}`, {
    nodir: true,
    ignore: [
      "**/node_modules/**",
      "**/.git/**",
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
      "**/coverage/**",
      "**/__pycache__/**",
      "**/*.min.js",
    ],
  });
}

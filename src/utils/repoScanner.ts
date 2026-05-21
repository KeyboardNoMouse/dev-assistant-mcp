import { glob } from "glob";

export async function scanRepository(repoPath: string) {
  return await glob(
    `${repoPath}/**/*.{ts,tsx,js,jsx,py,json,md}`,
    {
      nodir: true,
      ignore: [
        "**/node_modules/**",
        "**/.git/**",
        "**/dist/**",
      ],
    }
  );
}

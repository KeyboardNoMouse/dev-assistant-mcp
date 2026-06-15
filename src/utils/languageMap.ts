/**
 * Maps file extensions to human-readable language names.
 * Single source of truth — import from here, never duplicate.
 */
export const LANGUAGE_MAP: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TypeScript/React",
  js: "JavaScript",
  jsx: "JavaScript/React",
  mjs: "JavaScript (ESM)",
  cjs: "JavaScript (CJS)",
  py: "Python",
  java: "Java",
  go: "Go",
  rs: "Rust",
  rb: "Ruby",
  cs: "C#",
  php: "PHP",
  sh: "Shell/Bash",
  bash: "Bash",
  zsh: "Zsh",
  kt: "Kotlin",
  swift: "Swift",
  cpp: "C++",
  c: "C",
  h: "C/C++ Header",
  dart: "Dart",
  scala: "Scala",
  ex: "Elixir",
  exs: "Elixir Script",
  hs: "Haskell",
  lua: "Lua",
  r: "R",
  jl: "Julia",
};

export function languageFromExt(ext: string): string {
  return LANGUAGE_MAP[ext.toLowerCase()] ?? ext.toUpperCase() ?? "Unknown";
}

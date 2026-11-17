import { execFileSync } from "node:child_process";

export function git(args: string[], cwd?: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/** Files changed between the merge-base of base..head and head (renames reported as both paths). */
export function changedFiles(base: string, head: string, cwd?: string): string[] {
  const out = git(["diff", "--name-status", "-M", `${base}...${head}`], cwd);
  const files = new Set<string>();
  for (const line of out.split("\n").filter(Boolean)) {
    const parts = line.split("\t");
    for (const p of parts.slice(1)) files.add(p);
  }
  return [...files];
}

/** Reads a file at a git ref, or null when it does not exist there. */
export function showFile(ref: string, file: string, cwd?: string): string | null {
  try {
    return git(["show", `${ref}:${file}`], cwd);
  } catch {
    return null;
  }
}

export function listDirs(ref: string, dir: string, cwd?: string): string[] {
  try {
    return git(["ls-tree", "-d", "--name-only", `${ref}:${dir}`], cwd).split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

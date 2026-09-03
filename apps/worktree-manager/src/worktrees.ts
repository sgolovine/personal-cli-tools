import { execFile } from "node:child_process";

export type Worktree = {
  path: string;
  head: string;
  branch: string;
  removable: boolean;
};

function git(args: string[], cwd = process.cwd()): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      { cwd, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (!error) {
          resolve(stdout);
          return;
        }

        reject(new Error(stderr.trim() || error.message));
      },
    );
  });
}

export async function isGitWorktree(): Promise<boolean> {
  try {
    return (
      (await git(["rev-parse", "--is-inside-work-tree"])).trim() === "true"
    );
  } catch {
    return false;
  }
}

function displayBranch(fields: Map<string, string>): string {
  const branch = fields.get("branch");
  if (branch) {
    return branch.replace(/^refs\/heads\//, "");
  }
  if (fields.has("bare")) {
    return "bare";
  }
  if (fields.has("detached")) {
    return "detached HEAD";
  }
  return "";
}

export function parseWorktrees(output: string): Worktree[] {
  return output
    .split("\0\0")
    .filter(Boolean)
    .map((record) => {
      const fields = new Map<string, string>();
      for (const line of record.split("\0")) {
        const separator = line.indexOf(" ");
        if (separator === -1) {
          fields.set(line, "");
        } else {
          fields.set(line.slice(0, separator), line.slice(separator + 1));
        }
      }

      const path = fields.get("worktree");
      if (!path) {
        throw new Error("Git returned an unexpected worktree list");
      }

      return {
        path,
        head: fields.get("HEAD")?.slice(0, 7) ?? "",
        branch: displayBranch(fields),
        removable: !fields.has("bare"),
      };
    });
}

export async function loadWorktrees(): Promise<Worktree[]> {
  return parseWorktrees(await git(["worktree", "list", "--porcelain", "-z"]));
}

export async function deleteWorktree(path: string): Promise<void> {
  await git(["worktree", "remove", path]);
}

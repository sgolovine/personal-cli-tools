import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { deleteWorktree } from "../dist/worktrees.js";

test("ordinary deletion preserves dirty worktrees; force deletion removes them", async () => {
  const root = await mkdtemp(join(tmpdir(), "worktree-delete-"));
  const originalCwd = process.cwd();
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, stdio: "pipe" });
  try {
    git("init");
    git(
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "--allow-empty",
      "-m",
      "initial",
    );
    process.chdir(root);
    const dirty = join(root, "dirty");
    git("worktree", "add", "-b", "dirty", dirty);
    await writeFile(join(dirty, "untracked.txt"), "keep me");
    await assert.rejects(deleteWorktree(dirty), /modified or untracked files/);
    assert.equal(
      await readFile(join(dirty, "untracked.txt"), "utf8"),
      "keep me",
    );
    await deleteWorktree(dirty, undefined, true);
    await assert.rejects(readFile(join(dirty, "untracked.txt")), {
      code: "ENOENT",
    });
    assert.ok(
      !git("worktree", "list", "--porcelain").toString().includes(dirty),
    );

    const clean = join(root, "clean");
    git("worktree", "add", "-b", "clean", clean);
    await deleteWorktree(clean);
    assert.ok(
      !git("worktree", "list", "--porcelain").toString().includes(clean),
    );

    const cancelled = join(root, "cancelled");
    git("worktree", "add", "-b", "cancelled", cancelled);
    await assert.rejects(deleteWorktree(cancelled, AbortSignal.abort(), true));
    assert.ok(
      git("worktree", "list", "--porcelain").toString().includes(cancelled),
    );
  } finally {
    process.chdir(originalCwd);
    await rm(root, { recursive: true, force: true });
  }
});

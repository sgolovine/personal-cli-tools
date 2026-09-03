#!/usr/bin/env node

import { MouseProvider } from "@ink-tools/ink-mouse";
import { render } from "ink";
import { App } from "./App.js";
import { isGitWorktree } from "./worktrees.js";

const SHELL_INIT = `worktree-manager() {
  local worktree_path
  worktree_path="$(command worktree-manager "$@")" || return $?
  if [ -n "$worktree_path" ]; then
    builtin cd -- "$worktree_path"
  fi
}`;

if (process.argv[2] === "--init") {
  process.stdout.write(`${SHELL_INIT}\n`);
} else if (!(await isGitWorktree())) {
  process.stderr.write("Directory is not a worktree\n");
  process.exitCode = 1;
} else {
  let destination: string | undefined;
  const app = render(
    <MouseProvider>
      <App onNavigate={(path) => (destination = path)} />
    </MouseProvider>,
    {
      stdin: process.stdin,
      stdout: process.stderr,
      stderr: process.stderr,
      alternateScreen: true,
    },
  );
  await app.waitUntilExit();

  if (destination) {
    process.stdout.write(`${destination}\n`);
  }
}

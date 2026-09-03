# Personal CLI Tools

A pnpm monorepo for personal command-line tools built with React Ink and packaged as standalone executables with `@yao-pkg/pkg`.

## Apps

- `apps/docker-manager`: Interactive terminal UI for common Docker actions.
- `apps/worktree-manager`: Interactive terminal UI for navigating and deleting Git worktrees.

## Development

Install dependencies and run checks from the repository root:

```sh
pnpm install
pnpm check
```

Build all apps with `pnpm build`, or package them as executables with `pnpm package`. To work with one app, use a filter such as `pnpm --filter docker-manager build`.

### Worktree Manager shell integration

A child process cannot change its parent shell's directory. Add this line to your `.zshrc` or `.bashrc` so selecting a worktree changes the current shell's directory:

```sh
eval "$(worktree-manager --init)"
```

Restart the shell, then run `worktree-manager` from anywhere inside a Git worktree. Use the arrow keys or mouse wheel to select a worktree, Enter or a double click to open it, `d` or the right-click menu to delete it, and `q` to quit.

This is personal software, as such I will not accept feature requests, bug reports or PR's.

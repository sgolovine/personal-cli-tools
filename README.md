# Personal CLI Tools

A pnpm monorepo for personal command-line tools built with React Ink and packaged as standalone executables with `@yao-pkg/pkg`.

## Apps

- `apps/docker-manager`: Interactive terminal UI for common Docker actions.

## Development

Install dependencies and run checks from the repository root:

```sh
pnpm install
pnpm check
```

Build all apps with `pnpm build`, or package them as executables with `pnpm package`. To work with one app, use a filter such as `pnpm --filter docker-manager build`.

This is personal software, as such I will not accept feature requests, bug reports or PR's.

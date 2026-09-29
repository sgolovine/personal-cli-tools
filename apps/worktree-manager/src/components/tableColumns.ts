export type TableColumn = {
  label: string;
  width: `${number}%`;
};

export const COLUMNS: [TableColumn, TableColumn, TableColumn] = [
  { label: "WORKTREE", width: "68%" },
  { label: "HEAD", width: "12%" },
  { label: "BRANCH", width: "20%" },
];

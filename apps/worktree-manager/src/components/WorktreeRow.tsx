import { type InkMouseEvent, useOnClick } from "@ink-tools/ink-mouse";
import { Box, type DOMElement } from "ink";
import { useRef } from "react";
import type { Worktree } from "../worktrees.js";
import { Cell } from "./Cell.js";
import { COLUMNS } from "./tableColumns.js";

export function WorktreeRow({
  worktree,
  selected,
  onClick,
  onContextMenu,
}: {
  worktree: Worktree;
  selected: boolean;
  onClick: () => void;
  onContextMenu: (event: InkMouseEvent) => void;
}) {
  const ref = useRef<DOMElement>(null);
  useOnClick(ref, (event) => {
    if (event.button === "left") {
      onClick();
    } else if (event.button === "right") {
      onContextMenu(event);
    }
  });

  return (
    <Box ref={ref} backgroundColor={selected ? "blue" : undefined}>
      <Cell value={worktree.path} column={COLUMNS[0]} />
      <Cell value={worktree.head} column={COLUMNS[1]} />
      <Cell value={worktree.branch} column={COLUMNS[2]} />
    </Box>
  );
}

import { type InkMouseEvent, useOnWheel } from "@ink-tools/ink-mouse";
import { Box, type DOMElement, Text } from "ink";
import { useRef } from "react";
import type { Worktree } from "../worktrees.js";
import { COLUMNS } from "./tableColumns.js";
import { WorktreeRow } from "./WorktreeRow.js";

export function WorktreeTable({
  worktrees,
  selected,
  viewportRows,
  onClick,
  onContextMenu,
  onMove,
}: {
  worktrees: Worktree[];
  selected: number;
  viewportRows: number;
  onClick: (index: number) => void;
  onContextMenu: (event: InkMouseEvent, index: number) => void;
  onMove: (delta: number) => void;
}) {
  const ref = useRef<DOMElement>(null);
  useOnWheel(ref, (event) => {
    if (event.button === "wheel-up") {
      onMove(-1);
    } else if (event.button === "wheel-down") {
      onMove(1);
    }
  });

  const start = Math.min(
    Math.max(0, selected - Math.floor(viewportRows / 2)),
    Math.max(0, worktrees.length - viewportRows),
  );
  const visibleWorktrees = worktrees.slice(start, start + viewportRows);

  return (
    <Box
      ref={ref}
      flexDirection="column"
      borderStyle="round"
      borderColor="gray"
      paddingX={1}
      height={viewportRows + 3}
      overflow="hidden"
      aria-role="table"
    >
      <Box>
        {COLUMNS.map((column) => (
          <Box
            key={column.label}
            width={column.width}
            paddingRight={1}
            flexShrink={0}
          >
            <Text bold color="gray" wrap="truncate-end">
              {column.label}
            </Text>
          </Box>
        ))}
      </Box>
      {visibleWorktrees.map((worktree, visibleIndex) => {
        const index = start + visibleIndex;
        return (
          <WorktreeRow
            key={worktree.path}
            worktree={worktree}
            selected={index === selected}
            onClick={() => onClick(index)}
            onContextMenu={(event) => onContextMenu(event, index)}
          />
        );
      })}
    </Box>
  );
}

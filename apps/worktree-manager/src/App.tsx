import { type InkMouseEvent, useOnClick } from "@ink-tools/ink-mouse";
import { Box, type DOMElement, Text, useApp, useInput, useStdout } from "ink";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DeleteOption } from "./components/DeleteOption.js";
import { WorktreeTable } from "./components/WorktreeTable.js";
import { deleteWorktree, loadWorktrees, type Worktree } from "./worktrees.js";

type Notice = {
  kind: "info" | "success" | "error";
  text: string;
};

type ContextMenuState = {
  x: number;
  y: number;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function App({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [dimensions, setDimensions] = useState({
    columns: stdout.columns ?? 80,
    rows: stdout.rows ?? 24,
  });
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [selected, setSelected] = useState(0);
  const [notice, setNotice] = useState<Notice>({
    kind: "info",
    text: "Loading worktrees…",
  });
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const lastClick = useRef({ path: "", time: 0 });

  const refresh = useCallback(async () => {
    const nextWorktrees = await loadWorktrees();
    setWorktrees(nextWorktrees);
    setSelected((current) =>
      Math.min(current, Math.max(0, nextWorktrees.length - 1)),
    );
    setNotice((current) =>
      current.text === "Loading worktrees…"
        ? { kind: "info", text: "Ready" }
        : current,
    );
  }, []);

  useEffect(() => {
    void refresh().catch((error: unknown) =>
      setNotice({ kind: "error", text: errorMessage(error) }),
    );
  }, [refresh]);

  useEffect(() => {
    const resize = () =>
      setDimensions({
        columns: stdout.columns ?? 80,
        rows: stdout.rows ?? 24,
      });
    stdout.on("resize", resize);
    return () => {
      stdout.off("resize", resize);
    };
  }, [stdout]);

  const viewportRows = Math.max(3, dimensions.rows - 7);
  const selectedWorktree = worktrees[selected];

  const moveSelection = useCallback(
    (delta: number) => {
      setSelected((current) =>
        Math.min(
          Math.max(0, current + delta),
          Math.max(0, worktrees.length - 1),
        ),
      );
      setMenu(null);
    },
    [worktrees.length],
  );

  const navigate = useCallback(() => {
    const worktree = worktrees[selected];
    if (worktree) {
      onNavigate(worktree.path);
      exit();
    }
  }, [exit, onNavigate, selected, worktrees]);

  const removeSelected = useCallback(async () => {
    const worktree = worktrees[selected];
    if (!worktree || busy) {
      return;
    }
    if (!worktree.removable) {
      setNotice({ kind: "error", text: "Bare worktrees cannot be removed" });
      setMenu(null);
      return;
    }

    setBusy(true);
    setMenu(null);
    try {
      await deleteWorktree(worktree.path);
      setNotice({ kind: "success", text: `Deleted ${worktree.path}` });
      await refresh();
    } catch (error: unknown) {
      setNotice({ kind: "error", text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }, [busy, refresh, selected, worktrees]);

  const handleClick = useCallback(
    (index: number) => {
      const worktree = worktrees[index];
      if (!worktree) {
        return;
      }

      const now = Date.now();
      const isDoubleClick =
        lastClick.current.path === worktree.path &&
        now - lastClick.current.time <= 400;
      lastClick.current = { path: worktree.path, time: now };
      setSelected(index);
      setMenu(null);
      if (isDoubleClick) {
        onNavigate(worktree.path);
        exit();
      }
    },
    [exit, onNavigate, worktrees],
  );

  const openContextMenu = useCallback(
    (event: InkMouseEvent, index: number) => {
      setSelected(index);
      setMenu({
        x: Math.min(
          Math.max(0, event.x - 1),
          Math.max(0, dimensions.columns - 18),
        ),
        y: Math.min(Math.max(0, event.y - 1), Math.max(0, dimensions.rows - 3)),
      });
    },
    [dimensions],
  );

  useInput((input, key) => {
    const normalized = input.toLowerCase();
    if (normalized === "q" || (key.ctrl && normalized === "c")) {
      exit();
      return;
    }
    if (key.escape) {
      setMenu(null);
      return;
    }
    if (menu) {
      if (key.return) {
        void removeSelected();
      }
      return;
    }
    if (key.upArrow) {
      moveSelection(-1);
    } else if (key.downArrow) {
      moveSelection(1);
    } else if (key.return) {
      navigate();
    } else if (normalized === "d") {
      void removeSelected();
    }
  });

  const rootRef = useRef<DOMElement>(null);
  useOnClick(rootRef, (event) => {
    if (event.button === "left" && menu) {
      setMenu(null);
    }
  });

  const noticeColor = useMemo(
    () =>
      notice.kind === "error"
        ? "red"
        : notice.kind === "success"
          ? "green"
          : "white",
    [notice.kind],
  );

  return (
    <Box
      ref={rootRef}
      position="relative"
      flexDirection="column"
      width={dimensions.columns}
      height={dimensions.rows}
      paddingX={1}
    >
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color="cyan">
          Worktree Manager
        </Text>
        <Text dimColor>{busy ? "Working…" : "q quit"}</Text>
      </Box>

      <WorktreeTable
        worktrees={worktrees}
        selected={selected}
        viewportRows={viewportRows}
        onClick={handleClick}
        onContextMenu={openContextMenu}
        onMove={moveSelection}
      />

      <Box justifyContent="space-between">
        <Text color={noticeColor}>{notice.text}</Text>
        <Text dimColor>↑/↓ select · enter open · d delete</Text>
      </Box>

      {menu ? (
        <Box
          position="absolute"
          left={menu.x}
          top={menu.y}
          width={18}
          flexDirection="column"
          borderStyle="round"
          borderColor="cyan"
          backgroundColor="black"
          paddingX={1}
          aria-role="menu"
        >
          <DeleteOption
            disabled={busy || !selectedWorktree?.removable}
            onChoose={() => void removeSelected()}
          />
        </Box>
      ) : null}
    </Box>
  );
}

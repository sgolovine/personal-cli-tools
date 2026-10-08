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

type QueuedWorktree = {
  worktree: Worktree;
  index: number;
  force: boolean;
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
  const [queue, setQueue] = useState<QueuedWorktree[]>([]);
  const [tab, setTab] = useState<"worktrees" | "queue">("worktrees");
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [selected, setSelected] = useState(0);
  const [queueSelected, setQueueSelected] = useState(0);
  const [notice, setNotice] = useState<Notice>({
    kind: "info",
    text: "Loading worktrees…",
  });
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const lastClick = useRef({ path: "", time: 0 });
  const processing = useRef(false);
  const queuedPaths = useRef(new Set<string>());
  const activeDeletion = useRef<AbortController | null>(null);
  const quitting = useRef(false);
  const worktreesTabRef = useRef<DOMElement>(null);
  const queueTabRef = useRef<DOMElement>(null);
  useOnClick(worktreesTabRef, () => setTab("worktrees"));
  useOnClick(queueTabRef, () => {
    setTab("queue");
    setMenu(null);
  });

  const refresh = useCallback(async () => {
    const nextWorktrees = await loadWorktrees();
    const available = nextWorktrees.filter(
      (worktree) => !queuedPaths.current.has(worktree.path),
    );
    setWorktrees(available);
    setSelected((current) =>
      Math.min(current, Math.max(0, available.length - 1)),
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

  useEffect(() => {
    const next = queue[0];
    if (!next || processing.current) {
      return;
    }

    processing.current = true;
    const controller = new AbortController();
    activeDeletion.current = controller;
    void deleteWorktree(next.worktree.path, controller.signal, next.force)
      .then(() => {
        if (!quitting.current) {
          setNotice({ kind: "success", text: `Deleted ${next.worktree.path}` });
        }
      })
      .catch((error: unknown) => {
        if (quitting.current) {
          return;
        }
        setWorktrees((current) => {
          const restored = [...current];
          restored.splice(Math.min(next.index, restored.length), 0, next.worktree);
          return restored;
        });
        setNotice({ kind: "error", text: errorMessage(error) });
      })
      .finally(() => {
        activeDeletion.current = null;
        queuedPaths.current.delete(next.worktree.path);
        processing.current = false;
        if (!quitting.current) {
          setQueue((current) => current.filter((item) => item !== next));
          setQueueSelected((current) => Math.max(0, current - 1));
        }
      });
  }, [queue]);

  const viewportRows = Math.max(3, dimensions.rows - 7);
  const queueStart = Math.min(
    Math.max(0, queueSelected - Math.floor(viewportRows / 2)),
    Math.max(0, queue.length - viewportRows),
  );
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

  const removeSelected = useCallback(
    (force = false) => {
      const worktree = worktrees[selected];
      if (!worktree || queuedPaths.current.has(worktree.path)) {
        return;
      }
      if (!worktree.removable) {
        setNotice({ kind: "error", text: "Bare worktrees cannot be removed" });
        setMenu(null);
        return;
      }

      setMenu(null);
      queuedPaths.current.add(worktree.path);
      setWorktrees((current) => current.filter((item) => item.path !== worktree.path));
      setSelected((current) => Math.min(current, Math.max(0, worktrees.length - 2)));
      setQueue((current) => [...current, { worktree, index: selected, force }]);
      setNotice({ kind: "info", text: `Queued ${worktree.path} for deletion` });
    },
    [selected, worktrees],
  );

  const quit = useCallback(() => {
    quitting.current = true;
    activeDeletion.current?.abort();
    queuedPaths.current.clear();
    setQueue([]);
    exit();
  }, [exit]);

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
    if (confirmQuit) {
      if (normalized === "y") {
        quit();
      } else if (normalized === "n" || key.escape) {
        setConfirmQuit(false);
      }
      return;
    }
    if (normalized === "q" || (key.ctrl && normalized === "c")) {
      if (queue.length > 0) {
        setConfirmQuit(true);
        setMenu(null);
      } else {
        quit();
      }
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
    if (key.tab || key.leftArrow || key.rightArrow) {
      setTab((current) => current === "worktrees" ? "queue" : "worktrees");
      return;
    }
    if (tab === "queue") {
      if (key.upArrow || key.downArrow) {
        setQueueSelected((current) =>
          Math.min(
            Math.max(0, current + (key.upArrow ? -1 : 1)),
            Math.max(0, queue.length - 1),
          ),
        );
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
      void removeSelected(key.shift || input === "D");
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
        <Text dimColor>
          {queue.length > 0 ? `${queue.length} queued · q quit` : "q quit"}
        </Text>
      </Box>

      <Box gap={2} marginBottom={1}>
        <Box ref={worktreesTabRef}>
          <Text color={tab === "worktrees" ? "cyan" : "gray"} bold={tab === "worktrees"}>
            Worktrees
          </Text>
        </Box>
        <Box ref={queueTabRef}>
          <Text color={tab === "queue" ? "cyan" : "gray"} bold={tab === "queue"}>
            Queue ({queue.length})
          </Text>
        </Box>
      </Box>

      {tab === "worktrees" ? (
        <WorktreeTable
          worktrees={worktrees}
          selected={selected}
          viewportRows={viewportRows - 1}
          onClick={handleClick}
          onContextMenu={openContextMenu}
          onMove={moveSelection}
        />
      ) : (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="gray"
          paddingX={1}
          height={viewportRows + 2}
          overflow="hidden"
        >
          {queue.length === 0 ? <Text dimColor>Nothing queued for deletion</Text> : null}
          {queue.slice(queueStart, queueStart + viewportRows).map((item) => (
            <Box key={item.worktree.path} backgroundColor={queue[queueSelected] === item ? "blue" : undefined}>
              <Text wrap="truncate-end">
                {queue[0] === item ? "Deleting" : "Waiting"} · {item.worktree.path}
              </Text>
            </Box>
          ))}
        </Box>
      )}

      <Box justifyContent="space-between">
        <Text color={noticeColor}>{notice.text}</Text>
        <Text dimColor>
          {tab === "worktrees"
            ? "←/→ tabs · ↑/↓ select · enter open · d delete · shift+d force delete"
            : "←/→ tabs · ↑/↓ scroll"}
        </Text>
      </Box>

      {confirmQuit ? (
        <Box borderStyle="round" borderColor="yellow" paddingX={1} position="absolute" top={Math.max(0, Math.floor(dimensions.rows / 2) - 1)} left={2} backgroundColor="black">
          <Text color="yellow">{queue.length} worktree(s) queued. Quit and discard pending deletions? (y/n)</Text>
        </Box>
      ) : null}

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
            disabled={!selectedWorktree?.removable}
            onChoose={() => void removeSelected()}
          />
        </Box>
      ) : null}
    </Box>
  );
}

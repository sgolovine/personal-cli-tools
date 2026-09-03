import {
  type InkMouseEvent,
  useOnClick,
  useOnWheel,
} from "@ink-tools/ink-mouse";
import { Box, type DOMElement, Text, useApp, useInput, useStdout } from "ink";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type DockerSnapshot,
  deleteContainer,
  deleteImage,
  deleteVolume,
  loadDockerSnapshot,
  stopContainer,
} from "./docker.js";

type Tab = "containers" | "images" | "volumes";
type Action = "stop" | "delete";

type TableColumn = {
  label: string;
  width: `${number}%`;
};

type TableRow = {
  key: string;
  cells: string[];
};

type Notice = {
  kind: "info" | "success" | "error";
  text: string;
};

type ContextMenuState = {
  x: number;
  y: number;
  selected: number;
};

const TABS: Tab[] = ["containers", "images", "volumes"];
const EMPTY_SNAPSHOT: DockerSnapshot = {
  containers: [],
  images: [],
  volumes: [],
};

const COLUMNS: Record<Tab, TableColumn[]> = {
  containers: [
    { label: "NAME", width: "22%" },
    { label: "ID", width: "14%" },
    { label: "IMAGE", width: "26%" },
    { label: "STATUS", width: "26%" },
    { label: "RUNNING", width: "12%" },
  ],
  images: [
    { label: "REPOSITORY:TAG", width: "38%" },
    { label: "ID", width: "15%" },
    { label: "SIZE", width: "12%" },
    { label: "CREATED", width: "23%" },
    { label: "IN USE", width: "12%" },
  ],
  volumes: [
    { label: "NAME", width: "53%" },
    { label: "DRIVER", width: "18%" },
    { label: "SCOPE", width: "17%" },
    { label: "IN USE", width: "12%" },
  ],
};

function rowsForTab(snapshot: DockerSnapshot, tab: Tab): TableRow[] {
  switch (tab) {
    case "containers":
      return snapshot.containers.map((container) => ({
        key: container.key,
        cells: [
          container.name,
          container.id.slice(0, 12),
          container.image,
          container.status,
          container.running ? "yes" : "no",
        ],
      }));
    case "images":
      return snapshot.images.map((image) => ({
        key: image.key,
        cells: [
          image.reference,
          image.id,
          image.size,
          image.created,
          image.inUse ? "yes" : "no",
        ],
      }));
    case "volumes":
      return snapshot.volumes.map((volume) => ({
        key: volume.key,
        cells: [
          volume.name,
          volume.driver,
          volume.scope,
          volume.inUse ? "yes" : "no",
        ],
      }));
  }
}

function itemCount(snapshot: DockerSnapshot, tab: Tab): number {
  return snapshot[tab].length;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function Cell({ value, column }: { value: string; column: TableColumn }) {
  return (
    <Box width={column.width} paddingRight={1} flexShrink={0}>
      <Text wrap="truncate-end">{value}</Text>
    </Box>
  );
}

function TabButton({
  tab,
  active,
  onActivate,
}: {
  tab: Tab;
  active: boolean;
  onActivate: () => void;
}) {
  const ref = useRef<DOMElement>(null);
  useOnClick(ref, (event) => {
    if (event.button === "left") {
      onActivate();
    }
  });

  return (
    <Box ref={ref} marginRight={2} aria-role="tab">
      <Text bold={active} color={active ? "cyan" : "white"}>
        {active ? "●" : "○"} [{tab[0]}] {tab[0]?.toUpperCase()}
        {tab.slice(1)}
      </Text>
    </Box>
  );
}

function ResourceRow({
  row,
  columns,
  selected,
  onSelect,
  onContextMenu,
}: {
  row: TableRow;
  columns: TableColumn[];
  selected: boolean;
  onSelect: () => void;
  onContextMenu: (event: InkMouseEvent) => void;
}) {
  const ref = useRef<DOMElement>(null);
  useOnClick(ref, (event) => {
    if (event.button === "left") {
      onSelect();
    } else if (event.button === "right") {
      onSelect();
      onContextMenu(event);
    }
  });

  return (
    <Box ref={ref} backgroundColor={selected ? "blue" : undefined}>
      {row.cells.map((cell, index) => {
        const column = columns[index];
        return column ? (
          <Cell key={column.label} value={cell} column={column} />
        ) : null;
      })}
    </Box>
  );
}

function ResourceTable({
  rows,
  columns,
  selected,
  viewportRows,
  onSelect,
  onContextMenu,
  onMove,
}: {
  rows: TableRow[];
  columns: TableColumn[];
  selected: number;
  viewportRows: number;
  onSelect: (index: number) => void;
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
    Math.max(0, rows.length - viewportRows),
  );
  const visibleRows = rows.slice(start, start + viewportRows);

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
        {columns.map((column) => (
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
      {rows.length === 0 ? (
        <Box paddingTop={1}>
          <Text dimColor>No items found.</Text>
        </Box>
      ) : (
        visibleRows.map((row, visibleIndex) => {
          const index = start + visibleIndex;
          return (
            <ResourceRow
              key={row.key}
              row={row}
              columns={columns}
              selected={index === selected}
              onSelect={() => onSelect(index)}
              onContextMenu={(event) => onContextMenu(event, index)}
            />
          );
        })
      )}
    </Box>
  );
}

function MenuOption({
  label,
  selected,
  disabled,
  onChoose,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  onChoose: () => void;
}) {
  const ref = useRef<DOMElement>(null);
  useOnClick(ref, (event) => {
    if (event.button === "left" && !disabled) {
      onChoose();
    }
  });

  return (
    <Box ref={ref} backgroundColor={selected ? "blue" : undefined}>
      <Text dimColor={disabled}>
        {selected ? "›" : " "} {label}
      </Text>
    </Box>
  );
}

export function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [dimensions, setDimensions] = useState({
    columns: stdout.columns ?? 80,
    rows: stdout.rows ?? 24,
  });
  const [tab, setTab] = useState<Tab>("containers");
  const [snapshot, setSnapshot] = useState<DockerSnapshot | null>(null);
  const snapshotRef = useRef<DockerSnapshot | null>(null);
  const [selected, setSelected] = useState<Record<Tab, number>>({
    containers: 0,
    images: 0,
    volumes: 0,
  });
  const [notice, setNotice] = useState<Notice>({
    kind: "info",
    text: "Loading Docker resources…",
  });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const refreshInFlight = useRef<Promise<void> | null>(null);

  const refresh = useCallback((): Promise<void> => {
    if (refreshInFlight.current) {
      return refreshInFlight.current;
    }

    const request = loadDockerSnapshot()
      .then((nextSnapshot) => {
        const previous = snapshotRef.current;
        setSelected((current) => {
          const next = { ...current };
          for (const currentTab of TABS) {
            const oldRows = previous ? rowsForTab(previous, currentTab) : [];
            const newRows = rowsForTab(nextSnapshot, currentTab);
            const oldKey = oldRows[current[currentTab]]?.key;
            const preserved = oldKey
              ? newRows.findIndex((row) => row.key === oldKey)
              : -1;
            next[currentTab] =
              preserved >= 0
                ? preserved
                : Math.min(
                    current[currentTab],
                    Math.max(0, newRows.length - 1),
                  );
          }
          return next;
        });
        snapshotRef.current = nextSnapshot;
        setSnapshot(nextSnapshot);
        setLoadError(null);
        setNotice((current) =>
          current.text === "Loading Docker resources…"
            ? { kind: "info", text: "Ready" }
            : current,
        );
      })
      .catch((error: unknown) => {
        setLoadError(errorMessage(error));
      })
      .finally(() => {
        refreshInFlight.current = null;
      });

    refreshInFlight.current = request;
    return request;
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), 2_000);
    return () => clearInterval(interval);
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

  const data = snapshot ?? EMPTY_SNAPSHOT;
  const rows = useMemo(() => rowsForTab(data, tab), [data, tab]);
  const selectedIndex = selected[tab];
  const viewportRows = Math.max(3, dimensions.rows - 9);

  const activateTab = useCallback((nextTab: Tab) => {
    setTab(nextTab);
    setMenu(null);
  }, []);

  const moveSelection = useCallback(
    (delta: number) => {
      setSelected((current) => ({
        ...current,
        [tab]: Math.min(
          Math.max(0, current[tab] + delta),
          Math.max(0, itemCount(data, tab) - 1),
        ),
      }));
      setMenu(null);
    },
    [data, tab],
  );

  const selectedContainer =
    tab === "containers" ? data.containers[selectedIndex] : undefined;
  const menuActions: Array<{
    action: Action;
    label: string;
    disabled: boolean;
  }> =
    tab === "containers"
      ? [
          {
            action: "stop",
            label: "Stop container",
            disabled: !selectedContainer?.running,
          },
          { action: "delete", label: "Delete container", disabled: false },
        ]
      : [
          {
            action: "delete",
            label: `Delete ${tab === "images" ? "image" : "volume"}`,
            disabled: false,
          },
        ];

  const performAction = useCallback(
    async (action: Action) => {
      if (busy) {
        return;
      }

      const index = selected[tab];
      const container =
        tab === "containers" ? data.containers[index] : undefined;
      const image = tab === "images" ? data.images[index] : undefined;
      const volume = tab === "volumes" ? data.volumes[index] : undefined;

      if (!container && !image && !volume) {
        setNotice({ kind: "info", text: "No item selected" });
        return;
      }
      if (action === "stop" && !container?.running) {
        setNotice({
          kind: "info",
          text: "The selected container is not running",
        });
        return;
      }

      setBusy(true);
      setMenu(null);
      try {
        if (action === "stop" && container) {
          await stopContainer(container.id);
          setNotice({ kind: "success", text: `Stopped ${container.name}` });
        } else if (container) {
          await deleteContainer(container.id);
          setNotice({ kind: "success", text: `Deleted ${container.name}` });
        } else if (image) {
          await deleteImage(image.deletionTarget);
          setNotice({ kind: "success", text: `Deleted ${image.reference}` });
        } else if (volume) {
          await deleteVolume(volume.name);
          setNotice({ kind: "success", text: `Deleted ${volume.name}` });
        }
      } catch (error: unknown) {
        setNotice({ kind: "error", text: errorMessage(error) });
      } finally {
        await refresh();
        setBusy(false);
      }
    },
    [busy, data, refresh, selected, tab],
  );

  const openContextMenu = useCallback(
    (event: InkMouseEvent, index: number) => {
      const width = 24;
      const height = tab === "containers" ? 4 : 3;
      setMenu({
        x: Math.min(
          Math.max(0, event.x - 1),
          Math.max(0, dimensions.columns - width),
        ),
        y: Math.min(
          Math.max(0, event.y - 1),
          Math.max(0, dimensions.rows - height),
        ),
        selected:
          tab === "containers" && !data.containers[index]?.running ? 1 : 0,
      });
    },
    [data.containers, dimensions, tab],
  );

  useInput((input, key) => {
    const normalized = input.toLowerCase();
    if (normalized === "q" || (key.ctrl && normalized === "c")) {
      exit();
      return;
    }
    if (
      !key.ctrl &&
      (normalized === "c" || normalized === "i" || normalized === "v")
    ) {
      activateTab(
        normalized === "c"
          ? "containers"
          : normalized === "i"
            ? "images"
            : "volumes",
      );
      return;
    }
    if (key.escape) {
      setMenu(null);
      return;
    }

    if (menu) {
      if (key.upArrow || key.downArrow) {
        const direction = key.upArrow ? -1 : 1;
        let next = menu.selected;
        do {
          next = (next + direction + menuActions.length) % menuActions.length;
        } while (menuActions[next]?.disabled && next !== menu.selected);
        setMenu({ ...menu, selected: next });
      } else if (key.return) {
        const choice = menuActions[menu.selected];
        if (choice && !choice.disabled) {
          void performAction(choice.action);
        }
      }
      return;
    }

    if (key.leftArrow || key.rightArrow) {
      const current = TABS.indexOf(tab);
      const direction = key.leftArrow ? -1 : 1;
      activateTab(
        TABS[(current + direction + TABS.length) % TABS.length] ?? tab,
      );
    } else if (key.upArrow) {
      moveSelection(-1);
    } else if (key.downArrow) {
      moveSelection(1);
    } else if (!busy && normalized === "s" && tab === "containers") {
      void performAction("stop");
    } else if (!busy && normalized === "d") {
      void performAction("delete");
    } else if (normalized === "r") {
      setNotice({ kind: "info", text: "Refreshing…" });
      void refresh().then(() => setNotice({ kind: "info", text: "Refreshed" }));
    }
  });

  const rootRef = useRef<DOMElement>(null);
  useOnClick(rootRef, (event) => {
    if (event.button === "left" && menu) {
      setMenu(null);
    }
  });

  return (
    <Box
      ref={rootRef}
      position="relative"
      flexDirection="column"
      width={dimensions.columns}
      height={dimensions.rows}
      paddingX={1}
    >
      <Box justifyContent="space-between">
        <Text bold color="cyan">
          Docker Manager
        </Text>
        <Text dimColor>
          {busy ? "Working…" : "c/i/v tabs · r refresh · q quit"}
        </Text>
      </Box>
      <Box marginY={1} aria-role="tablist">
        {TABS.map((currentTab) => (
          <TabButton
            key={currentTab}
            tab={currentTab}
            active={currentTab === tab}
            onActivate={() => activateTab(currentTab)}
          />
        ))}
      </Box>

      {loadError && !snapshot ? (
        <Box borderStyle="round" borderColor="red" paddingX={1}>
          <Text color="red">Docker unavailable: {loadError}</Text>
        </Box>
      ) : (
        <ResourceTable
          rows={rows}
          columns={COLUMNS[tab]}
          selected={selectedIndex}
          viewportRows={viewportRows}
          onSelect={(index) =>
            setSelected((current) => ({ ...current, [tab]: index }))
          }
          onContextMenu={openContextMenu}
          onMove={moveSelection}
        />
      )}

      <Box justifyContent="space-between">
        <Text
          color={
            notice.kind === "error"
              ? "red"
              : notice.kind === "success"
                ? "green"
                : "white"
          }
        >
          {loadError && snapshot ? `Refresh failed: ${loadError}` : notice.text}
        </Text>
        <Text dimColor>↑/↓ select · ←/→ tabs · s stop · d delete</Text>
      </Box>

      {menu ? (
        <Box
          position="absolute"
          left={menu.x}
          top={menu.y}
          width={24}
          flexDirection="column"
          borderStyle="round"
          borderColor="cyan"
          backgroundColor="black"
          paddingX={1}
          aria-role="menu"
        >
          {menuActions.map((choice, index) => (
            <MenuOption
              key={choice.action}
              label={choice.label}
              selected={index === menu.selected}
              disabled={choice.disabled || busy}
              onChoose={() => void performAction(choice.action)}
            />
          ))}
        </Box>
      ) : null}
    </Box>
  );
}

import { Box, Text } from "ink";
import type { TableColumn } from "./tableColumns.js";

export function Cell({
  value,
  column,
}: {
  value: string;
  column: TableColumn;
}) {
  return (
    <Box width={column.width} paddingRight={1} flexShrink={0}>
      <Text wrap="truncate-end">{value}</Text>
    </Box>
  );
}

import { useOnClick } from "@ink-tools/ink-mouse";
import { Box, type DOMElement, Text } from "ink";
import { useRef } from "react";

export function DeleteOption({
  disabled,
  onChoose,
}: {
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
    <Box ref={ref} backgroundColor="blue">
      <Text dimColor={disabled}>› Delete</Text>
    </Box>
  );
}

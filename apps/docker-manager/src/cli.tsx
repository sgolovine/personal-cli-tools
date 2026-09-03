#!/usr/bin/env node

import { MouseProvider } from "@ink-tools/ink-mouse";
import { render } from "ink";
import { App } from "./App.js";

process.stdout.write("\u001B[?1049h\u001B[H");

try {
  const app = render(
    <MouseProvider>
      <App />
    </MouseProvider>,
  );
  await app.waitUntilExit();
} finally {
  process.stdout.write("\u001B[?1049l");
}

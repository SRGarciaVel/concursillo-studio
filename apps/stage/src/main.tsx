import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MotionRoot } from "@concursillo/ui";
import App from "./App";
import "@fontsource-variable/outfit";
import "@fontsource-variable/oswald";
import "@fontsource-variable/orbitron";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MotionRoot>
      <App />
    </MotionRoot>
  </StrictMode>,
);

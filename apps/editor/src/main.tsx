import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MotionRoot, ToastProvider } from "@concursillo/ui";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MotionRoot>
      <ToastProvider>
        <App />
      </ToastProvider>
    </MotionRoot>
  </StrictMode>,
);

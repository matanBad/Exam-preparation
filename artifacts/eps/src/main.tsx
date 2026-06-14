import { createRoot } from "react-dom/client";
import { setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

// Cancelled requests (navigation, component unmount, query-key changes) reject
// with an AbortError. They are benign — swallow the unhandled rejection so the
// dev runtime-error overlay doesn't surface "signal is aborted without reason".
if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason as { name?: string } | undefined;
    if (reason?.name === "AbortError" || reason?.name === "CanceledError") {
      event.preventDefault();
    }
  });
}

setBaseUrl("http://localhost:3000");

createRoot(document.getElementById("root")!).render(<App />);

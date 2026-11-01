import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { loadSettings } from "./useSettings";

// Text size, number format and reduce-motion are in place before anything renders.
loadSettings();

const root = ReactDOM.createRoot(document.getElementById("root")!);

// ?demo=1 while developing opens the dashboard filled with invented data, for the picture on the login screen. In a
// production build import.meta.env.DEV is false, so this branch and the module behind it are dropped entirely.
if (import.meta.env.DEV && new URLSearchParams(location.search).get("demo") === "1") {
  void import("./components/DemoDashboard").then(({ default: DemoDashboard }) => root.render(<DemoDashboard />));
} else {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./drop-experience.css";
import "./mobile.css";
import "./pwa.css";
if (
  "serviceWorker" in navigator &&
  (window.location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(window.location.hostname))
) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("./sw.js").catch((error: unknown) => {
      console.error("DropSpace offline support could not be enabled.", error);
    });
  });
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>
);

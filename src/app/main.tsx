import { createRoot } from "react-dom/client";
import "../design/foundation.css";
import "./theme.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(<App />);

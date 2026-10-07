import { createRoot } from "react-dom/client";
import "@shoelace-style/shoelace/dist/themes/light.css";
import { setBasePath } from "@shoelace-style/shoelace/dist/utilities/base-path.js";
import App from "./App";
import "./style.css";
setBasePath("/shoelace");
createRoot(document.getElementById("root")!).render(<App />);

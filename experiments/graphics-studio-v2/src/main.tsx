import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RepresentationStudio } from "./studio/RepresentationStudio";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RepresentationStudio />
  </StrictMode>,
);

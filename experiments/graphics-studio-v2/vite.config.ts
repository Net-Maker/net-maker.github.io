import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  assetsInclude: ["**/*.d3dg"],
  build: {
    target: "es2022",
    sourcemap: true,
  },
});

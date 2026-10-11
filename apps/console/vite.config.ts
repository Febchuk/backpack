import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Calls the coach at VITE_COACH_URL (default http://localhost:8788).
export default defineConfig({ plugins: [react()] });

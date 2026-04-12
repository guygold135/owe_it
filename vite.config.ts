import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { componentTagger } from "lovable-tagger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(path.join(__dirname, "package.json"), "utf-8"),
) as { version: string };

const gitShaRaw =
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.GITHUB_SHA ??
  process.env.COMMIT_REF ??
  process.env.VITE_GIT_SHA ??
  "";
const gitShaShort = gitShaRaw ? gitShaRaw.slice(0, 7) : "";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // Capacitor/WebView needs relative asset paths. Vercel (and other static hosts with
  // SPA fallback) need "/" so deep links and refreshes resolve /assets/* from the site root.
  base: process.env.VERCEL ? "/" : "./",
  server: {
    host: "0.0.0.0",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  build: {
    // Keep the default, but make it explicit for Capacitor's `webDir`.
    outDir: "dist",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(pkg.version),
    "import.meta.env.VITE_GIT_SHA": JSON.stringify(gitShaShort),
  },
}));

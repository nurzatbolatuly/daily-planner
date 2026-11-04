import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Сборка (Vite) и тесты (Vitest) — один конфиг. Решения при переезде с CRA (instruction.md §2, §16):
// - envPrefix REACT_APP_: переменные окружения в .env и в Vercel не переименовываются;
// - outDir build: Vercel берёт результат оттуда же, что и при CRA (vercel.json);
// - target: те же браузеры, что CRA поддерживал по browserslist (iOS Safari 14+), а не дефолт Vite.
export default defineConfig({
  plugins: [react()],
  envPrefix: "REACT_APP_",
  server: {
    port: 3000,
    // Доступ с телефона по локальному IP (проверка PWA на iPhone).
    host: true,
  },
  preview: { port: 3000 },
  build: {
    outDir: "build",
    target: ["es2020", "chrome87", "edge88", "firefox78", "safari14"],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/setupTests.js"],
    // Как resetMocks в CRA: моки сбрасываются перед каждым тестом.
    mockReset: true,
    css: false,
  },
});

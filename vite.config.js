const { defineConfig } = require("vite");
const vue = require("@vitejs/plugin-vue");
const path = require("path");

module.exports = defineConfig({
  plugins: [vue()],
  base: "./",
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src/renderer"),
    },
  },
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
      },
    },
  },
});

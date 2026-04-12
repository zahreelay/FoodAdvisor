import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  root: resolve(__dirname),
  base: "/",
  envDir: resolve(__dirname, "../.."),
  publicDir: resolve(__dirname, "public"),
  build: {
    outDir: resolve(__dirname, "../../dist/web"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        city: resolve(__dirname, "city.html"),
        place: resolve(__dirname, "place.html"),
        dishes: resolve(__dirname, "dishes.html"),
        dish: resolve(__dirname, "dish.html"),
        personal: resolve(__dirname, "personal.html"),
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname),
    },
  },
});

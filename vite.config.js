import { defineConfig } from 'vite';

export default defineConfig({
    // This ensures assets are linked correctly regardless of where it is deployed
    base: './',
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
    }
});

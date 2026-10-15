const { defineConfig } = require('vite');
const vue = require('@vitejs/plugin-vue');
const path = require('path');
const fs = require('fs');

// Browser preview has no Electron handbook IPC. Serve bundled handbook text
// from the dev server without copying the large documents into the renderer.
const handbookPreview = {
  name: 'handbook-preview',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/__handbook', (req, res, next) => {
      let match;
      let file;
      try {
        match = /^\/(0[1-5])\/([^/]+)$/.exec(new URL(req.url, 'http://localhost').pathname);
        file = match && decodeURIComponent(match[2]);
      } catch (_) {
        return next();
      }
      if (!match || !/\.(md|html)$/i.test(file) || path.basename(file) !== file) return next();

      const stageDir = path.join(__dirname, 'fde-handbook', match[1]);
      const filePath = path.resolve(stageDir, file);
      if (path.dirname(filePath) !== stageDir) return next();

      const stream = fs.createReadStream(filePath);
      stream.on('error', () => {
        if (!res.headersSent) res.statusCode = 404;
        res.end();
      });
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      stream.pipe(res);
    });
  },
};

module.exports = defineConfig({
  root: path.resolve(__dirname, 'src/renderer'),
  base: './',
  plugins: [vue(), handbookPreview],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
  },
  server: {
    fs: { allow: [__dirname, fs.realpathSync(path.join(__dirname, 'node_modules'))] },
    host: '0.0.0.0',
    port: 43917,
    strictPort: true,
  },
});

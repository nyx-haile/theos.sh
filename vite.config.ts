import { defineConfig, type Plugin } from 'vite';
import solid from 'vite-plugin-solid';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { needsDirRedirect, KNOWN_SUBDIRS } from './src/a11y/dir-redirect';

const projectRoot = dirname(fileURLToPath(import.meta.url));

/** Redirect /<subdir> → /<subdir>/ in dev so bare paths match the multi-entry
 *  build output and don't fall through Vite's SPA index.html fallback. */
function subdirSlashRedirect(): Plugin {
  return {
    name: 'theos:subdir-slash-redirect',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const target = needsDirRedirect(req.url ?? '', KNOWN_SUBDIRS);
        if (target) {
          res.statusCode = 301;
          res.setHeader('Location', target);
          res.end();
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [subdirSlashRedirect(), solid()],
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: false,
      },
    },
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
    rollupOptions: {
      input: {
        main:    resolve(projectRoot, 'index.html'),
        a11y:    resolve(projectRoot, 'a11y/index.html'),
        hc:      resolve(projectRoot, 'hc/index.html'),
        surface: resolve(projectRoot, 'surface/index.html'),
        scribe:  resolve(projectRoot, 'playground/scribe/index.html'),
      },
    },
  },
});

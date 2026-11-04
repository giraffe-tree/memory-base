import { defineConfig, type ViteDevServer } from 'vite';
// @ts-expect-error Content compiler runs as a Node ES module.
import { buildCourse } from './scripts/build-content.mjs';
import path from 'node:path';

export default defineConfig(async ({ command }) => {
  await buildCourse({ strict: command === 'build' });
  return {
    root: 'web',
    base: './',
    build: { outDir: '../dist', emptyOutDir: true },
    plugins: [{
      name: 'memory-content',
      configureServer(server: ViteDevServer) {
        server.watcher.add(['docs', 'experiments', 'curriculum', 'sources'].map(p => path.resolve(p)));
        let timer: ReturnType<typeof setTimeout>;
        server.watcher.on('all', (_event: string, file: string) => {
          if (!/[/\\](docs|experiments|curriculum|sources)[/\\]/.test(file)) return;
          clearTimeout(timer);
          timer = setTimeout(async () => {
            try {
              await buildCourse({ strict: false });
              server.ws.send({ type: 'full-reload' });
            } catch (error) { server.config.logger.error(String(error)); }
          }, 200);
        });
      },
    }],
  };
});

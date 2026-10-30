import { runnerImport, type Plugin } from 'vite';
import type { WorldBuild } from './build.ts';

/**
 * Serves the world release at <base>world/ in development and emits it into the build. The builder
 * is loaded through Vite's module runner so the config itself stays free of source imports.
 */
export function worldPlugin(root: string): Plugin {
  let base = '/';
  let cached: WorldBuild | null = null;
  const build = async (): Promise<WorldBuild> => {
    if (!cached) {
      const { module } = await runnerImport<typeof import('./build.ts')>(`${root}/scripts/world/build.ts`, { configFile: false, logLevel: 'error' });
      cached = module.buildWorld(root);
    }
    return cached;
  };
  return {
    name: 'ctm-world',
    configResolved(config) {
      base = config.base;
    },
    configureServer(server) {
      server.watcher.add(`${root}/content`);
      server.watcher.on('all', (_event, file) => {
        if (file.startsWith(`${root}/content/`) || file.startsWith(`${root}/assets/registry.json`)) cached = null;
      });
      const prefix = `${base}world/`;
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith(prefix)) return next();
        const path = decodeURIComponent(req.url.slice(prefix.length).split('?')[0]!);
        build().then(
          (world) => {
            if (world.errors.length) {
              res.statusCode = 500;
              res.setHeader('content-type', 'text/plain');
              res.end(`World content errors:\n${world.errors.join('\n')}`);
              return;
            }
            const body = world.files.get(path);
            res.statusCode = body === undefined ? 404 : 200;
            res.setHeader('content-type', body === undefined ? 'text/plain' : 'application/json');
            res.setHeader('cache-control', 'no-store');
            res.end(body ?? 'Not found');
          },
          (err: unknown) => next(err),
        );
      });
    },
    async generateBundle() {
      cached = null;
      const world = await build();
      if (world.errors.length) this.error(`World content errors:\n  ${world.errors.join('\n  ')}`);
      for (const [path, source] of world.files) this.emitFile({ type: 'asset', fileName: `world/${path}`, source });
    },
  };
}

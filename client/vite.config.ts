import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function getGitVersion(): string {
  try {
    return execSync('git describe --tags --always --dirty', {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'development';
  }
}

function getGitRepo(): string {
  try {
    const url = execSync('git config --get remote.origin.url', {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const m = url.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
    return m ? m[1] : '';
  } catch {
    return '';
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(getGitVersion()),
    __APP_REPO__: JSON.stringify(getGitRepo()),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            // Prevent proxy buffering for SSE streams
            if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
              proxyRes.headers['x-accel-buffering'] = 'no';
            }
          });
        },
      },
    },
  },
});

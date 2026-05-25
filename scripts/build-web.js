const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

function buildWeb(options = {}) {
  const root = path.resolve(__dirname, '..');
  const entryPoint = path.join(root, 'apps', 'web', 'src', 'main.js');
  const publicEntryPoint = path.join(root, 'apps', 'web', 'src', 'public-main.js');
  const outDir = path.join(root, 'apps', 'web', 'dist', 'assets');

  fs.mkdirSync(outDir, { recursive: true });

  // 1. Build Admin Control Center
  esbuild.buildSync({
    entryPoints: [entryPoint],
    outfile: path.join(outDir, 'admin.bundle.js'),
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: ['es2020'],
    sourcemap: 'inline',
    logLevel: options.silent ? 'silent' : 'info',
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development')
    }
  });

  // 2. Build Public App (Landing page, Blog, Forum)
  esbuild.buildSync({
    entryPoints: [publicEntryPoint],
    outfile: path.join(outDir, 'public.bundle.js'),
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: ['es2020'],
    sourcemap: 'inline',
    logLevel: options.silent ? 'silent' : 'info',
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development')
    }
  });

  return {
    outputFile: path.join(outDir, 'admin.bundle.js'),
    publicOutputFile: path.join(outDir, 'public.bundle.js')
  };
}

if (require.main === module) {
  buildWeb();
}

module.exports = {
  buildWeb
};
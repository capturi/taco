import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'));

// CI computes the next version from the latest release tag and passes it via
// TACO_VERSION. Local builds fall back to whatever's in package.json.
const VERSION = process.env.TACO_VERSION ?? pkg.version;

// The script is published as a GitHub Release asset; the /releases/latest/download/
// permalink always resolves to the asset on the most recent release, so Tampermonkey
// gets the newest version without us ever editing the URL.
// In CI, GITHUB_REPOSITORY is set automatically (e.g. "OWNER/REPO").
// Locally, set TACO_GITHUB_REPO to mimic, or leave the placeholder.
const REPO = process.env.TACO_GITHUB_REPO ?? process.env.GITHUB_REPOSITORY ?? 'capturi/taco';
const SCRIPT_NAME = 'taco.user.js';
const DOWNLOAD_URL = `https://github.com/${REPO}/releases/latest/download/${SCRIPT_NAME}`;

const banner = `// ==UserScript==
// @name         Taco — Jira overview
// @namespace    https://github.com/${REPO}
// @version      ${VERSION}
// @description  ${pkg.description}
// @match        https://*.atlassian.net/*
// @run-at       document-idle
// @grant        none
// @updateURL    ${DOWNLOAD_URL}
// @downloadURL  ${DOWNLOAD_URL}
// ==/UserScript==
`;

// Prepend the userscript metadata block after Vite/esbuild are done writing
// the bundle. Doing it here (rather than via rollupOptions.output.banner)
// avoids esbuild's minifier stripping the // comments.
function userscriptBanner(): Plugin {
  return {
    name: 'taco-userscript-banner',
    apply: 'build',
    writeBundle(options, bundle) {
      const file = bundle[SCRIPT_NAME];
      if (!file || file.type !== 'chunk') return;
      const outPath = resolve(options.dir ?? 'dist', SCRIPT_NAME);
      writeFileSync(outPath, banner + '\n' + file.code);
    },
  };
}

export default defineConfig({
  plugins: [react(), userscriptBanner()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    target: 'es2022',
    minify: 'esbuild',
    cssCodeSplit: false,
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/content/index.tsx'),
      output: {
        format: 'iife',
        entryFileNames: SCRIPT_NAME,
        inlineDynamicImports: true,
        name: 'taco',
      },
    },
  },
});

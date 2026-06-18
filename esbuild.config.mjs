import esbuild from 'esbuild';
import { copy } from 'esbuild-plugin-copy';

const production = process.argv.includes('production');

const buildOptions = {
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'cjs',
  target: 'es2018',
  outdir: '../test-vault/.obsidian/plugins/obsidian-onenote-integration',
  external: [
    'obsidian',
    'electron',
    '@electron/remote',
    'child_process',
    '@codemirror/autocomplete',
    '@codemirror/closebrackets',
    '@codemirror/commands',
    '@codemirror/history',
    '@codemirror/language',
    '@codemirror/lint',
    '@codemirror/matchbrackets',
    '@codemirror/panel',
    '@codemirror/rangeset',
    '@codemirror/search',
    '@codemirror/state',
    '@codemirror/stream-parser',
    '@codemirror/text',
    '@codemirror/tooltip',
    '@codemirror/view'
  ],
  loader: {
    '.ts': 'ts',
    '.tsx': 'tsx'
  },
  plugins: [
    copy({
      assets: {
        from: ['./manifest.json', './styles.css', './onenote-repos.exe', './win-embed-overlay.exe'],
        to: ['./']
      }
    })
  ],
  minify: production,
  sourcemap: production ? false : 'inline',
  treeShaking: true
};

if (!production) {
  const context = await esbuild.context(buildOptions);
  await context.watch();
  console.log('Watching for changes...');
} else {
  await esbuild.build(buildOptions);
  console.log('Build complete');
}

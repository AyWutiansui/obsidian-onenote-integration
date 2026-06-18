import esbuild from 'esbuild';

const production = process.argv.includes('production');

const buildOptions = {
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'cjs',
  target: 'es2018',
  outdir: '.',
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
  plugins: [],
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

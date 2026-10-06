// Gera a pasta dist/ que a Netlify publica.
// As chaves do Supabase vêm das variáveis de ambiente da Netlify:
//   SUPABASE_URL e SUPABASE_ANON_KEY
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const watch = process.argv.includes('--watch');
const mock = process.env.EQL_MOCK; // só para testes locais (caminho de um cliente falso)

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
cpSync('public', 'dist', { recursive: true });

const options = {
  entryPoints: ['src/main.jsx'],
  bundle: true,
  minify: !watch,
  sourcemap: watch,
  outfile: 'dist/app.js',
  jsx: 'automatic',
  loader: { '.js': 'jsx' },
  target: ['es2020'],
  define: {
    'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production'),
    __SUPABASE_URL__: JSON.stringify(process.env.SUPABASE_URL || ''),
    __SUPABASE_ANON_KEY__: JSON.stringify(process.env.SUPABASE_ANON_KEY || ''),
  },
  alias: mock ? { '@supabase/supabase-js': mock } : {},
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('Observando alterações…');
} else {
  await esbuild.build(options);
  console.log('Build pronto em dist/');
}

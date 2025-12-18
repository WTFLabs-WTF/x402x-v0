import { defineConfig } from 'tsup'

const baseConfig = {
  entry: {
    index: 'src/index.ts',
    'server/index': 'src/server/index.ts',
  },
  dts: {
    resolve: true,
  },
  sourcemap: true,
  target: 'node16',
  external: ['viem', '@x402/core'],
}

export default defineConfig([
  {
    ...baseConfig,
    format: 'esm',
    outDir: 'dist/esm',
    clean: true,
  },
  {
    ...baseConfig,
    format: 'cjs',
    outDir: 'dist/cjs',
    clean: false,
  },
])

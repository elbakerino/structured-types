import resolve from '@rollup/plugin-node-resolve';
import { config } from '../../rollup-config';

export default config({
  input: ['./src/index.ts', './src/types.ts'],
  external: ['typescript'],
  plugins: [resolve({ browser: true, preferBuiltins: false })],
});

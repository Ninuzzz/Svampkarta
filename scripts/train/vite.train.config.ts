// Dev-server för träningen: ingen filbevakning/HMR, så att pågående körning inte avbryts av kodändringar.
import base from '../../vite.config'
export default {
  ...base,
  // egen beroende-cache, så att dev-servern inte tvingar fram omladdningar mitt i en körning
  cacheDir: 'node_modules/.vite-train',
  server: { ...base.server, hmr: false, watch: { ignored: ['**/*'] } },
}

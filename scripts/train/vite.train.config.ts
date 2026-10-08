// Dev-server för träningen: ingen filbevakning/HMR, så att pågående körning inte avbryts av kodändringar.
import base from '../../vite.config'
export default {
  ...base,
  server: { ...base.server, hmr: false, watch: { ignored: ['**/*'] } },
}

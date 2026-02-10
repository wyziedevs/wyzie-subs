//https://nitro.unjs.io/config
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const currentDir = dirname(fileURLToPath(import.meta.url));

export default defineNitroConfig({
  srcDir: "src",
  compatibilityDate: "2024-04-03",
  externals: {
    inline: [],
    external: [],
  },
  alias: {
    "@xmldom/xmldom": resolve(currentDir, "node_modules/@xmldom/xmldom/lib/index.js"),
  },
  rollupConfig: {
    onwarn(warning, handler) {
      if (warning.code === "UNRESOLVED_IMPORT" && warning.source === "@xmldom/xmldom") {
        return;
      }
      handler(warning);
    },
  },
});

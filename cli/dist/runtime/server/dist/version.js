import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const pkg = require("../package.json");
export const serverVersion = pkg.version ?? "0.0.0";
//# sourceMappingURL=version.js.map
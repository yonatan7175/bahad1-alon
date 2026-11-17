// Runs every code/asset generator. Called by dev, build, typecheck and test.
import { buildRegistry } from "./build-registry";
import { buildBahadJs } from "./build-bahad-js";
import { buildDocs } from "./build-docs";

(async () => {
  await buildRegistry();
  await buildBahadJs();
  await buildDocs();
})().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

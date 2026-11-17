// An "outside" server on 127.0.0.1:3299 that records every hit. Any request that
// reaches it from a sandboxed app means data could have been exfiltrated.
import http from "node:http";
import { execSync } from "node:child_process";

export default async function globalSetup() {
  const hits: string[] = [];
  const server = http.createServer((req, res) => {
    if (req.url === "/__hits") {
      res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
      res.end(JSON.stringify(hits));
      return;
    }
    if (req.url === "/__reset") {
      hits.length = 0;
      res.end("ok");
      return;
    }
    hits.push(`${req.method} ${req.url}`);
    res.writeHead(200, { "content-type": "text/plain", "access-control-allow-origin": "*" });
    res.end("got it");
  });
  await new Promise<void>((r) => server.listen(3299, "127.0.0.1", r));
  return async () => {
    await new Promise<void>((r) => server.close(() => r()));
    // The test build generated public/apps WITH the evil fixture app — regenerate it clean.
    execSync("pnpm -s gen", { stdio: "ignore", env: { ...process.env, BAHAD_EXTRA_APPS_DIR: "" } });
  };
}

// End-to-end + security tests against a PRODUCTION build in mock-auth mode.
// The build includes the malicious fixture app (tests/fixtures/apps/evil-app) and goes to
// .next-e2e, so it can never be confused with a real build.
import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;
const env = {
  BAHAD_AUTH: "mock",
  BAHAD_ALLOW_MOCK: "1",
  BAHAD_ALLOW_PGLITE: "1",
  BAHAD_PGLITE_DIR: "tests/e2e/.data/pglite",
  BAHAD_EXTRA_APPS_DIR: "tests/fixtures/apps",
  BAHAD_DIST_DIR: ".next-e2e",
  NEXT_PUBLIC_DISABLE_SW: "1",
  NEXT_PUBLIC_BAHAD_REALTIME: "sse",
  NEXT_TELEMETRY_DISABLED: "1",
  // Probe stand-in for "הוספת אפליקציה": *.frame.test can be framed, other hosts cannot (mock auth only).
  BAHAD_EMBED_PROBE_FAKE: "1",
};

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    trace: "retain-on-failure",
  },
  projects: [{ name: "mobile-chromium", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: `rm -rf tests/e2e/.data && pnpm gen && next build && next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    timeout: 300_000,
    reuseExistingServer: false,
    env,
    stdout: "pipe",
  },
});

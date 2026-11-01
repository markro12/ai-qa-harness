import { defineConfig, devices } from "@playwright/test";

// IDP=mock starts the mock identity provider. Otherwise the tests expect Keycloak on port 8080.
const useMockIdp = process.env.IDP === "mock";
const reuse = !process.env.CI;

const service = (script: string, port: number) => ({
  command: `npm run ${script}`,
  url: `http://localhost:${port}/health`,
  reuseExistingServer: reuse,
  stdout: "pipe" as const,
  timeout: 60_000,
});

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }], ["json", { outputFile: "test-results/results.json" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "api",
      testDir: "./tests/api",
      use: { baseURL: "http://localhost:3001" },
    },
    {
      name: "ui",
      testDir: "./tests/ui",
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:3000" },
    },
  ],
  webServer: [
    ...(useMockIdp
      ? [
          {
            command: "npm run start:mock-idp",
            url: "http://localhost:8080/realms/demo/.well-known/openid-configuration",
            reuseExistingServer: reuse,
            stdout: "pipe" as const,
            timeout: 60_000,
          },
        ]
      : []),
    service("start:payments", 3002),
    service("start:orders", 3001),
    service("start:web", 3000),
  ],
});

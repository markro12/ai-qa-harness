// Bug hunt: measures how many planted bugs the test suite catches.
//
// 1. Run the suite with no bugs. Every test must pass.
// 2. For each bug in bugs/catalog.json, turn on only that bug and run the suite again.
// 3. If at least one test fails, the suite caught the bug.
//
// Output: reports/bug-hunt.json and reports/bug-hunt.md.
// Usage:  npm run bug-hunt                 (mock identity provider)
//         IDP=keycloak npm run bug-hunt    (Keycloak must already run on :8080)
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import catalog from "../bugs/catalog.json" with { type: "json" };

type Bug = (typeof catalog)[number];

interface PwTest {
  status: "expected" | "unexpected" | "flaky" | "skipped";
  projectName: string;
}
interface PwSpec {
  title: string;
  file: string;
  tests: PwTest[];
}
interface PwSuite {
  title: string;
  specs?: PwSpec[];
  suites?: PwSuite[];
}
interface PwReport {
  stats: { expected: number; unexpected: number; flaky: number; skipped: number };
  suites: PwSuite[];
}

interface RunResult {
  passed: number;
  failed: number;
  failingTests: string[];
}

const idp = process.env.IDP === "keycloak" ? "keycloak" : "mock";
const outDir = "reports";
const rawDir = join(outDir, "raw");
mkdirSync(rawDir, { recursive: true });

function collectFailures(suites: PwSuite[], parents: string[] = []): string[] {
  const out: string[] = [];
  for (const suite of suites) {
    const path = suite.title && !suite.title.endsWith(".ts") ? [...parents, suite.title] : parents;
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests) {
        if (t.status === "unexpected") out.push(`[${t.projectName}] ${[...path, spec.title].join(" › ")}`);
      }
    }
    out.push(...collectFailures(suite.suites ?? [], path));
  }
  return out;
}

function runSuite(label: string, bugId?: string): RunResult {
  const jsonFile = join(rawDir, `${label}.json`);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    IDP: idp,
    BUG_HUNT: "1",
    PLANTED_BUGS: bugId ?? "",
    PLAYWRIGHT_JSON_OUTPUT_NAME: jsonFile,
  };
  const started = Date.now();
  spawnSync("npx", ["playwright", "test", "--reporter=json", "--retries=0"], {
    env,
    stdio: ["ignore", "ignore", "inherit"],
  });
  const report = JSON.parse(readFileSync(jsonFile, "utf8")) as PwReport;
  const failingTests = collectFailures(report.suites);
  const result = { passed: report.stats.expected, failed: report.stats.unexpected, failingTests };
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`${label.padEnd(20)} passed ${result.passed}, failed ${result.failed} (${secs}s)`);
  return result;
}

console.log(`Bug hunt with the ${idp} identity provider\n`);

const baseline = runSuite("baseline");
if (baseline.failed > 0) {
  console.error("\nThe suite fails with no planted bugs. Fix these tests first:");
  for (const t of baseline.failingTests) console.error(`  - ${t}`);
  process.exit(1);
}

const results: Array<Bug & { caught: boolean; failingTests: string[] }> = [];
for (const b of catalog) {
  const r = runSuite(b.id, b.id);
  results.push({ ...b, caught: r.failed > 0, failingTests: r.failingTests });
}

const caught = results.filter((r) => r.caught).length;
const summary = {
  generatedAt: new Date().toISOString(),
  idp,
  suite: "hand-written",
  baseline: { passed: baseline.passed },
  caught,
  total: results.length,
  catchRate: Math.round((caught / results.length) * 1000) / 10,
  bugs: results,
};
writeFileSync(join(outDir, "bug-hunt.json"), JSON.stringify(summary, null, 2) + "\n");

const md = [
  `## Bug hunt: ${caught} of ${results.length} planted bugs caught (${summary.catchRate}%)`,
  "",
  `Suite: ${summary.suite}. Baseline: ${baseline.passed} tests passed with no bugs. Identity provider: ${idp}.`,
  "",
  "| Bug | Category | Severity | Caught | Failing tests |",
  "| --- | --- | --- | --- | --- |",
  ...results.map(
    (r) =>
      `| \`${r.id}\` ${r.title} | ${r.category} | ${r.severity} | ${r.caught ? "✅ yes" : "❌ no"} | ${r.failingTests.length} |`,
  ),
  "",
].join("\n");
writeFileSync(join(outDir, "bug-hunt.md"), md);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);

console.log(`\n${md}`);

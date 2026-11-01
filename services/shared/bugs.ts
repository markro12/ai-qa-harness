// Planted-bug switches.
// Set PLANTED_BUGS to a comma-separated list of bug IDs from bugs/catalog.json.
// With PLANTED_BUGS unset, every service behaves correctly.
import catalog from "../../bugs/catalog.json" with { type: "json" };

export type BugId = (typeof catalog)[number]["id"];

const known = new Set<string>(catalog.map((b) => b.id));
const enabled = new Set(
  (process.env.PLANTED_BUGS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

for (const id of enabled) {
  if (!known.has(id)) {
    throw new Error(`Unknown planted bug "${id}". See bugs/catalog.json.`);
  }
}
if (enabled.size > 0) {
  console.warn(`[planted-bugs] enabled: ${[...enabled].join(", ")}`);
}

export const bug = (id: BugId): boolean => enabled.has(id);

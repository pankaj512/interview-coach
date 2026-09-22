// shape-004 (ListNode,ListNode,)->ListNode - shared shape runner (feature 18a.2, generated).
// Pure call: actual = JSON-encoded return. The submission exports `subject`
// (the entry free function) via the appended export shim.
const nodes = require("./nodes");
const submission = require("./submission");
const { parseArgs } = require("./samples");
const fs = require("fs");

function main() {
  const cases = JSON.parse(fs.readFileSync("cases.json", "utf8"));
  for (const kase of cases) {
    const name = kase.name;
    try {
      const args = parseArgs(kase.input);
      args[0] = nodes.arrayToList(args[0]);
      args[1] = nodes.arrayToList(args[1]);
      const ret = submission.subject(...args);
      const actual = nodes.listToArray(ret);
      console.log(JSON.stringify({ name, actual }, (k, v) => (v === undefined ? null : v)));
    } catch (e) {
      const label = e instanceof Error ? `${e.name}: ${e.message}` : `Thrown: ${String(e)}`;
      console.log(JSON.stringify({ name, error: label }));
    }
  }
}

main();

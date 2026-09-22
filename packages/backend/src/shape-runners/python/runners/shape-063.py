# shape-063 (list[int],list[int],)->TreeNode | None - shared shape runner (feature 18a.1, generated).
# Pure call: actual = JSON-encoded return. `__CLASS__`/`__ENTRY__` are baked
# per problem by `assemblePythonRun`.
import json

import nodes
import submission
from samples import parse_args, to_jsonable


def main():
    with open("cases.json", encoding="utf-8") as fh:
        cases = json.load(fh)
    for case in cases:
        name = case["name"]
        try:
            args = parse_args(case["input"])
            pass
            obj = submission.__CLASS__()
            ret = obj.__ENTRY__(*args)
            actual = to_jsonable(nodes.tree_to_array(ret))
            print(json.dumps({"name": name, "actual": actual}))
        except Exception as e:  # noqa: BLE001 - per-case errors, never harness crashes
            print(json.dumps({"name": name, "error": f"{type(e).__name__}: {e}"}))


main()

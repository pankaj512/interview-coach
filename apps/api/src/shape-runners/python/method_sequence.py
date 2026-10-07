# Method-sequence runner (feature 18a.1): covers every `method-sequence` census
# link (multi-method design classes and constructor+query problems).
#
# Case inputs are the LeetCode method-call form: a JSON op-name array followed
# by a JSON arg-array array (any whitespace between them). The first op
# constructs `__CLASS__`; each later op calls that method on the instance.
# Actual = per-op result list (null for void ops), compared against the JSON
# sample output. `__CLASS__` is baked per problem by `assemblePythonRun`.

import json

import submission


def main():
    with open("cases.json", encoding="utf-8") as fh:
        cases = json.load(fh)
    decoder = json.JSONDecoder()
    for case in cases:
        name = case["name"]
        try:
            raw = case["input"]
            ops, idx = decoder.raw_decode(raw)
            # raw_decode does not skip leading whitespace (unlike loads).
            argsets, _ = decoder.raw_decode(raw[idx:].lstrip())
            if not isinstance(ops, list) or not isinstance(argsets, list):
                raise ValueError("method-sequence input is not [ops, argsets]")
            if not ops or len(ops) != len(argsets):
                raise ValueError("op/argset length mismatch")
            obj = getattr(submission, "__CLASS__")(*argsets[0])
            results = [None]
            for op, args in zip(ops[1:], argsets[1:]):
                results.append(getattr(obj, op)(*args))
            print(json.dumps({"name": name, "actual": results}))
        except Exception as e:  # noqa: BLE001 - per-case errors, never harness crashes
            print(json.dumps({"name": name, "error": f"{type(e).__name__}: {e}"}))


main()

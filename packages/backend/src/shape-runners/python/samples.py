# Shared sample-input parsing for the Python shape runners (feature 18a.1).
#
# Sample inputs are LeetCode `name = value, ...` strings. Wrapping them as the
# keyword arguments of a fake call lets `ast` do the splitting; each value
# must be a Python literal, otherwise the case is a per-case error (never a
# harness crash). Non-literal samples (e.g. `_` placeholders) are reported as
# errors so the gate treats those cases as execution-only.

import ast


def parse_args(input_str):
    """Parse a `name = value, ...` sample input into a positional value list."""
    try:
        tree = ast.parse(f"f({input_str})", mode="eval")
    except SyntaxError as e:
        raise ValueError(f"cannot parse sample input: {e}")
    call = tree.body
    if not isinstance(call, ast.Call) or call.args:
        raise ValueError("sample input is not name=value pairs")
    out = []
    for kw in call.keywords:
        if kw.arg is None:
            raise ValueError("sample input uses ** unpacking")
        try:
            out.append(ast.literal_eval(kw.value))
        except (ValueError, SyntaxError, MemoryError, RecursionError) as e:
            raise ValueError(f"non-literal sample value for {kw.arg}: {e}")
    return out


def to_jsonable(value):
    """Convert literal-eval results (tuples, sets) to JSON-serializable form."""
    if isinstance(value, tuple):
        return [to_jsonable(v) for v in value]
    if isinstance(value, (list,)):
        return [to_jsonable(v) for v in value]
    if isinstance(value, (set, frozenset)):
        try:
            return sorted(value)
        except TypeError:
            return [to_jsonable(v) for v in value]
    if isinstance(value, dict):
        return {k: to_jsonable(v) for k, v in value.items()}
    return value

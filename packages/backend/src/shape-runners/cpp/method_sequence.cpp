// covers every `method-sequence` census link (multi-method design classes and
// constructor+query problems). Include order: VALUE_PRELUDE (Value), nodes.h,
// submission.cpp, this main. The class name is baked per problem by
// the assembler; the case bodies carry the per-problem embedded ops/argsets.
// Each case defines `ops` (vector<string>) and `argsets` (vector<Value>, one
// array-Value per op); the pasted fragment from method_dispatch.json fills
// `results` (one Value per op, null for void ops).
#include "nodes.h"
#include "submission.cpp"
#include <stdexcept>
#include <string>
#include <vector>

int main() {
__CASES__
  return 0;
}

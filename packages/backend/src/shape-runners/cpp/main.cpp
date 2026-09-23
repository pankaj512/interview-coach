// Shared main template for every pure/in-place C++ shape runner (feature 18a.3).
// Include order: VALUE_PRELUDE (Value), nodes.h, submission.cpp, this main.
// Class/entry names need no substitution here; the case bodies carry the
// per-problem embedded Value literals and are spliced into the main body
// below by the assembler.
#include "nodes.h"
#include "submission.cpp"

int main() {
__CASES__
  return 0;
}

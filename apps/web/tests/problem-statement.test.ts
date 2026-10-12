// Problem statement splitter tests: paragraph and judge-code
// classification on the stored plain-text shape. No DOM, no network.
import { describe, expect, it } from "vitest";
import { splitStatement } from "../src/components/problem-statement.js";

const REMOVE_DUPLICATES =
  "Given an integer array nums sorted in non-decreasing order, remove the duplicates in-place.\n\n" +
  "Consider the number of unique elements in nums to be k. After removing duplicates, return k.\n\n" +
  "Custom Judge:\n\n" +
  "The judge will test your solution with the following code:\n\n" +
  "int[] nums = [...]; // Input array\nint[] expectedNums = [...]; // The expected answer\n\nint k = removeDuplicates(nums); // Calls your implementation\n\nassert k == expectedNums.length;\nfor (int i = 0; i < k; i++) {\n    assert nums[i] == expectedNums[i];\n}";

describe("splitStatement", () => {
  it("splits blank-line-separated prose into one block per paragraph", () => {
    const blocks = splitStatement("First paragraph.\n\nSecond paragraph.");
    expect(blocks).toEqual([
      { kind: "prose", text: "First paragraph." },
      { kind: "prose", text: "Second paragraph." },
    ]);
  });

  it("keeps constraint-like prose out of code blocks", () => {
    const blocks = splitStatement("1 <= nums.length <= 3 * 10^4\n\nnums is sorted.");
    expect(blocks.every((block) => block.kind === "prose")).toBe(true);
  });

  it("classifies the judge snippet as code and prose around it as prose", () => {
    const blocks = splitStatement(REMOVE_DUPLICATES);
    expect(blocks.map((block) => block.kind)).toEqual([
      "prose",
      "prose",
      "prose",
      "prose",
      "code",
      "code",
      "code",
    ]);
    expect(blocks[4]).toEqual({
      kind: "code",
      text: "int[] nums = [...]; // Input array\nint[] expectedNums = [...]; // The expected answer",
    });
  });

  it("ignores empty paragraphs and carriage returns", () => {
    const blocks = splitStatement("A.\r\n\r\n\r\nB.");
    expect(blocks).toEqual([
      { kind: "prose", text: "A." },
      { kind: "prose", text: "B." },
    ]);
  });
});

// Shared node-type prelude for the JavaScript shape runners (feature 18a.2).
//
// LeetCode presents linked lists and binary trees as JSON arrays (list values
// in order; level-order with null for missing children). These definitions
// mirror the commented-out stubs in the cached starters (`val`/`next`,
// `val`/`left`/`right`) so candidate code written against the verbatim
// starters runs unchanged. Codec semantics mirror python/nodes.py exactly:
// decode of [] / null is null; encode of a null root is [].

class ListNode {
  constructor(val = 0, next = null) {
    this.val = val;
    this.next = next;
  }
}

class TreeNode {
  constructor(val = 0, left = null, right = null) {
    this.val = val;
    this.left = left;
    this.right = right;
  }
}

function arrayToList(values) {
  if (!values || values.length === 0) return null;
  const head = new ListNode(values[0]);
  let cur = head;
  for (let i = 1; i < values.length; i++) {
    cur.next = new ListNode(values[i]);
    cur = cur.next;
  }
  return head;
}

function listToArray(head) {
  const out = [];
  let cur = head;
  while (cur !== null && cur !== undefined) {
    out.push(cur.val);
    cur = cur.next;
  }
  return out;
}

function arrayToTree(values) {
  if (!values || values.length === 0 || values[0] === null || values[0] === undefined) {
    return null;
  }
  const root = new TreeNode(values[0]);
  const queue = [root];
  let i = 1;
  while (queue.length > 0 && i < values.length) {
    const node = queue.shift();
    for (const side of ["left", "right"]) {
      if (i >= values.length) break;
      if (values[i] !== null && values[i] !== undefined) {
        const child = new TreeNode(values[i]);
        node[side] = child;
        queue.push(child);
      }
      i += 1;
    }
  }
  return root;
}

function treeToArray(root) {
  if (root === null || root === undefined) return [];
  const out = [];
  const queue = [root];
  while (queue.length > 0) {
    const node = queue.shift();
    if (node === null || node === undefined) {
      out.push(null);
      continue;
    }
    out.push(node.val);
    queue.push(node.left ?? null, node.right ?? null);
  }
  while (out.length > 0 && out[out.length - 1] === null) out.pop();
  return out;
}

module.exports = { ListNode, TreeNode, arrayToList, listToArray, arrayToTree, treeToArray };

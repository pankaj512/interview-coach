# Shared node-type prelude for the Python shape runners (feature 18a.1).
#
# LeetCode presents linked lists and binary trees as JSON arrays (list values
# in order; level-order with null for missing children). These definitions
# mirror the commented-out stubs in the cached starters (`val`/`next`,
# `val`/`left`/`right`) so candidate `Solution` code written against the
# verbatim starters runs unchanged. Every runner prepends this file to the
# candidate submission; only `decode_*`/`encode_*` cross the JSON boundary.

from collections import deque


class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next


class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right


def array_to_list(values):
    """Decode a JSON array (or null) to a ListNode chain. [] / None -> None."""
    if not values:
        return None
    head = ListNode(values[0])
    cur = head
    for v in values[1:]:
        cur.next = ListNode(v)
        cur = cur.next
    return head


def list_to_array(head):
    """Encode a ListNode chain to a JSON array. None -> []."""
    out = []
    cur = head
    while cur is not None:
        out.append(cur.val)
        cur = cur.next
    return out


def array_to_tree(values):
    """Decode a level-order JSON array (null = missing child) to a TreeNode.
    [] / None -> None."""
    if not values:
        return None
    root = TreeNode(values[0]) if values[0] is not None else None
    if root is None:
        return None
    queue = deque([root])
    i = 1
    while queue and i < len(values):
        node = queue.popleft()
        for side in ("left", "right"):
            if i >= len(values):
                break
            if values[i] is not None:
                child = TreeNode(values[i])
                setattr(node, side, child)
                queue.append(child)
            i += 1
    return root


def tree_to_array(root):
    """Encode a TreeNode to a level-order JSON array with trailing nulls
    trimmed. None -> []."""
    if root is None:
        return []
    out = []
    queue = deque([root])
    while queue:
        node = queue.popleft()
        if node is None:
            out.append(None)
            continue
        out.append(node.val)
        queue.append(node.left)
        queue.append(node.right)
    while out and out[-1] is None:
        out.pop()
    return out

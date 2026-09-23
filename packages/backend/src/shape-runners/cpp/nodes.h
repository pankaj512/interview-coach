// Shared node structs and codecs for the C++ shape runners (feature 18a.3).
//
// The census guarantees no linked starter carries an ACTIVE ListNode/TreeNode
// struct definition (active definitions are gap:node-struct, of which the
// frozen census has zero): starter structs appear only inside comments. This
// header therefore provides the standard definitions plus the Value codecs.
// Include order in the assembled main.cpp: VALUE_PRELUDE, this header,
// submission.cpp (starter class), runner main. Empty inputs (null or [])
// decode to nullptr and nullptr encodes to [] (LeetCode empty-list/tree form).

#pragma once

#include <queue>

struct ListNode {
  int val;
  ListNode* next;
  ListNode() : val(0), next(nullptr) {}
  ListNode(int x) : val(x), next(nullptr) {}
  ListNode(int x, ListNode* next) : val(x), next(next) {}
};

struct TreeNode {
  int val;
  TreeNode* left;
  TreeNode* right;
  TreeNode() : val(0), left(nullptr), right(nullptr) {}
  TreeNode(int x) : val(x), left(nullptr), right(nullptr) {}
  TreeNode(int x, TreeNode* left, TreeNode* right) : val(x), left(left), right(right) {}
};

// node: ranges/iterators
inline ListNode* arrayToList(const Value& v) {
  if (v.t != Value::T::Arr || v.a.empty()) return nullptr;
  ListNode* head = new ListNode(static_cast<int>(v.a[0].n));
  ListNode* cur = head;
  for (size_t i = 1; i < v.a.size(); i++) {
    cur->next = new ListNode(static_cast<int>(v.a[i].n));
    cur = cur->next;
  }
  return head;
}

inline Value listToArray(const ListNode* head) {
  std::vector<Value> out;
  for (const ListNode* cur = head; cur != nullptr; cur = cur->next) {
    out.push_back(Value(cur->val));
  }
  return Value(out);
}

inline TreeNode* arrayToTree(const Value& v) {
  if (v.t != Value::T::Arr || v.a.empty()) return nullptr;
  if (v.a[0].t == Value::T::Null) return nullptr;
  TreeNode* root = new TreeNode(static_cast<int>(v.a[0].n));
  std::queue<TreeNode*> q;
  q.push(root);
  size_t i = 1;
  while (!q.empty() && i < v.a.size()) {
    TreeNode* cur = q.front();
    q.pop();
    if (i < v.a.size() && v.a[i].t != Value::T::Null) {
      cur->left = new TreeNode(static_cast<int>(v.a[i].n));
      q.push(cur->left);
    }
    i++;
    if (i < v.a.size() && v.a[i].t != Value::T::Null) {
      cur->right = new TreeNode(static_cast<int>(v.a[i].n));
      q.push(cur->right);
    }
    i++;
  }
  return root;
}

inline Value treeToArray(const TreeNode* root) {
  std::vector<Value> out;
  if (root == nullptr) return Value(out);
  std::queue<const TreeNode*> q;
  q.push(root);
  while (!q.empty()) {
    const TreeNode* cur = q.front();
    q.pop();
    if (cur == nullptr) {
      out.push_back(Value());
      continue;
    }
    out.push_back(Value(cur->val));
    q.push(cur->left);
    q.push(cur->right);
  }
  while (!out.empty() && out.back().t == Value::T::Null) out.pop_back();
  return Value(out);
}

// Value<->STL conversions for plain (non-node) params and returns.
inline std::vector<int> valueToIntVec(const Value& v) {
  std::vector<int> out;
  for (size_t i = 0; i < v.a.size(); i++) out.push_back(static_cast<int>(v.a[i].n));
  return out;
}

inline std::vector<std::string> valueToStrVec(const Value& v) {
  std::vector<std::string> out;
  for (size_t i = 0; i < v.a.size(); i++) out.push_back(v.a[i].s);
  return out;
}

inline std::vector<std::vector<int>> valueToIntVec2D(const Value& v) {
  std::vector<std::vector<int>> out;
  for (size_t i = 0; i < v.a.size(); i++) out.push_back(valueToIntVec(v.a[i]));
  return out;
}

inline Value intVecToValue(const std::vector<int>& xs) {
  std::vector<Value> out;
  for (size_t i = 0; i < xs.size(); i++) out.push_back(Value(xs[i]));
  return Value(out);
}

inline Value strVecToValue(const std::vector<std::string>& xs) {
  std::vector<Value> out;
  for (size_t i = 0; i < xs.size(); i++) out.push_back(Value(xs[i]));
  return Value(out);
}

inline Value intVec2DToValue(const std::vector<std::vector<int>>& xss) {
  std::vector<Value> out;
  for (size_t i = 0; i < xss.size(); i++) out.push_back(intVecToValue(xss[i]));
  return Value(out);
}

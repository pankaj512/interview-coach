// Self-hosted Monaco workers for Vite (no CDN).
//
// Owns: the worker wiring behind the editor. Surprising: explicit relative
// imports because monaco-editor's exports map hides the esm/vs files;
// client-only import so unit tests never load Monaco in Node.
//
// History: 17b; see docs/SESSION_HANDOFF.md.
import CssWorker from "../../node_modules/monaco-editor/esm/vs/language/css/css.worker.js?worker";
import EditorWorker from "../../node_modules/monaco-editor/esm/vs/editor/editor.worker.js?worker";
import HtmlWorker from "../../node_modules/monaco-editor/esm/vs/language/html/html.worker.js?worker";
import JsonWorker from "../../node_modules/monaco-editor/esm/vs/language/json/json.worker.js?worker";
import TsWorker from "../../node_modules/monaco-editor/esm/vs/language/typescript/ts.worker.js?worker";

self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === "json") return new JsonWorker();
    if (label === "css" || label === "scss" || label === "less") return new CssWorker();
    if (label === "html" || label === "handlebars" || label === "razor") return new HtmlWorker();
    if (label === "typescript" || label === "javascript") return new TsWorker();
    return new EditorWorker();
  },
};

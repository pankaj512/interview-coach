// Self-hosted Monaco workers for Vite (no CDN), following the official
// browser-esm-vite-react sample: https://github.com/microsoft/monaco-editor/tree/main/samples/browser-esm-vite-react
//
// The workers are imported via explicit relative paths because
// monaco-editor's `exports` map does not expose the `esm/vs/*` files to
// bundler resolution. Relative file imports bypass package exports.
// Dynamically imported from CodeWorkspace (client-only) so unit tests never
// load Monaco in Node.
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

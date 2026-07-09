import { JSDOM } from "jsdom";
import { AppComponent } from "../../../src/renderer/components/app-component.js";
import { createFileServiceMock, createCorrectionsServiceMock } from "../../helpers/service-mocks.js";
import { loadRendererTemplates, createTemplateFetch } from "../../helpers/template-mocks.js";

export function applyDomGlobals(dom) {
  global.window = dom.window;
  global.document = dom.window.document;
  global.Window = dom.window.Window;
  global.MutationObserver = dom.window.MutationObserver;
  global.HTMLElement = dom.window.HTMLElement;
  global.Node = dom.window.Node;
  global.getComputedStyle = dom.window.getComputedStyle;
  global.requestAnimationFrame = dom.window.requestAnimationFrame;
  global.cancelAnimationFrame = dom.window.cancelAnimationFrame;
  if (dom.window.Range && !dom.window.Range.prototype.getClientRects) {
    dom.window.Range.prototype.getClientRects = () => [];
  }
}

export async function setupApp({ fileServiceOverrides, correctionsServiceOverrides } = {}) {
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
    url: "http://localhost/",
    pretendToBeVisual: true
  });
  applyDomGlobals(dom);
  const { document } = dom.window;

  const templates = await loadRendererTemplates();
  global.fetch = createTemplateFetch(templates);

  const fileService = createFileServiceMock(fileServiceOverrides);
  const correctionsService = createCorrectionsServiceMock(correctionsServiceOverrides);
  const app = new AppComponent({
    mountEl: document.getElementById("root"),
    window: dom.window,
    fileService,
    correctionsService
  });

  await app.init();

  return { dom, document, app };
}

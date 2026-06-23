export async function checkGrammar(text) {
  if (!window.api?.checkGrammar) {
    return { issues: [], error: "Grammar API unavailable" };
  }

  return window.api.checkGrammar(text ?? "");
}

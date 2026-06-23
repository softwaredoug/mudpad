export async function analyzeWithLlm(text) {
  if (!window.api?.analyzeWithLlm) {
    return { issues: [], error: "LLM API unavailable" };
  }

  return window.api.analyzeWithLlm(text ?? "");
}

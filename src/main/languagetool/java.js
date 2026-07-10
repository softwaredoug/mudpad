import path from "path";
import fs from "fs/promises";

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function resolveJavaCommand({
  resourcesPath = process.resourcesPath,
  platform = process.platform,
  arch = process.arch
} = {}) {
  const bundledJava = resolveBundledJava(resourcesPath, platform, arch);
  if (bundledJava && await exists(bundledJava)) {
    return bundledJava;
  }

  const error = new Error(
    `Bundled Java runtime not found${bundledJava ? ` at ${bundledJava}` : "."}`
  );
  error.code = "BUNDLED_JAVA_MISSING";
  throw error;
}

export function resolveBundledJava(resourcesPath, platform = process.platform, arch = process.arch) {
  if (!resourcesPath || platform !== "darwin") {
    return null;
  }
  const bundledArch = arch === "arm64" ? "arm64" : arch === "x64" ? "x64" : null;
  if (!bundledArch) {
    return null;
  }
  return path.join(resourcesPath, "jre", bundledArch, "bin", "java");
}

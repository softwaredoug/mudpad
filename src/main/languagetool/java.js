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
  arch = process.arch,
  developmentResourcesPath = resolveDevelopmentResourcesPath()
} = {}) {
  const resourcePaths = [resourcesPath, developmentResourcesPath]
    .filter(Boolean)
    .filter((candidate, index, paths) => paths.indexOf(candidate) === index);
  for (const candidate of resourcePaths) {
    const bundledJava = resolveBundledJava(candidate, platform, arch);
    if (bundledJava && await exists(bundledJava)) {
      return bundledJava;
    }
  }

  const expectedPaths = resourcePaths
    .map((candidate) => resolveBundledJava(candidate, platform, arch))
    .filter(Boolean)
    .join(" or ");
  const error = new Error(
    `Bundled Java runtime not found${expectedPaths ? ` at ${expectedPaths}` : "."}`
  );
  error.code = "BUNDLED_JAVA_MISSING";
  throw error;
}

function resolveDevelopmentResourcesPath() {
  if (!process.defaultApp && !process.env.VITE_DEV_SERVER_URL) {
    return null;
  }
  return path.join(process.cwd(), "resources");
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

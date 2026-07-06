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

async function findAsdfJava(installsDir) {
  if (!(await exists(installsDir))) {
    return null;
  }

  const entries = await fs.readdir(installsDir, { withFileTypes: true });
  const versions = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();

  for (const version of versions) {
    const candidate = path.join(installsDir, version, "bin", "java");
    if (await exists(candidate)) {
      return candidate;
    }
  }

  return null;
}

export async function resolveJavaCommand() {
  const explicitJava = process.env.LANGUAGETOOL_JAVA;
  if (explicitJava && (await exists(explicitJava))) {
    return explicitJava;
  }

  const javaHome = process.env.JAVA_HOME;
  if (javaHome) {
    const javaBin = path.join(javaHome, "bin", "java");
    if (await exists(javaBin)) {
      return javaBin;
    }
  }

  if (process.platform === "darwin") {
    try {
      const { execFile } = await import("child_process");
      const { promisify } = await import("util");
      const execFileAsync = promisify(execFile);
      const { stdout } = await execFileAsync("/usr/libexec/java_home");
      const resolvedHome = stdout.trim();
      if (resolvedHome) {
        const javaBin = path.join(resolvedHome, "bin", "java");
        if (await exists(javaBin)) {
          return javaBin;
        }
      }
    } catch {
      // Fall through to PATH lookup.
    }
  }

  const homeDir = process.env.HOME;
  if (homeDir) {
    const asdfJava = await findAsdfJava(path.join(homeDir, ".asdf", "installs", "java"));
    if (asdfJava) {
      return asdfJava;
    }
  }

  return "java";
}

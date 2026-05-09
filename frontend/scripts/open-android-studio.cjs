const fs = require("fs");
const path = require("path");
const { execFileSync, spawn } = require("child_process");

const projectRoot = path.resolve(__dirname, "..");
const androidProjectPath = path.join(projectRoot, "android");

function getEnvCandidate() {
  const envPath = process.env.CAPACITOR_ANDROID_STUDIO_PATH;
  return envPath ? [envPath] : [];
}

function getStaticCandidates() {
  const localAppData = process.env.LOCALAPPDATA || "";

  return [
    "C:\\Program Files\\Android\\Android Studio\\bin\\studio64.exe",
    "C:\\Program Files\\Android\\Android Studio\\bin\\studio.exe",
    "C:\\Program Files (x86)\\Android\\Android Studio\\bin\\studio64.exe",
    "C:\\Program Files (x86)\\Android\\Android Studio\\bin\\studio.exe",
    path.join(localAppData, "Programs", "Android Studio", "bin", "studio64.exe"),
    path.join(localAppData, "Programs", "Android Studio", "bin", "studio.exe")
  ].filter(Boolean);
}

function normalizeCandidate(candidate) {
  if (!candidate || typeof candidate !== "string") {
    return [];
  }

  const cleaned = candidate.trim().replace(/^"|"$/g, "");

  if (!cleaned) {
    return [];
  }

  const normalized = cleaned.replace(/\//g, "\\");
  const results = [normalized];

  if (fs.existsSync(normalized) && fs.statSync(normalized).isDirectory()) {
    results.push(path.join(normalized, "bin", "studio64.exe"));
    results.push(path.join(normalized, "bin", "studio.exe"));
  } else if (normalized.toLowerCase().endsWith("\\studio.exe")) {
    results.push(normalized.slice(0, -10) + "studio64.exe");
  }

  return results;
}

function getRegistryCandidates() {
  if (process.platform !== "win32") {
    return [];
  }

  const script = `
    $keys = @(
      'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
      'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
      'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
    )
    Get-ItemProperty $keys -ErrorAction SilentlyContinue |
      Where-Object { $_.DisplayName -like '*Android Studio*' } |
      ForEach-Object {
        if ($_.DisplayIcon) { $_.DisplayIcon }
        if ($_.InstallLocation) { $_.InstallLocation }
      }
  `;

  try {
    const output = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-Command", script],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    );

    return output
      .split(/\r?\n/)
      .flatMap((line) => normalizeCandidate(line))
      .filter(Boolean);
  } catch (error) {
    return [];
  }
}

function findInToolbox() {
  const toolboxRoot = path.join(
    process.env.LOCALAPPDATA || "",
    "JetBrains",
    "Toolbox",
    "apps",
    "AndroidStudio"
  );

  if (!fs.existsSync(toolboxRoot)) {
    return null;
  }

  const channels = fs.readdirSync(toolboxRoot, { withFileTypes: true }).filter((entry) =>
    entry.isDirectory()
  );

  for (const channel of channels) {
    const channelPath = path.join(toolboxRoot, channel.name);
    const versions = fs.readdirSync(channelPath, { withFileTypes: true }).filter((entry) =>
      entry.isDirectory()
    );

    for (const version of versions.reverse()) {
      const executable = path.join(channelPath, version.name, "bin", "studio64.exe");
      if (fs.existsSync(executable)) {
        return executable;
      }
    }
  }

  return null;
}

function resolveAndroidStudioPath() {
  const candidates = [
    ...getEnvCandidate(),
    ...getStaticCandidates(),
    ...getRegistryCandidates()
  ];

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return findInToolbox();
}

function printMissingStudioHelp() {
  const installHint =
    "C:\\Program Files\\Android\\Android Studio\\bin\\studio64.exe";

  console.error("[error] Android Studio nao foi encontrado.");
  console.error("");
  console.error("O projeto Android ja foi gerado em:");
  console.error(androidProjectPath);
  console.error("");
  console.error("Proximos passos:");
  console.error("1. Instale o Android Studio.");
  console.error("2. Ou defina a variavel CAPACITOR_ANDROID_STUDIO_PATH com o executavel.");
  console.error("");
  console.error("Exemplo no PowerShell:");
  console.error(
    `[Environment]::SetEnvironmentVariable("CAPACITOR_ANDROID_STUDIO_PATH", "${installHint}", "User")`
  );
  console.error("");
  console.error("Depois reabra o terminal e rode:");
  console.error("npm run cap:open:android");
  process.exitCode = 1;
}

function openAndroidStudio(executablePath) {
  const child = spawn(executablePath, [androidProjectPath], {
    detached: true,
    stdio: "ignore"
  });

  child.unref();
  console.log(`Android Studio aberto com o projeto: ${androidProjectPath}`);
}

if (!fs.existsSync(androidProjectPath)) {
  console.error("[error] Projeto Android nao encontrado. Rode primeiro: npm run cap:add:android");
  process.exit(1);
}

const studioPath = resolveAndroidStudioPath();

if (!studioPath) {
  printMissingStudioHelp();
} else {
  openAndroidStudio(studioPath);
}

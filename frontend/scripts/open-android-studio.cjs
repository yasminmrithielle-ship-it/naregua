const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

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
  const candidates = [...getEnvCandidate(), ...getStaticCandidates()];

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

const { spawnSync } = require("node:child_process");

if (process.env.PUPPETEER_SKIP_DOWNLOAD === "true") {
  console.log("Pulando download do Chrome do Puppeteer.");
  process.exit(0);
}

const result = spawnSync("npx", ["puppeteer", "browsers", "install", "chrome"], {
  stdio: "inherit",
  shell: process.platform === "win32"
});

process.exit(result.status || 0);

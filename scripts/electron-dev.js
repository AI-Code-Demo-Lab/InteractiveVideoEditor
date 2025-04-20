const { spawn } = require("child_process");
const electron = require("electron");
const http = require("http");
const fs = require("fs");
const path = require("path");

// 等待指定的毫秒数
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 检查 URL 是否可访问
function checkUrl(url) {
  return new Promise((resolve) => {
    http
      .get(url, (res) => {
        res.on("data", () => {});
        res.on("end", () => {
          resolve(res.statusCode === 200);
        });
      })
      .on("error", () => {
        resolve(false);
      });
  });
}

// 主函数
async function main() {
  console.log("Waiting for Vite development server to start...");

  // 等待 Vite 服务器启动
  await sleep(2000);

  // 尝试常见的 Vite 端口
  const ports = [3002, 3001, 3000, 3003, 3004, 3005];
  let vitePort = null;

  for (const port of ports) {
    const url = `http://localhost:${port}`;
    console.log(`Checking if Vite is running on ${url}...`);
    if (await checkUrl(url)) {
      vitePort = port;
      console.log(`Vite development server found on port ${vitePort}`);
      break;
    }
  }

  if (vitePort === null) {
    console.error(
      "Could not find a running Vite server. Make sure Vite is running."
    );
    process.exit(1);
  }

  // 设置环境变量
  process.env.VITE_DEV_SERVER_URL = `http://localhost:${vitePort}`;

  // 启动 Electron
  console.log("Starting Electron...");
  const electronProcess = spawn(electron, ["."], {
    stdio: "inherit",
    env: { ...process.env },
  });

  electronProcess.on("close", (code) => {
    process.exit(code);
  });
}

main().catch((err) => {
  console.error("Error starting electron:", err);
  process.exit(1);
});

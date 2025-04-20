const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// 确保输出目录存在
const mainDist = path.join(__dirname, "../dist/main");
if (!fs.existsSync(mainDist)) {
  fs.mkdirSync(mainDist, { recursive: true });
}

// 复制主进程文件到 dist 目录
function copyMainFiles() {
  const mainSrc = path.join(__dirname, "../src/main");

  // 递归复制所有文件
  function copyDir(src, dest) {
    // 如果目标目录不存在，创建它
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    // 读取源目录中的所有文件和目录
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      // 如果是目录，递归复制
      if (entry.isDirectory()) {
        copyDir(srcPath, destPath);
      } else {
        // 复制文件
        fs.copyFileSync(srcPath, destPath);
        console.log(`已复制: ${srcPath} -> ${destPath}`);
      }
    }
  }

  // 开始复制
  copyDir(mainSrc, mainDist);
  console.log("主进程文件已复制到 dist/main 目录");
}

// 执行复制
copyMainFiles();

console.log("Electron 主进程构建完成!");

const { app, BrowserWindow, ipcMain, Menu, dialog } = require("electron");
const path = require("path");
const isDev = require("electron-is-dev");
const fs = require("fs");

let mainWindow;
let currentFilePath = null; // 存储当前打开的文件路径

async function createWindow() {
  // 创建浏览器窗口
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      // 允许webview
      webviewTag: true,
      // 增强安全设置
      sandbox: true,
    },
  });

  // 阻止窗口导航
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const fileProtocolRegex = /^file:\/\//;
    // 阻止所有导航，特别是文件协议
    console.log("阻止导航:", url);
    event.preventDefault();
  });

  // 处理新窗口创建
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: "deny" };
  });

  // 加载应用
  if (isDev) {
    // 从环境变量中获取开发服务器 URL，或使用默认端口
    const devServerUrl =
      process.env.VITE_DEV_SERVER_URL || "http://localhost:3000";
    console.log(`Loading URL: ${devServerUrl}`);
    await mainWindow.loadURL(devServerUrl);
  } else {
    // 生产环境使用打包后的文件
    mainWindow.loadURL(
      `file://${path.join(__dirname, "../renderer/index.html")}`
    );
  }

  // 打开开发工具
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // 当窗口关闭时触发
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // 创建并设置应用菜单
  createMenu();
}

// 创建应用菜单
function createMenu() {
  const isMac = process.platform === "darwin";

  const template = [
    {
      label: "文件",
      submenu: [
        {
          label: "新建",
          accelerator: "CmdOrCtrl+N",
          click: () => createNewFile(),
        },
        {
          label: "打开",
          accelerator: "CmdOrCtrl+O",
          click: () => openFile(),
        },
        {
          label: "保存",
          accelerator: "CmdOrCtrl+S",
          click: () => saveFile(),
        },
        {
          label: "另存为",
          accelerator: "CmdOrCtrl+Shift+S",
          click: () => saveFileAs(),
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    {
      label: "功能",
      submenu: [
        {
          label: "打包",
          accelerator: "CmdOrCtrl+E",
          click: () => exportPackage(),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// 新建文件
function createNewFile() {
  if (!mainWindow) return;

  // 如果有未保存的更改，可以添加提示
  // 这里简单实现，直接发送消息给渲染进程
  currentFilePath = null; // 清除当前文件路径
  mainWindow.webContents.send("create-new-file");
}

// 打开文件
async function openFile() {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: "打开项目文件",
      filters: [
        { name: "交互式视频文件", extensions: ["ive"] },
        { name: "所有文件", extensions: ["*"] },
      ],
      properties: ["openFile"],
    });

    if (!canceled && filePaths.length > 0) {
      const filePath = filePaths[0];
      const data = fs.readFileSync(filePath, "utf8");

      // 设置当前文件路径
      currentFilePath = filePath;

      // 向渲染进程发送数据
      if (mainWindow) {
        mainWindow.webContents.send("file-opened", {
          filePath,
          data: JSON.parse(data),
        });
      }
    }
  } catch (error) {
    console.error("打开文件出错:", error);
    dialog.showErrorBox("错误", `无法打开文件: ${error.message}`);
  }
}

// 保存文件
async function saveFile() {
  if (!mainWindow) return;

  // 请求渲染进程提供要保存的数据
  mainWindow.webContents.send("request-save-data");
}

// 另存为
async function saveFileAs() {
  if (!mainWindow) return;

  // 请求渲染进程提供要保存的数据
  mainWindow.webContents.send("request-save-as-data");
}

// 实际执行保存操作
async function performSave(data, forceDialog = false) {
  try {
    let filePath = currentFilePath;

    // 如果还没有文件路径或请求另存为，打开保存对话框
    if (!filePath || forceDialog) {
      const { canceled, filePath: selectedPath } = await dialog.showSaveDialog({
        title: "保存项目文件",
        defaultPath: filePath || "untitled.ive",
        filters: [
          { name: "交互式视频文件", extensions: ["ive"] },
          { name: "所有文件", extensions: ["*"] },
        ],
      });

      if (canceled) return;
      filePath = selectedPath;
    }

    // 确保文件扩展名是.ive
    if (!filePath.toLowerCase().endsWith(".ive")) {
      filePath += ".ive";
    }

    // 保存文件
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");

    // 更新当前文件路径
    currentFilePath = filePath;

    // 通知渲染进程保存成功
    if (mainWindow) {
      mainWindow.webContents.send("file-saved", { filePath });
    }

    return { success: true, filePath };
  } catch (error) {
    console.error("保存文件出错:", error);
    dialog.showErrorBox("错误", `无法保存文件: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// 导出打包功能
async function exportPackage() {
  if (!mainWindow) return;

  try {
    // 选择导出目录
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: "选择导出目录",
      properties: ["openDirectory", "createDirectory"],
    });

    if (canceled || filePaths.length === 0) {
      return; // 用户取消操作
    }

    const exportDir = filePaths[0];
    console.log("导出目录：", exportDir);

    // 请求渲染进程提供需要打包的数据
    mainWindow.webContents.send("request-export-package", { exportDir });
  } catch (error) {
    console.error("打包过程出错:", error);
    dialog.showErrorBox("错误", `打包失败: ${error.message}`);
  }
}

// 当 Electron 完成初始化并准备创建浏览器窗口时调用此方法
app.whenReady().then(() => {
  createWindow();

  // 设置IPC处理器
  setupIpcHandlers();

  app.on("activate", () => {
    // 在 macOS 上，通常在应用程序图标被点击且没有其他窗口打开时重新创建窗口
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 设置IPC处理器
function setupIpcHandlers() {
  // 处理来自渲染进程的保存数据请求
  ipcMain.on("save-data", (event, data) => {
    performSave(data);
  });

  // 处理来自渲染进程的另存为数据请求
  ipcMain.on("save-as-data", (event, data) => {
    performSave(data, true);
  });

  // 处理视频文件选择请求
  ipcMain.handle("select-video-file", async () => {
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: "选择视频文件",
        filters: [
          {
            name: "视频文件",
            extensions: ["mp4", "webm", "ogg", "mov", "avi"],
          },
          { name: "所有文件", extensions: ["*"] },
        ],
        properties: ["openFile"],
      });

      if (canceled || filePaths.length === 0) {
        return { canceled: true };
      }

      const filePath = filePaths[0];
      const stats = fs.statSync(filePath);

      return {
        canceled: false,
        filePath,
        fileName: path.basename(filePath),
        fileSize: stats.size,
      };
    } catch (error) {
      console.error("选择视频文件出错:", error);
      return { canceled: true, error: error.message };
    }
  });

  // 处理打包导出请求
  ipcMain.handle("perform-export", async (event, data) => {
    try {
      const { exportDir, graphData, videoFiles } = data;

      // 确保导出目录存在
      if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir, { recursive: true });
      }

      // 创建videos子目录
      const videosDir = path.join(exportDir, "videos");
      if (!fs.existsSync(videosDir)) {
        fs.mkdirSync(videosDir, { recursive: true });
      }

      // 发送初始进度
      event.sender.send("export-progress-update", {
        progress: 10,
        message: `准备导出 ${videoFiles.length} 个视频文件...`,
      });

      // 确保进度消息能被处理
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 复制视频文件
      const videoMapping = {};
      const videoCreationTimes = {}; // 存储视频创建时间
      const totalFiles = videoFiles.length;

      for (let i = 0; i < videoFiles.length; i++) {
        const video = videoFiles[i];
        // 计算当前进度 - 从10%到70%的范围内
        const currentProgress = Math.floor(10 + (i / totalFiles) * 60);

        // 发送进度更新
        event.sender.send("export-progress-update", {
          progress: currentProgress,
          message: `正在处理视频 ${i + 1}/${totalFiles}: ${video.fileName}`,
        });

        // 确保进度消息能被处理
        await new Promise((resolve) => setTimeout(resolve, 50));

        if (video.filePath && fs.existsSync(video.filePath)) {
          // 获取文件创建时间
          try {
            const stats = fs.statSync(video.filePath);
            const creationDate = new Date(stats.birthtime);
            videoCreationTimes[video.nodeId] = creationDate.toLocaleString(
              "zh-CN",
              {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              }
            );
          } catch (statsError) {
            console.warn(`无法获取文件创建时间: ${video.filePath}`, statsError);
            videoCreationTimes[video.nodeId] = "";
          }

          // 生成一个唯一的文件名
          const uniqueFileName = `video_${Date.now()}_${Math.floor(
            Math.random() * 1000
          )}_${path.basename(video.filePath)}`;
          const targetPath = path.join(videosDir, uniqueFileName);

          // 使用Promise包装文件复制操作
          await new Promise((resolve, reject) => {
            try {
              fs.copyFileSync(video.filePath, targetPath);
              resolve();
            } catch (err) {
              reject(err);
            }
          });

          // 记录原始ID到新文件路径的映射
          videoMapping[video.nodeId] = `videos/${uniqueFileName}`;

          // 每完成一个文件就更新一次进度 - 确保最后一个文件完成时进度为70%
          let fileProgress;
          if (i === videoFiles.length - 1) {
            // 最后一个文件的进度应该是70%
            fileProgress = 70;
          } else {
            // 其他文件按比例分配10%-69%的进度
            fileProgress = Math.floor(10 + ((i + 1) / totalFiles) * 59);
          }

          // 发送"已复制"消息
          event.sender.send("export-progress-update", {
            progress: fileProgress,
            message: `已复制 ${i + 1}/${totalFiles} 个视频文件`,
          });

          // 给UI时间更新
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }

      // 所有视频处理完成后，确保UI有足够的时间更新
      if (totalFiles > 0) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      // 发送生成HTML进度
      event.sender.send("export-progress-update", {
        progress: 80,
        message: "正在生成HTML页面...",
      });

      // 给UI时间更新
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 创建HTML文件，包含播放器和交互逻辑
      const htmlContent = generatePlayerHTML(
        graphData,
        videoMapping,
        videoCreationTimes
      );
      fs.writeFileSync(
        path.join(exportDir, "index.html"),
        htmlContent,
        "utf-8"
      );

      // 发送90%进度更新，表示HTML已生成
      event.sender.send("export-progress-update", {
        progress: 90,
        message: "HTML页面已生成，正在完成最后处理...",
      });

      // 确保这个进度消息能被处理
      await new Promise((resolve) => setTimeout(resolve, 200));

      // 发送完成进度，设置为100%
      event.sender.send("export-progress-update", {
        progress: 100,
        message: "导出完成！",
      });

      // 延长等待时间，确保进度更新已经完全被处理
      await new Promise((resolve) => setTimeout(resolve, 500));

      return {
        success: true,
        message: "打包成功完成！",
        outputPath: path.join(exportDir, "index.html"),
      };
    } catch (error) {
      console.error("执行打包出错:", error);
      // 发送错误进度
      event.sender.send("export-progress-update", {
        progress: 0,
        message: `导出失败: ${error.message}`,
      });
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // 辅助函数：生成播放器HTML
  function generatePlayerHTML(
    graphData,
    videoMapping,
    videoCreationTimes = {}
  ) {
    // 创建基础HTML模板
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>交互式视频播放器</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 0;
            background-color: #000;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            width: 100%;
            overflow: hidden;
        }
        
        .video-container {
            position: relative;
            width: 100%;
            height: 100vh;
            max-height: 100vh;
            background-color: #000;
            overflow: hidden;
        }
        
        video {
            width: 100%;
            height: 100%;
            object-fit: contain;
            display: block;
        }
        
        .interactive-options {
            position: absolute;
            bottom: 80px;
            left: 0;
            width: 100%;
            display: flex;
            justify-content: center;
            flex-wrap: wrap;
            gap: 15px;
            padding: 0 20px;
            z-index: 10;
        }
        
        .option {
            background-color: rgba(75, 137, 220, 0.85);
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 16px;
            transition: all 0.3s ease;
            backdrop-filter: blur(4px);
            max-width: 400px;
            text-align: center;
        }
        
        .option:hover {
            background-color: rgba(54, 109, 192, 0.95);
            transform: translateY(-3px);
            box-shadow: 0 6px 12px rgba(0, 0, 0, 0.4);
        }
        
        /* 视频创建时间显示样式 */
        .video-creation-time {
            position: absolute;
            top: 15px;
            right: 15px;
            color: #ff4444;
            padding: 8px 12px;
            font-size: 18px;
            font-family: "Courier New", Consolas, monospace;
            font-weight: bold;
            opacity: 0.8;
            z-index: 8;
            pointer-events: none;
            white-space: nowrap;
            transition: opacity 0.3s ease;
            display: none;
        }
        
        /* 鼠标悬停时稍微增加透明度 */
        .video-container:hover .video-creation-time {
            opacity: 0.9;
        }
        
        /* 响应式字体大小 */
        @media (max-width: 768px) {
            .video-creation-time {
                font-size: 18px;
                padding: 6px 10px;
                top: 10px;
                right: 10px;
            }
        }
        
        @media (min-width: 1200px) {
            .video-creation-time {
                font-size: 24px;
                padding: 9px 13px;
            }
        }
    </style>
</head>
<body>
    <div class="video-container">
        <video id="videoPlayer" controls controlsList="nofullscreen"></video>
        <div id="videoCreationTime" class="video-creation-time"></div>
        <div id="options" class="interactive-options"></div>
    </div>

    <script>
    // 图数据
    const graphData = ${JSON.stringify(graphData, null, 2)};
    
    // 视频映射
    const videoMapping = ${JSON.stringify(videoMapping, null, 2)};
    
    // 视频创建时间映射
    const videoCreationTimes = ${JSON.stringify(videoCreationTimes, null, 2)};
    
    // 节点数据映射
    const nodeMap = {};
    
    // 当前播放信息
    let currentNodeId = null;
    let currentDownstreamNodes = [];
    
    // DOM 元素
    const videoPlayer = document.getElementById('videoPlayer');
    const videoCreationTimeElement = document.getElementById('videoCreationTime');
    const optionsContainer = document.getElementById('options');
    
    // 初始化节点映射
    function initNodeMap() {
        if (graphData && graphData.cells) {
            graphData.cells.forEach(cell => {
                if (cell.shape === 'rect' || cell.shape === 'html') {
                    nodeMap[cell.id] = {
                        id: cell.id,
                        type: cell.data?.type || 'unknown',
                        data: cell.data || {},
                        position: { x: cell.position.x, y: cell.position.y },
                        targets: [] // 下游节点
                    };
                }
            });
            
            // 建立节点连接关系
            graphData.cells.forEach(cell => {
                if (cell.shape === 'edge' && cell.source && cell.target) {
                    const sourceId = cell.source.cell;
                    const targetId = cell.target.cell;
                    
                    if (nodeMap[sourceId]) {
                        nodeMap[sourceId].targets.push(targetId);
                    }
                }
            });
            
            console.log('节点映射:', nodeMap);
        }
    }
    
    // 查找视频入口节点（没有入边的视频节点）
    function findEntryNode() {
        // 收集所有作为目标的节点ID
        const targetIds = new Set();
        graphData.cells.forEach(cell => {
            if (cell.shape === 'edge' && cell.target) {
                targetIds.add(cell.target.cell);
            }
        });
        
        // 找出没有入边的视频节点
        for (const nodeId in nodeMap) {
            const node = nodeMap[nodeId];
            if (node.type === 'video' && !targetIds.has(nodeId)) {
                return nodeId;
            }
        }
        
        // 如果没有找到入口节点，返回第一个视频节点
        for (const nodeId in nodeMap) {
            if (nodeMap[nodeId].type === 'video') {
                return nodeId;
            }
        }
        
        return null;
    }
    
    // 播放视频
    function playVideo(nodeId) {
        if (!nodeMap[nodeId] || nodeMap[nodeId].type !== 'video') {
            console.error('不是有效的视频节点:', nodeId);
            return;
        }
        
        // 设置当前节点和下游节点
        currentNodeId = nodeId;
        currentDownstreamNodes = nodeMap[nodeId].targets || [];
        
        // 获取视频文件路径
        const videoPath = videoMapping[nodeId];
        if (!videoPath) {
            console.error('找不到视频路径:', nodeId);
            return;
        }
        
        // 设置视频源
        videoPlayer.src = videoPath;
        videoPlayer.load();
        videoPlayer.play().catch(err => {
            console.error('视频播放失败:', err);
        });
        
        // 显示视频创建时间
        const creationTime = videoCreationTimes[nodeId];
        if (creationTime && videoCreationTimeElement) {
            videoCreationTimeElement.textContent = creationTime;
            videoCreationTimeElement.style.display = 'block';
        } else {
            videoCreationTimeElement.style.display = 'none';
        }
        
        // 清除选项
        optionsContainer.innerHTML = '';
    }
    
    // 显示选项
    function showOptions(nodeIds) {
        // 清空当前选项
        optionsContainer.innerHTML = '';
        
        if (!nodeIds || nodeIds.length === 0) {
            return;
        }
        
        // 收集文本节点
        const textNodes = nodeIds.filter(id => nodeMap[id] && nodeMap[id].type === 'text');
        
        // 如果有文本节点，显示为选项
        if (textNodes.length > 0) {
            textNodes.forEach(nodeId => {
                const node = nodeMap[nodeId];
                const option = document.createElement('div');
                option.className = 'option';
                option.textContent = node.data.text || '选项';
                option.addEventListener('click', () => handleOptionClick(nodeId));
                optionsContainer.appendChild(option);
            });
        }
        // 如果只有视频节点，自动播放第一个
        else {
            const videoNodes = nodeIds.filter(id => nodeMap[id] && nodeMap[id].type === 'video');
            if (videoNodes.length > 0) {
                // 短暂延迟后播放，给UI时间更新
                setTimeout(() => {
                    playVideo(videoNodes[0]);
                }, 100);
            }
        }
    }
    
    // 处理选项点击
    function handleOptionClick(nodeId) {
        if (!nodeMap[nodeId]) {
            console.error('无效的节点ID:', nodeId);
            return;
        }
        
        // 获取节点的下游节点
        const targets = nodeMap[nodeId].targets || [];
        
        // 如果是文本节点，继续显示选项
        if (nodeMap[nodeId].type === 'text') {
            const textTargets = targets.filter(id => nodeMap[id] && nodeMap[id].type === 'text');
            const videoTargets = targets.filter(id => nodeMap[id] && nodeMap[id].type === 'video');
            
            if (textTargets.length > 0) {
                // 有更多文本节点，显示为选项
                showOptions(targets);
            } else if (videoTargets.length > 0) {
                // 有视频节点，播放第一个
                playVideo(videoTargets[0]);
            } else {
                console.log('此选项没有下游节点');
            }
        }
    }
    
    // 处理视频结束事件
    videoPlayer.addEventListener('ended', () => {
        if (currentDownstreamNodes.length > 0) {
            showOptions(currentDownstreamNodes);
        } else {
            console.log('视频播放结束，没有后续选项');
        }
    });
    
    // 初始化并开始播放
    document.addEventListener('DOMContentLoaded', () => {
        // 初始化节点映射
        initNodeMap();
        
        // 查找入口节点
        const entryNodeId = findEntryNode();
        if (entryNodeId) {
            playVideo(entryNodeId);
        } else {
            console.error('找不到有效的入口视频节点');
            document.body.innerHTML = '<h1 style="color: white; text-align: center;">错误：找不到有效的视频节点</h1>';
        }
    });
    </script>
</body>
</html>`;
  }

  // 其他处理器...

  // 文件系统辅助函数
  ipcMain.handle("fsExistsSync", (event, path) => {
    try {
      return fs.existsSync(path);
    } catch (error) {
      console.error("检查文件存在出错:", error);
      return false;
    }
  });

  ipcMain.handle("fsStatSync", (event, path) => {
    try {
      const stats = fs.statSync(path);
      return {
        size: stats.size,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        created: stats.birthtime,
        modified: stats.mtime,
      };
    } catch (error) {
      console.error("获取文件状态出错:", error);
      return { error: error.message };
    }
  });

  ipcMain.handle("fsReadFileSync", (event, filePath) => {
    try {
      return fs.readFileSync(filePath);
    } catch (error) {
      console.error("读取文件出错:", error);
      return null;
    }
  });
}

// 当所有窗口关闭时退出应用程序，除非在 macOS 上。在 macOS 上，应用程序和菜单栏通常保持活动状态
// 直到用户通过 Cmd + Q 明确退出
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// 在这个文件中，你可以包含应用程序的主进程代码
// 也可以将它们拆分成几个文件，然后通过 require 导入

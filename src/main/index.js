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

  // --- 添加文件系统操作的IPC处理器 ---
  ipcMain.handle("fsExistsSync", (event, filePath) => {
    try {
      return fs.existsSync(filePath);
    } catch (error) {
      console.error("fsExistsSync IPC 错误:", error);
      return false;
    }
  });

  ipcMain.handle("fsStatSync", (event, filePath) => {
    try {
      const stats = fs.statSync(filePath);
      // 只返回可序列化的基本信息
      return {
        size: stats.size,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        mtimeMs: stats.mtimeMs,
      };
    } catch (error) {
      console.error("fsStatSync IPC 错误:", error);
      // 返回一个表示错误或文件不存在的结构
      return { error: error.code || "UNKNOWN_ERROR", size: 0 };
    }
  });

  ipcMain.handle("fsReadFileSync", (event, filePath) => {
    try {
      return fs.readFileSync(filePath);
    } catch (error) {
      console.error("fsReadFileSync IPC 错误:", error);
      // 返回一个空 Buffer 或抛出错误，取决于渲染进程的期望
      // 这里选择返回空Buffer，渲染进程需要检查buffer长度
      return Buffer.from([]);
    }
  });
  // --- 文件系统操作处理器结束 ---
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

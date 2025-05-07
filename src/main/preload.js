const { contextBridge, ipcRenderer } = require("electron");

// 暴露 IPC 接口给渲染进程
contextBridge.exposeInMainWorld("electron", {
  // 从渲染进程发送消息到主进程
  send: (channel, data) => {
    // 白名单通道
    const validChannels = ["toMain", "save-data", "save-as-data"];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  // 从主进程接收消息
  receive: (channel, callback) => {
    // 白名单通道
    const validChannels = [
      "fromMain",
      "file-opened",
      "file-saved",
      "request-save-data",
      "request-save-as-data",
      "create-new-file",
      "request-export-package",
      "export-progress-update",
    ];
    if (validChannels.includes(channel)) {
      // 删除旧的监听器以避免重复
      ipcRenderer.removeAllListeners(channel);
      // 添加新的监听器
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    }
  },
  // 调用主进程方法并等待返回结果
  invoke: (channel, ...args) => {
    // 白名单通道
    const validChannels = [
      "getVideoMetadata",
      "fsExistsSync",
      "fsStatSync",
      "fsReadFileSync",
      "select-video-file",
      "perform-export",
    ];

    if (validChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    return Promise.reject(new Error(`未授权的通道: ${channel}`));
  },
  // 不再直接暴露fs模块
  // fs: { ... }
});

// 添加文件拖放支持
document.addEventListener("dragover", (e) => {
  e.preventDefault();
  e.stopPropagation();
});

document.addEventListener("drop", (e) => {
  e.preventDefault();
  e.stopPropagation();
});

// 这里可以在渲染进程加载前执行任何初始化代码
window.addEventListener("DOMContentLoaded", () => {
  console.log("DOM 加载完成，预加载脚本执行");
});

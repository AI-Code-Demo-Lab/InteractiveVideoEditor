# 交互式视频编辑器

一个基于 Electron + Vue 3 + Pinia 开发的桌面应用程序，用于创建和编辑交互式视频。

## 技术栈

- **Electron**: 跨平台桌面应用框架
- **Vue 3**: 前端框架
- **Pinia**: 状态管理
- **Vue Router**: 路由管理
- **Vite**: 开发和构建工具

## 功能特点

- 基本视频编辑功能
- 时间线编辑界面
- 多轨道支持（视频、音频、特效）
- 项目管理

## 开发指南

### 环境要求

- Node.js (推荐 v14 或更高版本)
- npm 或 yarn

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

这将同时启动 Vite 开发服务器和 Electron 应用程序。

### 构建应用程序

```bash
npm run build
```

构建完成后，可以使用以下命令创建安装包：

```bash
npm run dist
```

## 项目结构

```
├── dist/               # 构建输出目录
├── public/             # 静态资源
├── scripts/            # 构建脚本
├── src/
│   ├── main/           # Electron 主进程代码
│   └── renderer/       # Vue 渲染进程代码
│       ├── components/ # Vue 组件
│       ├── store/      # Pinia 状态管理
│       ├── views/      # 页面视图
│       ├── App.vue     # 根组件
│       ├── main.js     # 入口文件
│       └── router/     # 路由配置
├── index.html          # HTML 入口
├── package.json        # 项目配置
└── vite.config.js      # Vite 配置
```

## 许可证

ISC

# TODO

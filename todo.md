# 交互式视频编辑器 - 待办事项清单

## 可优化的地方

### 文件操作改进

- [ ] 添加文件未保存提示 - 当用户有未保存的更改时尝试关闭应用或创建新文件时，显示确认对话框
- [ ] 添加自动保存功能，定期保存用户工作
- [ ] 实现最近打开文件列表

### 性能优化

- [ ] 大型视频文件处理优化，使用视频缩略图而非完整视频加载
- [ ] 优化节点渲染性能，特别是在复杂图表情况下
- [ ] 实现视频资源的惰性加载

### 用户界面改进

- [ ] 添加加载指示器，特别是在导入大型项目或视频文件时
- [ ] 完善错误处理和用户友好的错误提示
- [ ] 改进节点选择和多选操作的用户体验
- [ ] 添加深色模式支持
- [ ] 改进拖放交互体验

### 代码结构

- [ ] 将大型组件(如 FlowGraph.vue)拆分为更小的子组件
- [ ] 使用 Pinia 进行更结构化的状态管理
- [ ] 优化 IPC 通信模式
- [ ] 规范化错误处理流程

## 新增功能提案

### 编辑功能增强

- [ ] 实现撤销/重做操作支持
- [ ] 添加复制/粘贴节点功能
- [ ] 实现节点分组功能
- [ ] 添加节点搜索和过滤功能
- [ ] 添加快捷键支持
- [ ] 实现节点对齐网格功能

### 更多节点类型

- [ ] 图片节点支持
- [ ] 音频节点支持
- [ ] 问答节点（用于创建互动问答）
- [ ] 分支选择节点（更高级的决策点）
- [ ] 定时器节点（等待特定时间后触发）
- [ ] 外部链接节点

### 视频功能增强

- [ ] 视频裁剪和编辑功能
- [ ] 添加字幕支持
- [ ] 视频特效和转场
- [ ] 支持画中画效果
- [ ] 视频音量调节
- [ ] 视频播放速度控制

### 导出和分享

- [ ] 导出为独立可执行的交互式视频
- [ ] 导出为网页版本
- [ ] 添加项目预览模式
- [ ] 实现分享功能（导出链接或嵌入代码）
- [ ] 支持导出为不同格式（MP4、WebM 等）

### 高级交互

- [ ] 条件分支（基于用户之前的选择）
- [ ] 数据收集（记录用户交互）
- [ ] 时间线编辑器
- [ ] 动画路径编辑
- [ ] 自定义变量支持（追踪用户选择）
- [ ] 高级事件系统

### 开发者工具

- [ ] 节点和连线的调试工具
- [ ] 性能监控
- [ ] 项目报告生成（节点数、视频总时长等）
- [ ] 日志系统
- [ ] 插件系统支持

## 实施计划

### 第一阶段（基础功能改进）

- 实现撤销/重做
- 添加复制/粘贴节点功能
- 实现文件未保存提示
- 优化大型视频文件处理

### 第二阶段（高级功能）

- 添加新节点类型
- 实现视频编辑功能
- 改进用户界面
- 添加项目预览模式

### 第三阶段（分享与导出）

- 实现导出功能
- 添加分享选项
- 开发高级交互功能
- 完善开发者工具

<template>
  <div class="flow-graph-container" :class="{ 'drag-active': isDragging }">
    <!-- 添加TabBar组件 -->
    <TabBar @add-video="handleAddVideoFromTab" @add-option="handleAddOption" />

    <!-- 图表容器 -->
    <div
      class="graph-container"
      ref="container"
      @dragover="handleDragOver"
      @drop="handleDrop"
      @dragleave="handleDragLeave"
      @dragenter="handleDragEnter"
    >
      <div v-if="isDragging" class="drag-overlay">
        <div class="drag-message">释放添加视频节点</div>
      </div>
      <div class="instruction-text" v-if="!isDragging">
        将视频文件拖放到此处创建节点
      </div>
    </div>

    <!-- 文本编辑对话框 - 使用teleport将其传送到body -->
    <teleport to="body">
      <div v-if="textEditDialog.visible" class="text-edit-dialog">
        <div class="text-edit-dialog-content">
          <div class="text-edit-dialog-header">
            <h3>编辑文本</h3>
            <button class="close-btn" @click="closeTextEditDialog">×</button>
          </div>
          <div class="text-edit-dialog-body">
            <textarea
              v-model="textEditDialog.text"
              class="text-edit-textarea"
              placeholder="请输入文本内容"
              ref="textEditTextarea"
            ></textarea>
          </div>
          <div class="text-edit-dialog-footer">
            <button class="cancel-btn" @click="closeTextEditDialog">
              取消
            </button>
            <button class="save-btn" @click="saveTextEditDialog">保存</button>
          </div>
        </div>
      </div>
    </teleport>
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted, watch, nextTick } from "vue";
import { Graph } from "@antv/x6";
import TabBar from "./TabBar.vue";
import TextNode from "./TextNode.vue";
// 使用全局注入的电子API代替直接require
const fs = window.electron?.fs || {
  existsSync: () => false,
  statSync: () => ({ size: 0 }),
  readFileSync: () => new ArrayBuffer(0),
};

// 定义文本编辑工具
const TextEditorTool = {
  name: "textEditor",
  config: {
    tagName: "div",
    isSVGElement: false,
    events: {
      mousedown: "onMouseDown",
    },
  },

  init() {
    const { getData, setText } = this.options;

    // 创建编辑器容器
    const container = document.createElement("div");
    container.className = "node-text-editor";
    Object.assign(container.style, {
      position: "absolute",
      zIndex: 10,
      display: "none",
      width: "100%",
      height: "100%",
      padding: "5px",
      boxSizing: "border-box",
    });

    // 创建文本输入框
    const textarea = document.createElement("textarea");
    textarea.className = "node-text-editor-input";
    textarea.value = getData?.() || "";
    Object.assign(textarea.style, {
      width: "100%",
      height: "100%",
      boxSizing: "border-box",
      border: "none",
      padding: "5px",
      outline: "none",
      resize: "none",
      fontSize: "14px",
      fontFamily: "Arial, sans-serif",
      backgroundColor: "#f8f9fa",
      borderRadius: "5px",
    });

    // 监听输入框事件
    textarea.addEventListener("blur", () => {
      const newText = textarea.value.trim();
      if (newText && setText) {
        setText(newText);
      }
      this.onHide();
    });

    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const newText = textarea.value.trim();
        if (newText && setText) {
          setText(newText);
        }
        this.onHide();
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.onHide();
      }
    });

    container.appendChild(textarea);
    this.container = container;
    this.textarea = textarea;

    // 将编辑器添加到文档
    document.body.appendChild(container);
  },

  onMouseDown(e) {
    e.stopPropagation();
  },

  onRender() {
    this.updatePosition();
    this.container.style.display = "block";
    this.textarea.focus();
    this.textarea.select();
  },

  updatePosition() {
    const node = this.cellView.cell;
    const { x, y, width, height } = node.getBBox();
    const zoom = this.graph.zoom();
    const position = this.graph.localToGraph({ x, y });

    Object.assign(this.container.style, {
      left: `${position.x}px`,
      top: `${position.y}px`,
      width: `${width * zoom}px`,
      height: `${height * zoom}px`,
      transform: `scale(${zoom})`,
      transformOrigin: "top left",
    });
  },

  onHide() {
    this.container.style.display = "none";

    if (this.cellView) {
      this.cellView.cell.removeTool("textEditor");
    }
  },

  onRemove() {
    this.container.remove();
  },
};

export default {
  name: "FlowGraph",
  components: {
    TabBar,
    TextNode,
  },
  props: {
    width: {
      type: Number,
      default: 800,
    },
    height: {
      type: Number,
      default: 600,
    },
  },
  emits: [
    "node-selected",
    "canvas-clicked",
    "video-node-created",
    "node-dblclicked",
    "file-opened",
    "file-saved",
    "graph-import-completed",
  ],
  setup(props, { emit }) {
    const container = ref(null);
    const isDragging = ref(false);
    let graph = null;
    let nodeCounter = 1;
    // 添加选中单元格数组
    let selectedCells = [];
    let isImporting = false;

    // 文本编辑对话框相关状态
    const textEditDialog = ref({
      visible: false,
      text: "",
      nodeId: null,
    });
    const textEditTextarea = ref(null);

    // 打开文本编辑对话框
    const openTextEditDialog = (nodeId, text) => {
      textEditDialog.value.visible = true;
      textEditDialog.value.text = text || "";
      textEditDialog.value.nodeId = nodeId;

      // 等待DOM更新后聚焦文本框
      nextTick(() => {
        if (textEditTextarea.value) {
          textEditTextarea.value.focus();
        }
      });
    };

    // 关闭文本编辑对话框
    const closeTextEditDialog = () => {
      textEditDialog.value.visible = false;
      textEditDialog.value.text = "";
      textEditDialog.value.nodeId = null;
    };

    // 保存文本编辑并关闭对话框
    const saveTextEditDialog = () => {
      const nodeId = textEditDialog.value.nodeId;
      const text = textEditDialog.value.text;

      if (nodeId && graph) {
        const node = graph.getCellById(nodeId);
        if (node) {
          // 更新节点文本和数据
          node.attr("label/text", text);
          node.setData({
            ...node.getData(),
            text: text,
          });
          console.log("文本已更新:", text);
        }
      }

      // 关闭对话框
      closeTextEditDialog();
    };

    // 帮助函数：确保对象可以被安全地序列化
    const ensureSerializable = (obj) => {
      try {
        // 尝试序列化和反序列化对象
        return JSON.parse(JSON.stringify(obj));
      } catch (error) {
        console.error("对象无法序列化:", error);
        // 返回简化版本的对象
        return { error: "无法序列化的对象" };
      }
    };

    // 设置文件操作相关的事件监听
    const setupFileOperations = () => {
      // 监听新建文件请求
      window.electron?.receive("create-new-file", () => {
        console.log("收到新建文件请求");
        // 清空画布
        if (graph) {
          graph.clearCells();
        }
        // 重置画布状态
        graph.centerContent();
        // 通知父组件文件已创建新文件
        emit("file-opened", {
          filePath: null,
          fileName: "未命名文件",
        });
      });

      // 监听打开文件请求
      window.electron?.receive("file-opened", (data) => {
        try {
          console.log("收到打开文件数据:", data);

          // 清空画布
          if (graph) {
            graph.clearCells();
          }

          // 导入图形数据
          if (data && data.data) {
            importGraph(data.data);

            // 通知父组件文件已打开
            emit("file-opened", {
              filePath: data.filePath,
              fileName: data.filePath.split("/").pop().split("\\").pop(),
            });
          }
        } catch (error) {
          console.error("导入文件失败:", error);
        }
      });

      // 监听保存请求
      window.electron?.receive("request-save-data", () => {
        console.log("收到保存数据请求");
        const graphData = exportGraph();
        if (graphData) {
          try {
            // 发送数据到主进程保存
            window.electron?.send("save-data", graphData);
          } catch (error) {
            console.error("发送保存数据失败:", error);
            // 尝试使用简化版本
            const safeData = ensureSerializable(graphData);
            window.electron?.send("save-data", safeData);
          }
        } else {
          console.error("无法导出图形数据");
        }
      });

      // 监听另存为请求
      window.electron?.receive("request-save-as-data", () => {
        console.log("收到另存为数据请求");
        const graphData = exportGraph();
        if (graphData) {
          try {
            // 发送数据到主进程保存
            window.electron?.send("save-as-data", graphData);
          } catch (error) {
            console.error("发送另存为数据失败:", error);
            // 尝试使用简化版本
            const safeData = ensureSerializable(graphData);
            window.electron?.send("save-as-data", safeData);
          }
        } else {
          console.error("无法导出图形数据");
        }
      });

      // 监听保存成功事件
      window.electron?.receive("file-saved", (data) => {
        console.log("文件保存成功:", data.filePath);
        // 通知父组件文件已保存
        emit("file-saved", {
          filePath: data.filePath,
          fileName: data.filePath.split("/").pop().split("\\").pop(),
        });
      });
    };

    // 创建一个响应式的画布大小
    const canvasSize = ref({
      width: props.width,
      height: props.height,
    });

    // 应用选中样式的函数
    const applySelectedStyle = (node) => {
      if (!node) return;

      console.log("应用选中样式：", node.id, node);

      // 添加到选中数组
      if (!selectedCells.includes(node)) {
        selectedCells.push(node);
      }

      // 设置节点数据
      node.setData({
        ...node.getData(),
        selected: true,
      });

      // 简化样式应用，直接修改节点自身样式
      try {
        // 检查节点类型
        if (node.shape === "html") {
          // HTML节点，查找容器并修改样式
          const nodeEl = document.querySelector(`[data-node-id="${node.id}"]`);
          if (nodeEl) {
            const textNodeEl = nodeEl.querySelector(".text-node");
            if (textNodeEl) {
              textNodeEl.style.borderColor = "#1890ff";
              textNodeEl.style.boxShadow = "0 0 0 2px rgba(24, 144, 255, 0.4)";
            }
          }
        } else {
          // 标准节点，使用节点自身的边框来表示选中状态
          node.attr({
            body: {
              stroke: "#1890ff", // 蓝色边框
              strokeWidth: 3, // 加粗边框
              shadowBlur: 10, // 添加阴影效果
              shadowColor: "rgba(24, 144, 255, 0.5)",
              shadowOffsetX: 0,
              shadowOffsetY: 0,
            },
          });
        }

        console.log("样式已应用");
      } catch (error) {
        console.error("设置样式出错:", error);
      }
    };

    // 移除选中样式的函数
    const removeSelectedStyle = (node) => {
      if (!node) return;

      console.log("移除选中样式：", node.id);

      node.setData({
        ...node.getData(),
        selected: false,
      });

      // 恢复默认样式
      try {
        // 检查节点类型
        if (node.shape === "html") {
          // HTML节点，查找容器并恢复样式
          const nodeEl = document.querySelector(`[data-node-id="${node.id}"]`);
          if (nodeEl) {
            const textNodeEl = nodeEl.querySelector(".text-node");
            if (textNodeEl) {
              textNodeEl.style.borderColor = "#4b89dc";
              textNodeEl.style.boxShadow = "0 4px 6px rgba(0, 0, 0, 0.1)";
            }
          }
        } else {
          // 标准节点，恢复默认样式
          node.attr({
            body: {
              stroke: "#4b89dc",
              strokeWidth: 2,
              shadowBlur: 0,
              shadowColor: "transparent",
              shadowOffsetX: 0,
              shadowOffsetY: 0,
            },
          });
        }

        console.log("样式已恢复");
      } catch (error) {
        console.error("恢复样式出错:", error);
      }
    };

    // 获取节点的下游节点
    const getDownstreamNodes = (nodeId) => {
      if (!graph) return [];

      // 获取从该节点出发的所有边
      const outgoingEdges = graph.getOutgoingEdges(nodeId);
      if (!outgoingEdges || outgoingEdges.length === 0) {
        return [];
      }

      // 获取下游节点ID
      return outgoingEdges.map((edge) => edge.getTargetCellId());
    };

    // 初始化图表
    const initGraph = () => {
      if (!container.value) return;

      // 如果已经存在图实例，先销毁
      if (graph) {
        graph.dispose();
      }

      // 注册文本编辑工具
      Graph.registerNodeTool("textEditor", TextEditorTool, true);

      graph = new Graph({
        container: container.value,
        width: canvasSize.value.width,
        height: canvasSize.value.height,
        grid: {
          size: 10,
          visible: true,
        },
        background: {
          color: "#f5f5f5",
        },
        // 启用内置的编辑功能
        editing: {
          // 启用内置编辑功能
          enabled: true,
          // 启用文本编辑
          labelEditableClass: "editable-label",
        },
        // 启用连线交互
        connecting: {
          snap: true,
          allowBlank: false,
          allowLoop: false,
          highlight: true,
          connector: "rounded",
          connectionPoint: "boundary",
          router: {
            name: "manhattan",
            args: {
              padding: 20,
            },
          },
          // 设置默认边样式
          createEdge() {
            return graph.createEdge({
              attrs: {
                line: {
                  stroke: "#4b89dc",
                  strokeWidth: 2,
                  targetMarker: {
                    name: "block",
                    size: 8,
                  },
                },
              },
              zIndex: 0,
            });
          },
        },
        // 确保HTML节点正确渲染
        htmlContainer: container.value,
        resizing: false, // 禁用大小调整以避免样式问题
        rotating: false, // 禁用旋转以避免样式问题
        embedding: {
          enabled: false, // 禁用嵌入以简化节点层次结构
        },
        // 启用选择功能
        selecting: {
          enabled: true,
          multiple: true,
          rubberband: true,
          movable: true,
          showNodeSelectionBox: true,
        },
        // 启用拖动功能
        translating: {
          restrict: false, // 不限制拖动
        },
        // 启用画布平移功能
        panning: {
          enabled: true,
          eventTypes: ["mousewheel"], // 鼠标滚轮点击时启用平移
        },
        mousewheel: {
          enabled: true,
          modifiers: ["ctrl", "meta"], // 需要按下ctrl或meta键才能通过滚轮缩放
          minScale: 0.5,
          maxScale: 2,
        },
        autoResize: true, // 自动调整大小以适应容器
      });

      // 监听节点拖动开始事件
      graph.on("node:mousedown", ({ node }) => {
        console.log("开始拖动节点", node.id);
        // 应用选中样式
        applySelectedStyle(node);

        // 取消其他节点的选中状态，实现单选效果（如果需要）
        selectedCells.forEach((cell) => {
          if (cell.id !== node.id) {
            removeSelectedStyle(cell);
          }
        });
        selectedCells = selectedCells.filter((cell) => cell.id === node.id);
      });

      // 监听节点移动事件
      graph.on("node:moving", ({ node }) => {
        console.log("节点移动中", node.id);
        // 确保节点保持选中样式
        if (!selectedCells.includes(node)) {
          applySelectedStyle(node);
        }
      });

      // 监听节点移动结束事件
      graph.on("node:moved", ({ node }) => {
        console.log("节点移动结束", node.id);
        // 保持选中状态
        if (!selectedCells.includes(node)) {
          applySelectedStyle(node);
        }
      });

      // 监听节点点击事件
      graph.on("node:click", ({ node }) => {
        emit("node-selected", node.id);
        // 设置选中状态样式
        applySelectedStyle(node);
      });

      // 监听双击节点事件
      graph.on("node:dblclick", ({ node }) => {
        // 获取下游节点
        const downstreamNodeIds = getDownstreamNodes(node.id);

        // 发出节点双击事件，包含节点ID和下游节点信息
        emit("node-dblclicked", {
          nodeId: node.id,
          downstreamNodeIds: downstreamNodeIds,
        });
        console.log("节点双击:", node.id, "下游节点:", downstreamNodeIds);

        // 处理文本节点的双击编辑
        const data = node.getData();
        console.log("节点数据:", data);

        if (data && data.type === "text") {
          console.log("准备编辑文本节点:", node.id);

          // 使用新的对话框编辑模式
          const currentText = data?.text || node.attr("label/text") || "";
          openTextEditDialog(node.id, currentText);
        }
      });

      // 监听画布点击事件
      graph.on("blank:click", () => {
        emit("canvas-clicked");
        // 移除所有节点的选中样式
        selectedCells.forEach((node) => {
          removeSelectedStyle(node);
        });
        selectedCells = [];
      });

      // 添加自定义事件处理器，用于处理文本节点的文本更新
      const handleTextNodeUpdate = (nodeId, newText) => {
        console.log(`更新文本节点: ${nodeId}, 新文本: ${newText}`);

        // 获取对应的节点
        const node = graph.getCellById(nodeId);
        if (node) {
          // 更新节点数据
          node.setData({
            ...node.getData(),
            text: newText,
          });

          // 更新节点文本
          node.attr("label/text", newText);

          console.log("文本节点已更新");
        } else {
          console.error("找不到要更新的节点:", nodeId);
        }
      };

      // 全局事件委托，用于捕获TextNode组件发出的update:text事件
      document.addEventListener("textnode:update", (e) => {
        if (e.detail && e.detail.nodeId && e.detail.text) {
          handleTextNodeUpdate(e.detail.nodeId, e.detail.text);
        }
      });

      // 监听连接线双击事件，断开连接
      graph.on("edge:dblclick", ({ edge }) => {
        console.log("双击连接线，断开连接:", edge.id);

        // 添加高亮效果，然后删除
        edge.attr("line/stroke", "#FF0000"); // 设置为红色
        edge.attr("line/strokeWidth", 3); // 加粗线条

        // 短暂延迟后移除，提供视觉反馈
        setTimeout(() => {
          // 移除边
          edge.remove();
          // 边移除后会自动重绘，不需要手动调用
        }, 300);
      });

      // 添加键盘事件监听
      const handleKeyDown = (e) => {
        if (e.key === "Delete" || e.key === "Backspace") {
          // 使用我们自己维护的选中单元格数组
          if (selectedCells.length > 0) {
            console.log("删除选中的单元格", selectedCells);
            graph.removeCells(selectedCells);
            // 清空选中数组
            selectedCells = [];
          }
        }
      };

      // 添加键盘事件监听器
      document.addEventListener("keydown", handleKeyDown);

      // 添加鼠标中键拖动画布的事件监听
      let isPanning = false;
      let previousPoint = null;

      // 监听鼠标按下事件 - 仅设置初始状态，不添加到容器元素
      const handleMouseDown = (e) => {
        // 检查是否是鼠标中键 (button值为1表示中键)
        if (e.button === 1) {
          e.preventDefault();
          e.stopPropagation(); // 阻止事件传播

          isPanning = true;
          previousPoint = { x: e.clientX, y: e.clientY };

          // 修改鼠标样式
          document.body.style.cursor = "grabbing";

          console.log("中键按下，开始拖动");
        }
      };

      // 监听鼠标移动事件 - 全局监听所有鼠标移动
      const handleMouseMove = (e) => {
        if (isPanning && graph && previousPoint) {
          e.preventDefault();
          e.stopPropagation();

          // 计算偏移量
          const offsetX = e.clientX - previousPoint.x;
          const offsetY = e.clientY - previousPoint.y;

          // 应用平移变换
          const { tx, ty } = graph.transform.getTranslation();
          graph.translate(tx + offsetX, ty + offsetY);

          // 更新上一个点的位置
          previousPoint = { x: e.clientX, y: e.clientY };

          // 刷新画布以确保平滑拖动
          // graph.refresh();  // 可选，如果需要更流畅的效果
        }
      };

      // 监听鼠标释放事件 - 全局监听
      const handleMouseUp = (e) => {
        // 只在按下中键且处于拖动状态时处理
        if (e.button === 1 && isPanning) {
          e.preventDefault();
          e.stopPropagation();

          isPanning = false;
          previousPoint = null;

          // 恢复鼠标样式
          document.body.style.cursor = "";

          console.log("中键释放，停止拖动");
        }
      };

      // 防止鼠标中键的默认行为（通常是自动滚动）
      const handleAuxClick = (e) => {
        if (e.button === 1) {
          e.preventDefault();
          e.stopPropagation();
        }
      };

      // 添加全局事件监听
      document.addEventListener("mousedown", handleMouseDown);
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.addEventListener("auxclick", handleAuxClick);

      // 重点：禁用浏览器默认的中键自动滚动行为
      document.addEventListener(
        "mousemove",
        (e) => {
          if (isPanning) {
            e.preventDefault();
            return false;
          }
        },
        { passive: false }
      );
    };

    // 处理拖拽悬停
    const handleDragOver = (e) => {
      // 阻止默认行为，允许放置
      e.preventDefault();
      e.stopPropagation();

      console.log("拖拽悬停事件触发");

      // 强制允许放置，无论是什么文件
      e.dataTransfer.dropEffect = "copy";
      isDragging.value = true;

      // 只在控制台显示类型检查信息
      if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
        const isVideo = hasVideoFile(e.dataTransfer.items);
        console.log("是否为视频文件:", isVideo);
      }
    };

    // 处理拖拽进入
    const handleDragEnter = (e) => {
      e.preventDefault();
      e.stopPropagation();

      console.log("拖拽进入事件触发");
      isDragging.value = true;
    };

    // 处理拖拽离开
    const handleDragLeave = (e) => {
      e.preventDefault();
      e.stopPropagation();

      // 确保只有当鼠标真正离开容器时才设置 isDragging
      const rect = container.value.getBoundingClientRect();
      const x = e.clientX;
      const y = e.clientY;

      // 检查鼠标是否真的离开了容器
      if (
        x <= rect.left ||
        x >= rect.right ||
        y <= rect.top ||
        y >= rect.bottom
      ) {
        console.log("拖拽离开事件触发");
        isDragging.value = false;
      }
    };

    // 检查是否有视频文件
    const hasVideoFile = (items) => {
      console.log("检查拖放项:", items);

      if (!items) {
        console.log("无拖放项");
        return false;
      }

      // 检查文件列表
      if (items.length > 0) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          console.log("拖放项类型:", item.kind);

          if (item.kind === "file") {
            const file = item.getAsFile ? item.getAsFile() : null;

            if (file) {
              console.log("文件类型:", file.type);
              // 检查视频文件类型
              if (
                file.type.startsWith("video/") ||
                file.name.endsWith(".mp4") ||
                file.name.endsWith(".webm") ||
                file.name.endsWith(".ogg") ||
                file.name.endsWith(".mov") ||
                file.name.endsWith(".avi")
              ) {
                console.log("检测到视频文件");
                return true;
              }
            }
          }
        }
      }

      console.log("未检测到视频文件");
      return false;
    };

    // 处理文件放置
    const handleDrop = (e) => {
      e.preventDefault();
      e.stopPropagation();

      console.log("放置事件触发");
      isDragging.value = false;

      if (!graph) {
        console.error("图表实例不存在");
        return;
      }

      // 获取画布元素的位置
      const rect = container.value.getBoundingClientRect();

      // 计算鼠标相对于画布的位置
      const canvasX = e.clientX - rect.left;
      const canvasY = e.clientY - rect.top;

      console.log("检查拖放文件:", e.dataTransfer.files);

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        // 处理拖拽的文件
        const files = Array.from(e.dataTransfer.files);
        console.log(
          "拖放的所有文件:",
          files.map((f) => f.name)
        );

        // 使用更宽泛的过滤条件
        const videoFiles = files.filter((file) => {
          return (
            file.type.startsWith("video/") ||
            file.name.endsWith(".mp4") ||
            file.name.endsWith(".webm") ||
            file.name.endsWith(".ogg") ||
            file.name.endsWith(".mov") ||
            file.name.endsWith(".avi")
          );
        });

        console.log(`检测到 ${videoFiles.length} 个视频文件`);

        if (videoFiles.length > 0) {
          // 设置标志表示正在导入视频，不需要自动播放
          isImporting = true;

          // 取消所有已选节点
          selectedCells.forEach((node) => {
            removeSelectedStyle(node);
          });
          selectedCells = [];

          // 创建视频节点
          videoFiles.forEach((file, index) => {
            console.log(
              `处理文件: ${file.name}, 大小: ${(
                file.size /
                (1024 * 1024)
              ).toFixed(2)} MB`
            );

            // 如果有多个文件，将它们错开放置
            const position = {
              x: canvasX + index * 20,
              y: canvasY + index * 20,
            };

            // 创建节点并自动选中
            const node = createVideoNode(file, position);
            if (node) {
              // 选中新创建的节点
              applySelectedStyle(node);
            }
          });

          // 重置导入标志
          isImporting = false;
        } else {
          console.warn("没有检测到视频文件");
          alert("请拖放视频文件（MP4, WebM, OGG, MOV, AVI等格式）");
        }
      } else {
        console.warn("没有拖放文件");
      }
    };

    // 创建视频节点
    const createVideoNode = (file, position) => {
      if (!graph) return;

      // 创建唯一ID
      const nodeId = `video-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      console.log(`正在创建视频节点，ID: ${nodeId}`);

      // 创建一个blob URL用于预览视频
      const videoUrl = URL.createObjectURL(file);

      // 获取文件大小（MB）
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);

      // 保存文件路径（如果是文件对象且有path属性）
      const filePath = file.path || "";

      try {
        // 创建视频节点
        const videoNode = graph.addNode({
          id: nodeId,
          x: position.x - 75,
          y: position.y - 40,
          width: 180,
          height: 90,
          attrs: {
            body: {
              fill: "#f0f8ff", // 浅蓝色背景
              stroke: "#4b89dc", // 蓝色边框
              strokeWidth: 2,
              rx: 10, // 增大圆角
              ry: 10,
              filter: "drop-shadow(2px 2px 3px rgba(0,0,0,0.2))", // 添加阴影效果
            },
            label: {
              text: `${file.name}\n${fileSizeMB} MB`,
              fill: "#333",
              fontSize: 13,
              fontWeight: 500,
              fontFamily: "Arial, sans-serif",
              refX: 0.5,
              refY: 0.5,
              textAnchor: "middle",
              textVerticalAnchor: "middle",
            },
          },
          ports: {
            groups: {
              in: {
                position: "left",
                attrs: {
                  circle: {
                    r: 6,
                    magnet: true,
                    stroke: "#4b89dc",
                    strokeWidth: 2,
                    fill: "#fff",
                  },
                },
              },
              out: {
                position: "right",
                attrs: {
                  circle: {
                    r: 6,
                    magnet: true,
                    stroke: "#4b89dc",
                    strokeWidth: 2,
                    fill: "#fff",
                  },
                },
              },
            },
            items: [
              { id: `${nodeId}-in`, group: "in" },
              { id: `${nodeId}-out`, group: "out" },
            ],
          },
          data: {
            type: "video",
            fileInfo: {
              name: file.name,
              type: file.type,
              size: file.size,
            },
            url: videoUrl,
            filePath: filePath, // 保存原始文件路径
            isPlaying: false, // 添加播放状态标记
          },
          markup: [
            {
              tagName: "rect",
              selector: "body",
            },
            {
              tagName: "text",
              selector: "label",
            },
          ],
        });

        console.log(`视频节点创建成功: ${nodeId}`);

        // 发出视频节点创建事件
        emit(
          "video-node-created",
          {
            nodeId: nodeId,
            videoUrl: videoUrl,
            fileName: file.name,
            fileSize: fileSizeMB,
            fileType: file.type,
            filePath: filePath, // 添加文件路径
          },
          !isImporting
        ); // 如果是导入操作，不自动播放

        return videoNode;
      } catch (error) {
        console.error("创建视频节点失败:", error);
        return null;
      }
    };

    // 设置视频节点的播放状态
    const setPlayingNodeState = (nodeId, isPlaying) => {
      if (!graph) return;

      // 先清除所有节点的播放状态
      graph.getNodes().forEach((node) => {
        const data = node.getData();
        if (data && data.type === "video") {
          node.setData({
            ...data,
            isPlaying: false,
          });

          // 恢复节点默认样式
          node.setAttrs({
            body: {
              stroke: "#4b89dc", // 恢复蓝色边框
              strokeWidth: 2,
              strokeDasharray: "none",
              filter: "drop-shadow(2px 2px 3px rgba(0,0,0,0.2))", // 恢复默认阴影
            },
          });
        }
      });

      // 如果提供了nodeId并且isPlaying为true，设置该节点为播放状态
      if (nodeId && isPlaying) {
        const node = graph.getCellById(nodeId);
        if (node) {
          node.setData({
            ...node.getData(),
            isPlaying: true,
          });

          // 添加播放中样式 - 只应用边框效果，不显示指示器
          node.setAttrs({
            body: {
              stroke: "#2ecc71", // 绿色边框
              strokeWidth: 3, // 加粗边框
              strokeDasharray: "5, 2", // 虚线效果
              filter: "drop-shadow(0 0 8px rgba(46, 204, 113, 0.6))", // 绿色阴影
            },
          });

          console.log(`设置节点 ${nodeId} 为播放状态`);
        }
      }
    };

    // 调整图表大小
    const resizeGraph = () => {
      if (graph) {
        graph.resize(canvasSize.value.width, canvasSize.value.height);
      }
    };

    // 处理窗口大小变化
    const handleResize = () => {
      if (container.value) {
        // 获取父容器的大小
        const parentEl = container.value.parentElement;
        if (parentEl) {
          // 更新画布大小
          canvasSize.value = {
            width: parentEl.clientWidth,
            height: parentEl.clientHeight,
          };

          console.log("窗口大小变化，调整画布大小:", canvasSize.value);

          // 调整图表大小
          resizeGraph();
        }
      }
    };

    // 获取图实例
    const getGraph = () => {
      return graph;
    };

    // 添加新节点
    const addNode = (config) => {
      if (graph) {
        return graph.addNode(config);
      }
      return null;
    };

    // 添加新边
    const addEdge = (config) => {
      if (graph) {
        return graph.addEdge(config);
      }
      return null;
    };

    // 清空画布
    const clearGraph = () => {
      if (graph) {
        graph.clearCells();
      }
    };

    // 导出图数据
    const exportGraph = () => {
      if (graph) {
        // 获取原始JSON数据
        const rawData = graph.toJSON();

        // 清理和简化数据以确保可序列化
        const cleanData = JSON.parse(
          JSON.stringify(rawData, (key, value) => {
            // 移除可能导致序列化问题的对象
            if (key === "file" && typeof value === "object") {
              // 对于文件对象，只保留必要的信息
              return {
                name: value.name,
                type: value.type,
                size: value.size,
                // 不保存完整的File对象
              };
            }

            // 对于URL字段，如果是blob URL，不进行保存
            if (
              key === "url" &&
              typeof value === "string" &&
              value.startsWith("blob:")
            ) {
              // 不保存临时的blob URL，这将在导入时重新创建
              return undefined;
            }

            // 移除 isPlaying 状态
            if (key === "isPlaying") {
              return undefined;
            }

            // 移除函数、DOM元素和其他不可序列化的值
            if (
              typeof value === "function" ||
              value instanceof Element ||
              value instanceof Event
            ) {
              return undefined;
            }

            return value;
          })
        );

        console.log("导出处理后的图数据成功");
        return cleanData;
      }
      return null;
    };

    // 导入图数据
    const importGraph = (data) => {
      if (graph) {
        // 设置标志表示正在导入图形
        isImporting = true;

        try {
          // 从JSON加载图形
          graph.fromJSON(data);

          // 处理视频节点，重新创建Blob URL
          const videoNodes = graph.getNodes().filter((node) => {
            const data = node.getData();
            return data && data.type === "video";
          });

          console.log(`找到 ${videoNodes.length} 个视频节点，进行恢复处理`);

          // 检查 electron API 是否可用
          const electronApiAvailable =
            typeof window.electron?.invoke === "function";
          if (!electronApiAvailable) {
            console.warn(
              "Electron API不可用，视频节点将无法恢复。请检查预加载脚本。"
            );
          }

          // 创建一个promises数组来跟踪所有视频文件加载
          const videoProcessingPromises = [];

          videoNodes.forEach((node) => {
            const nodeData = node.getData();
            if (nodeData && nodeData.filePath && electronApiAvailable) {
              // 创建一个异步函数来处理单个节点
              const processNode = async () => {
                try {
                  // 获取视频原始路径
                  const filePath = nodeData.filePath;
                  console.log(`恢复视频节点 ${node.id}，文件路径: ${filePath}`);

                  // 使用IPC检查文件是否存在
                  const exists = await window.electron.invoke(
                    "fsExistsSync",
                    filePath
                  );

                  if (exists) {
                    try {
                      // 使用IPC获取文件状态
                      const stats = await window.electron.invoke(
                        "fsStatSync",
                        filePath
                      );
                      if (stats.error) {
                        console.error(
                          `获取文件状态出错: ${filePath}`,
                          stats.error
                        );
                        return false;
                      }

                      const fileName = filePath.split(/[/\\]/).pop(); // 从路径中提取文件名

                      // 创建文件对象
                      const file = {
                        name: fileName,
                        type: nodeData.fileInfo.type || "video/mp4",
                        size: stats.size,
                        path: filePath,
                      };

                      try {
                        // 使用IPC读取文件并创建blob
                        const fileBuffer = await window.electron.invoke(
                          "fsReadFileSync",
                          filePath
                        );
                        if (fileBuffer && fileBuffer.length > 0) {
                          const videoUrl = URL.createObjectURL(
                            new Blob([fileBuffer])
                          );

                          // 更新节点的数据
                          node.setData({
                            ...nodeData,
                            url: videoUrl,
                          });

                          // 通知父组件视频节点已恢复
                          emit(
                            "video-node-created",
                            {
                              nodeId: node.id,
                              videoUrl: videoUrl,
                              fileName: file.name,
                              fileSize: (file.size / (1024 * 1024)).toFixed(2),
                              fileType: file.type,
                              filePath: filePath,
                            },
                            false
                          ); // 不自动播放

                          console.log(`视频节点 ${node.id} 恢复成功`);
                          return true;
                        } else {
                          console.error(`读取文件内容为空或失败: ${filePath}`);
                          return false;
                        }
                      } catch (fileError) {
                        console.error(`读取文件出错: ${filePath}`, fileError);
                        return false;
                      }
                    } catch (statsError) {
                      console.error(
                        `获取文件信息出错: ${filePath}`,
                        statsError
                      );
                      return false;
                    }
                  } else {
                    console.warn(`文件不存在: ${filePath}`);
                    return false;
                  }
                } catch (error) {
                  console.error(`恢复视频节点 ${node.id} 出错:`, error);
                  return false;
                }
              };

              // 将异步处理函数添加到promises数组
              videoProcessingPromises.push(processNode());
            } else if (nodeData && nodeData.filePath) {
              console.warn(`无法恢复视频节点 ${node.id}，Electron API不可用`);
            }
          });

          // 等待所有视频处理完成
          Promise.all(videoProcessingPromises).then((results) => {
            const successCount = results.filter(Boolean).length;
            console.log(
              `视频恢复处理完成，成功: ${successCount}/${videoProcessingPromises.length}`
            );

            // 视频恢复处理完成后，通知可能的监听器（例如Home.vue）
            emit("graph-import-completed", {
              videoNodesCount: videoNodes.length,
              videoNodesRestored: successCount,
            });
          });
        } catch (error) {
          console.error("导入图形数据出错:", error);
        } finally {
          // 重置标志
          isImporting = false;
          console.log("图形数据导入完成");
        }
      }
    };

    // 创建视频节点(供外部调用)
    const addVideoNode = (fileName, videoUrl) => {
      if (!graph) return null;

      // 创建一个模拟文件对象
      const fakeFile = {
        name: fileName,
        type: "video/mp4",
        size: 10 * 1024 * 1024, // 添加10MB的模拟大小
      };

      // 生成随机坐标
      const position = {
        x: 150 + Math.random() * 200,
        y: 150 + Math.random() * 100,
      };

      return createVideoNode(fakeFile, position);
    };

    // 处理从TabBar添加视频文件
    const handleAddVideoFromTab = (files) => {
      if (!graph) return;

      // 设置标志表示正在导入视频，不需要自动播放
      isImporting = true;

      // 确保files是数组
      const filesArray = Array.isArray(files) ? files : [files];

      console.log(`从TabBar添加${filesArray.length}个视频文件`);

      // 清除之前选中的节点
      selectedCells.forEach((cell) => {
        removeSelectedStyle(cell);
      });
      selectedCells = [];

      // 计算起始添加位置 - 屏幕中心偏上位置
      const centerX = canvasSize.value.width / 2;
      const centerY = canvasSize.value.height / 3;

      // 创建所有视频节点
      const addedNodes = [];

      filesArray.forEach((file, index) => {
        // 为多个文件设置错开的位置
        const position = {
          x: centerX - 100 + (index % 3) * 100, // 水平方向错开放置
          y: centerY + Math.floor(index / 3) * 120, // 每3个节点换一行
        };

        // 创建视频节点
        const node = createVideoNode(file, position);

        if (node) {
          addedNodes.push(node);
        }
      });

      // 如果添加了节点，选中最后一个节点
      if (addedNodes.length > 0) {
        addedNodes.forEach((node) => {
          applySelectedStyle(node);
        });
      }

      // 重置导入标志
      isImporting = false;
    };

    // 添加一个创建文本节点的方法
    const createTextNode = (position, text = "文本节点") => {
      if (!graph) return null;

      // 创建唯一ID
      const nodeId = `text-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      console.log(`正在创建文本节点，ID: ${nodeId}`);

      try {
        // 使用原生矩形节点
        const textNode = graph.addNode({
          id: nodeId,
          x: position.x - 90, // 居中放置
          y: position.y - 30,
          width: 180,
          height: 60,
          shape: "rect", // 使用矩形节点
          attrs: {
            body: {
              fill: "#ffffff",
              stroke: "#4b89dc",
              strokeWidth: 2,
              rx: 8, // 圆角
              ry: 8,
            },
            label: {
              text: text || "双击编辑文本",
              fill: "#333333",
              fontSize: 14,
              fontFamily: "Arial, sans-serif",
              refX: 0.5, // 水平居中
              refY: 0.5, // 垂直居中
              textAnchor: "middle", // 文本水平居中
              textVerticalAnchor: "middle", // 文本垂直居中
              // 双击可编辑样式
              class: "editable-label",
              textWrap: {
                width: 160, // 文本宽度
                height: 50, // 文本高度
                ellipsis: true, // 文本超出显示省略号
              },
            },
          },
          ports: {
            groups: {
              in: {
                position: "left",
                attrs: {
                  circle: {
                    r: 6,
                    magnet: true,
                    stroke: "#4b89dc",
                    strokeWidth: 2,
                    fill: "#fff",
                  },
                },
              },
              out: {
                position: "right",
                attrs: {
                  circle: {
                    r: 6,
                    magnet: true,
                    stroke: "#4b89dc",
                    strokeWidth: 2,
                    fill: "#fff",
                  },
                },
              },
            },
            items: [
              { id: `${nodeId}-in`, group: "in" },
              { id: `${nodeId}-out`, group: "out" },
            ],
          },
          data: {
            type: "text",
            text: text,
          },
        });

        console.log(`文本节点创建成功: ${nodeId}`);
        return textNode;
      } catch (error) {
        console.error("创建文本节点失败:", error);
        return null;
      }
    };

    // 修改TabBar添加选项的处理方法
    const handleAddOption = () => {
      if (!graph) return;

      console.log("添加选项按钮被点击");

      // 计算放置位置 - 屏幕中心
      const centerX = canvasSize.value.width / 2;
      const centerY = canvasSize.value.height / 2;

      const node = createTextNode({ x: centerX, y: centerY });

      if (node) {
        // 选中新创建的节点
        applySelectedStyle(node);
      }
    };

    // 监听 props 变化
    watch(
      () => props.width,
      () => {
        canvasSize.value.width = props.width;
        resizeGraph();
      }
    );
    watch(
      () => props.height,
      () => {
        canvasSize.value.height = props.height;
        resizeGraph();
      }
    );

    // 监听canvasSize变化
    watch(() => canvasSize.value, resizeGraph, { deep: true });

    // 组件挂载后初始化X6图形
    onMounted(() => {
      console.log("FlowGraph组件已挂载");
      // 创建并初始化图形
      initGraph();

      if (graph) {
        // 注册自定义节点和工具
        Graph.registerNodeTool("textEditor", TextEditorTool, true);

        // 监听双击节点事件
        graph.on("node:dblclick", ({ node }) => {
          console.log("节点被双击:", node.id);
          if (node.getData()?.type === "text") {
            // 为文本节点添加编辑工具
            node.addTools({
              name: "textEditor",
              args: {
                getText: () => {
                  return node.getData()?.text || node.attr("label/text") || "";
                },
                setText: (text) => {
                  // 更新节点文本和数据
                  node.attr("label/text", text);
                  node.setData({
                    ...node.getData(),
                    text: text,
                  });
                  console.log("文本已更新:", text);
                },
              },
            });
          }
        });
      }

      // 初始调整大小
      handleResize();

      // 添加窗口大小变化监听器
      window.addEventListener("resize", handleResize);

      // 设置文件操作相关的事件监听
      setupFileOperations();
    });

    // 组件卸载时清理
    onUnmounted(() => {
      if (graph) {
        // 移除键盘事件监听器
        document.removeEventListener("keydown", handleKeyDown);
        // 移除窗口大小变化监听器
        window.removeEventListener("resize", handleResize);

        // 移除鼠标事件监听器
        document.removeEventListener("mousedown", handleMouseDown);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.removeEventListener("auxclick", handleAuxClick);

        graph.dispose();
      }
    });

    // 暴露方法给父组件
    return {
      container,
      isDragging,
      textEditDialog,
      textEditTextarea,
      openTextEditDialog,
      closeTextEditDialog,
      saveTextEditDialog,
      getGraph,
      addNode,
      addEdge,
      clearGraph,
      exportGraph,
      importGraph,
      resizeGraph,
      addVideoNode,
      createTextNode,
      handleDragOver,
      handleDragLeave,
      handleDragEnter,
      handleDrop,
      handleAddVideoFromTab,
      handleAddOption,
      setPlayingNodeState,
    };
  },
};
</script>

<style scoped>
.flow-graph-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: #f5f5f5;
  position: relative;
  overflow: hidden; /* 防止内容溢出 */
}

.graph-container {
  flex: 1;
  position: relative;
  border: 2px dashed transparent;
  transition: all 0.3s ease;
  overflow: hidden;
  width: 100%; /* 确保宽度填满父容器 */
  height: 100%; /* 确保高度填满父容器 */
}

.graph-container:hover {
  border-color: #ccc;
}

.graph-container.drag-active {
  border-color: #2196f3;
  background-color: #f0f8ff;
}

.drag-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(33, 150, 243, 0.3);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 100;
  pointer-events: none;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0% {
    background-color: rgba(33, 150, 243, 0.2);
  }
  50% {
    background-color: rgba(33, 150, 243, 0.4);
  }
  100% {
    background-color: rgba(33, 150, 243, 0.2);
  }
}

.drag-message {
  padding: 20px 40px;
  background-color: #2196f3;
  color: white;
  border-radius: 8px;
  font-size: 16px;
  font-weight: bold;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.2);
  transform: scale(1);
  transition: transform 0.2s ease;
}

.drag-message:hover {
  transform: scale(1.05);
}

/* 添加指引文字样式 */
.instruction-text {
  position: absolute;
  bottom: 20px;
  right: 20px;
  background-color: rgba(0, 0, 0, 0.6);
  color: white;
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 14px;
  pointer-events: none;
  opacity: 0.7;
  transition: opacity 0.3s ease;
}

.flow-graph-container:hover .instruction-text {
  opacity: 1;
}

/* 确保X6节点正确显示 */
.x6-node {
  pointer-events: visible !important;
}

.x6-node[data-shape="html"] .x6-node-content {
  overflow: visible !important;
  pointer-events: visible !important;
}

/* 文本编辑相关样式 */
.x6-cell-tool-editor {
  position: absolute;
  display: flex;
  justify-content: center;
  align-items: center;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 20;
}

.x6-cell-tool-editor input {
  width: 90%;
  padding: 5px;
  border: 1px solid #1890ff;
  border-radius: 4px;
  outline: none;
  font-size: 14px;
  text-align: center;
  background-color: white;
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
}

/* 注意：文本节点样式现在直接内联在HTML元素中，不再使用CSS选择器 */

/* 文本编辑对话框样式 */
.text-edit-dialog {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.text-edit-dialog-content {
  width: 400px;
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  overflow: hidden;
}

.text-edit-dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #f0f0f0;
}

.text-edit-dialog-header h3 {
  margin: 0;
  font-size: 16px;
  color: #333;
}

.close-btn {
  background: none;
  border: none;
  font-size: 20px;
  color: #999;
  cursor: pointer;
}

.close-btn:hover {
  color: #666;
}

.text-edit-dialog-body {
  padding: 16px;
}

.text-edit-textarea {
  width: 100%;
  min-height: 120px;
  padding: 8px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  resize: vertical;
  font-size: 14px;
  outline: none;
  font-family: inherit;
}

.text-edit-textarea:focus {
  border-color: #1890ff;
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
}

.text-edit-dialog-footer {
  padding: 12px 16px;
  border-top: 1px solid #f0f0f0;
  text-align: right;
}

.cancel-btn,
.save-btn {
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  margin-left: 8px;
  font-size: 14px;
}

.cancel-btn {
  background-color: white;
  border: 1px solid #d9d9d9;
  color: #666;
}

.cancel-btn:hover {
  border-color: #1890ff;
  color: #1890ff;
}

.save-btn {
  background-color: #1890ff;
  border: 1px solid #1890ff;
  color: white;
}

.save-btn:hover {
  background-color: #40a9ff;
  border-color: #40a9ff;
}

/* 视频节点播放指示器样式 */
@keyframes pulse {
  0% {
    transform: scale(0.8);
    opacity: 0.6;
  }
  50% {
    transform: scale(1.1);
    opacity: 1;
  }
  100% {
    transform: scale(0.8);
    opacity: 0.6;
  }
}

@keyframes ripple {
  0% {
    transform: scale(1);
    opacity: 0.6;
  }
  100% {
    transform: scale(2.5);
    opacity: 0;
  }
}

/* X6 SVG动画 */
@keyframes x6-pulsate {
  0% {
    r: 5;
    opacity: 0.8;
  }
  50% {
    r: 7;
    opacity: 1;
  }
  100% {
    r: 5;
    opacity: 0.8;
  }
}

@keyframes x6-ripple {
  0% {
    r: 6;
    opacity: 0.8;
    stroke-width: 1;
  }
  100% {
    r: 15;
    opacity: 0;
    stroke-width: 0.5;
  }
}

.play-indicator {
  position: absolute;
  top: -10px;
  right: -10px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background-color: #2ecc71;
  z-index: 10;
  animation: pulse 1.5s infinite;
  box-shadow: 0 0 8px rgba(46, 204, 113, 0.8);
}

.play-indicator::after {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background-color: rgba(46, 204, 113, 0.6);
  z-index: 9;
  animation: ripple 2s infinite;
}
</style>

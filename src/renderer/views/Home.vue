<template>
  <div class="resizable-layout">
    <!-- 上部分：视频播放器 -->
    <div class="video-section" :style="{ height: topHeight + 'px' }">
      <div class="video-container">
        <video
          ref="videoPlayer"
          class="video-element"
          controls
          controlsList="nofullscreen"
          preload="metadata"
          @timeupdate="handleTimeUpdate"
          @ended="handleVideoEnded"
          @loadstart="handleVideoLoadStart"
        >
          <source :src="currentVideoUrl" type="video/mp4" />
          您的浏览器不支持 HTML5 视频播放。
        </video>

        <!-- 互动选项覆盖层 - 放在视频内部 -->
        <div
          v-if="interactiveOptions.length > 0"
          class="interactive-options-container"
        >
          <div
            v-for="(option, index) in interactiveOptions"
            :key="index"
            class="interactive-option"
            @click="handleOptionClick(option)"
          >
            {{ option.text }}
          </div>
        </div>
      </div>

      <div v-if="!currentVideoUrl" class="video-placeholder">
        拖拽视频文件到下方流程图中，并双击视频节点来播放
      </div>
    </div>

    <!-- 拖拽分隔条 -->
    <div
      class="resizer"
      @mousedown="startResize"
      :style="{ top: topHeight + 'px' }"
    ></div>

    <!-- 下部分：流程节点图 -->
    <div
      class="graph-section"
      :style="{
        top: topHeight + 'px',
        height: graphHeight + 'px',
      }"
    >
      <FlowGraph
        ref="flowGraph"
        class="graph"
        :width="graphWidth"
        :height="graphHeight"
        @node-selected="handleNodeSelected"
        @node-dblclicked="handleNodeDblClicked"
        @canvas-clicked="handleCanvasClicked"
        @video-node-created="handleVideoNodeCreated"
        @file-opened="handleFileOpened"
        @file-saved="handleFileSaved"
        @graph-import-completed="handleGraphImportCompleted"
      />
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from "vue";
import FlowGraph from "../components/FlowGraph.vue";

export default {
  name: "HomePage",
  components: {
    FlowGraph,
  },
  setup() {
    const videoPlayer = ref(null);
    const flowGraph = ref(null);
    const currentTime = ref(0);
    const topHeight = ref(300); // 顶部视频区域高度
    const isResizing = ref(false);
    const startY = ref(0);
    const startHeight = ref(0);
    const selectedNodeId = ref(null);
    const currentVideoUrl = ref("");
    const videoNodes = ref({}); // 存储视频节点信息 { nodeId: { url, filename } }
    const currentPlayingNodeId = ref(null); // 当前正在播放的节点ID
    const currentDownstreamNodes = ref([]); // 当前节点的下游节点

    // 互动选项状态
    const interactiveOptions = ref([]);

    // 节点映射 - 用于快速查找节点类型和内容
    const nodeMap = ref({});

    // 计算图表尺寸
    const graphWidth = ref(window.innerWidth);
    const graphHeight = computed(() => window.innerHeight - topHeight.value);

    // 全屏状态
    const isFullScreen = ref(false);

    // 当前打开的文件信息
    const currentFile = ref({
      filePath: null,
      fileName: null,
      hasChanges: false,
    });

    // 监听全屏状态变化
    const setupFullscreenListeners = () => {
      const fullscreenChangeHandler = () => {
        isFullScreen.value = !!(
          document.fullscreenElement ||
          document.webkitFullscreenElement ||
          document.mozFullScreenElement ||
          document.msFullscreenElement
        );
        console.log("全屏状态变化:", isFullScreen.value);

        // 如果有互动选项且处于全屏状态，确保选项可见
        if (isFullScreen.value && interactiveOptions.value.length > 0) {
          // 全屏模式下可能需要重新定位选项
          nextTick(() => {
            ensureOptionsVisibleInFullscreen();
          });
        }
      };

      // 添加各种浏览器前缀的全屏变化事件监听
      document.addEventListener("fullscreenchange", fullscreenChangeHandler);
      document.addEventListener(
        "webkitfullscreenchange",
        fullscreenChangeHandler
      );
      document.addEventListener("mozfullscreenchange", fullscreenChangeHandler);
      document.addEventListener("MSFullscreenChange", fullscreenChangeHandler);

      return () => {
        // 清理事件监听
        document.removeEventListener(
          "fullscreenchange",
          fullscreenChangeHandler
        );
        document.removeEventListener(
          "webkitfullscreenchange",
          fullscreenChangeHandler
        );
        document.removeEventListener(
          "mozfullscreenchange",
          fullscreenChangeHandler
        );
        document.removeEventListener(
          "MSFullscreenChange",
          fullscreenChangeHandler
        );
      };
    };

    // 确保选项在全屏模式下可见
    const ensureOptionsVisibleInFullscreen = () => {
      const optionsContainer = document.querySelector(
        ".interactive-options-container"
      );
      if (!optionsContainer || !isFullScreen.value) return;

      // 获取全屏元素
      const fullscreenElement =
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement;

      // 如果视频容器是全屏元素，确保选项容器在其中
      if (fullscreenElement) {
        console.log("全屏元素:", fullscreenElement);

        // 如果选项已经在全屏元素内，不需要额外处理
        if (fullscreenElement.contains(optionsContainer)) {
          console.log("选项容器已在全屏元素内");
        } else {
          console.log("选项容器不在全屏元素内，需要特殊处理");
          // 这里我们的组件结构已经确保选项容器在视频容器内，所以不应该出现这种情况
          // 如果仍有问题，可以考虑动态创建并附加选项到全屏元素
        }
      }
    };

    // 处理视频时间更新
    const handleTimeUpdate = () => {
      if (videoPlayer.value) {
        currentTime.value = videoPlayer.value.currentTime;
      }
    };

    // 开始拖动分隔条
    const startResize = (e) => {
      isResizing.value = true;
      startY.value = e.clientY;
      startHeight.value = topHeight.value;

      // 添加事件监听
      document.addEventListener("mousemove", handleResize);
      document.addEventListener("mouseup", stopResize);

      // 阻止默认行为和冒泡
      e.preventDefault();
      e.stopPropagation();
    };

    // 处理拖动过程
    const handleResize = (e) => {
      if (!isResizing.value) return;

      const deltaY = e.clientY - startY.value;
      const newHeight = Math.max(
        5, // 最小高度为分隔条的高度5px
        Math.min(window.innerHeight - 5, startHeight.value + deltaY) // 保留5px给分隔条
      );

      topHeight.value = newHeight;

      // 立即调整图表尺寸
      if (flowGraph.value) {
        nextTick(() => {
          flowGraph.value.resizeGraph();
        });
      }
    };

    // 停止拖动
    const stopResize = () => {
      isResizing.value = false;
      document.removeEventListener("mousemove", handleResize);
      document.removeEventListener("mouseup", stopResize);

      // 拖动结束后调用一次窗口大小调整函数
      handleWindowResize();
    };

    // 处理视频节点创建事件
    const handleVideoNodeCreated = (nodeData, autoPlay = true) => {
      console.log("创建了视频节点:", nodeData, "自动播放:", autoPlay);

      // 存储视频节点信息
      videoNodes.value[nodeData.nodeId] = {
        url: nodeData.videoUrl,
        fileName: nodeData.fileName,
        fileSize: nodeData.fileSize,
        fileType: nodeData.fileType,
        filePath: nodeData.filePath || "", // 保存文件路径
      };

      // 只有在autoPlay为true时才自动播放视频
      if (autoPlay) {
        console.log("允许自动播放视频");
        currentVideoUrl.value = nodeData.videoUrl;
        if (videoPlayer.value) {
          // 重新加载视频元素
          videoPlayer.value.load();

          // 加载完成后自动播放
          videoPlayer.value.onloadeddata = () => {
            videoPlayer.value.play().catch((err) => {
              console.log("自动播放失败:", err);
            });
          };
        }
      } else {
        console.log("禁止自动播放视频");
        // 不做任何播放相关操作
      }
    };

    // 处理节点选择事件
    const handleNodeSelected = (nodeId) => {
      selectedNodeId.value = nodeId;
      console.log("选中节点:", nodeId);

      // 注意：不再在这里处理视频播放，而是移到双击事件中
    };

    // 处理节点双击事件
    const handleNodeDblClicked = (data) => {
      // 从接收到的对象中提取nodeId
      const nodeId = data.nodeId || data;
      console.log(
        "双击节点:",
        nodeId,
        "下游节点:",
        data.downstreamNodeIds || []
      );

      // 检查是否是视频节点
      if (nodeId.startsWith("video-")) {
        // 获取图实例
        const graph = flowGraph.value?.getGraph();
        if (!graph) {
          console.error("无法获取图实例");
          return;
        }
        // 统一调用 playNextVideo 处理播放
        playNextVideo(nodeId, graph);
      }
      // 保留对旧示例节点的处理，如果需要的话
      else if (nodeId === "video") {
        // 示例视频节点
        if (videoPlayer.value) {
          // 设置节点的播放状态
          if (flowGraph.value) {
            flowGraph.value.setPlayingNodeState(nodeId, true);
          }
          videoPlayer.value.play().catch((err) => {
            console.log("播放失败:", err);
          });
        }
      }
    };

    // 处理画布点击事件
    const handleCanvasClicked = () => {
      selectedNodeId.value = null;
      console.log("取消选中");
    };

    // 处理视频播放结束事件
    const handleVideoEnded = () => {
      console.log("视频播放结束，检查下游节点");

      // 清空当前的互动选项
      interactiveOptions.value = [];

      // 如果当前有播放节点，清除其播放状态
      if (currentPlayingNodeId.value && flowGraph.value) {
        flowGraph.value.setPlayingNodeState(currentPlayingNodeId.value, false);
      }

      // 检查是否有下游节点
      if (
        currentDownstreamNodes.value &&
        currentDownstreamNodes.value.length > 0
      ) {
        // 获取图实例
        const graph = flowGraph.value.getGraph();
        if (!graph) return;

        // 从所有下游节点中筛选出文本节点
        const textOptions = [];

        currentDownstreamNodes.value.forEach((nodeId) => {
          const node = graph.getCellById(nodeId);
          if (!node) return;

          const data = node.getData();
          if (data && data.type === "text") {
            // 查找此文本节点的下游视频节点
            const videoNodesAfterText = findVideoNodesAfter(graph, nodeId);

            textOptions.push({
              nodeId: nodeId,
              text: data.text || node.attr("label/text") || "未命名选项",
              nextVideoNodes: videoNodesAfterText,
            });
          }
        });

        // 如果有文本选项，显示它们
        if (textOptions.length > 0) {
          console.log("显示互动选项:", textOptions);

          // 确保UI更新完成，再设置选项
          nextTick(() => {
            interactiveOptions.value = textOptions;

            // 在一些浏览器中，全屏模式下需要强制重新渲染选项
            if (isFullScreen.value) {
              console.log("在全屏模式下显示选项");
              // 如有必要，可以添加特殊处理代码
            }
          });

          return; // 不自动播放下一个视频，等待用户选择
        }

        // 如果没有文本选项，继续原来的逻辑，自动播放第一个下游视频节点
        const nextNodeId = currentDownstreamNodes.value[0]; // 获取第一个下游节点
        playNextVideo(nextNodeId, graph);
      } else {
        console.log("没有下游节点，播放结束");
      }
    };

    // 查找文本节点之后的视频节点
    const findVideoNodesAfter = (graph, textNodeId) => {
      const videoNodes = [];
      const outgoingEdges = graph.getOutgoingEdges(textNodeId);

      if (outgoingEdges && outgoingEdges.length > 0) {
        outgoingEdges.forEach((edge) => {
          const targetId = edge.getTargetCellId();
          const targetNode = graph.getCellById(targetId);

          if (targetNode) {
            const data = targetNode.getData();
            if (data && data.type === "video") {
              videoNodes.push(targetId);
            }
          }
        });
      }

      return videoNodes;
    };

    // 播放下一个视频（或由选项/双击触发的视频）
    const playNextVideo = async (nodeId, graph) => {
      if (!nodeId || !graph) return;
      console.log("准备播放视频节点:", nodeId);

      const videoNodeInfo = videoNodes.value[nodeId]; // 从 Home.vue 的状态获取基本信息
      if (!videoNodeInfo) {
        console.error(`无法在 videoNodes 中找到节点信息: ${nodeId}`);
        alert(`无法播放视频：找不到节点 ${nodeId} 的信息。`);
        return;
      }
      console.log("播放视频节点基本信息:", videoNodeInfo);

      // 异步函数，用于获取或创建有效的 Blob URL
      const getVideoUrl = async () => {
        if (videoNodeInfo.filePath && window.electron?.invoke) {
          try {
            const exists = await window.electron.invoke(
              "fsExistsSync",
              videoNodeInfo.filePath
            );
            if (exists) {
              const fileBuffer = await window.electron.invoke(
                "fsReadFileSync",
                videoNodeInfo.filePath
              );
              if (fileBuffer && fileBuffer.length > 0) {
                // 释放可能存在的旧 URL
                if (
                  videoNodeInfo.url &&
                  videoNodeInfo.url.startsWith("blob:")
                ) {
                  try {
                    URL.revokeObjectURL(videoNodeInfo.url);
                  } catch (e) {
                    /* ignore */
                  }
                }
                // 创建新的 Blob URL
                const newUrl = URL.createObjectURL(new Blob([fileBuffer]));
                console.log("成功获取/创建视频URL:", newUrl);
                // 更新 videoNodes 中的 URL (重要!)
                videoNodes.value[nodeId].url = newUrl;
                return newUrl;
              } else {
                console.error(
                  "读取文件内容为空或失败: ",
                  videoNodeInfo.filePath
                );
                return null;
              }
            } else {
              console.error("文件不存在:", videoNodeInfo.filePath);
              return null;
            }
          } catch (error) {
            console.error("读取文件或创建 URL 失败:", error);
            return null;
          }
        } else {
          console.warn(
            "节点没有有效的文件路径或Electron API不可用，尝试使用现有URL"
          );
          // 如果没有filePath，尝试使用现有的URL（可能来自拖放或旧逻辑）
          if (videoNodeInfo.url && videoNodeInfo.url.startsWith("blob:")) {
            console.log("使用节点现有的Blob URL:", videoNodeInfo.url);
            return videoNodeInfo.url;
          } else {
            console.error("无法获取有效的视频URL");
            return null;
          }
        }
      };

      // 调用异步函数获取 URL
      const validUrl = await getVideoUrl();

      if (!validUrl) {
        alert(
          `无法播放视频：文件 ${
            videoNodeInfo.fileName || videoNodeInfo.filePath
          } 可能已移动、删除或无法读取。`
        );
        return;
      }

      console.log("获取到有效的URL，准备播放:", validUrl);

      // --- 更新状态和UI ---

      // 1. 更新当前播放节点ID
      currentPlayingNodeId.value = nodeId;
      console.log("当前播放节点ID更新为:", nodeId);

      // 2. 设置节点的播放状态 (视觉效果)
      if (flowGraph.value) {
        flowGraph.value.setPlayingNodeState(nodeId, true);
      }

      // 3. 获取并更新下游节点列表
      const nextDownstreamNodes = [];
      const outgoingEdges = graph.getOutgoingEdges(nodeId);
      if (outgoingEdges && outgoingEdges.length > 0) {
        outgoingEdges.forEach((edge) => {
          nextDownstreamNodes.push(edge.getTargetCellId());
        });
      }
      currentDownstreamNodes.value = nextDownstreamNodes;
      console.log("下一个节点的下游节点更新为:", nextDownstreamNodes);

      // 4. 更新视频播放器的URL
      currentVideoUrl.value = validUrl;
      console.log("视频播放器URL更新为:", validUrl);

      // --- 加载并播放视频 ---
      if (videoPlayer.value) {
        // 确保 video 元素的 src 属性已更新
        nextTick(() => {
          if (videoPlayer.value.src !== validUrl) {
            console.log("设置 video.src:", validUrl);
            videoPlayer.value.src = validUrl;
          } else {
            console.log("video.src 无需更新，已经是:", validUrl);
          }
          console.log("调用 video.load()");
          videoPlayer.value.load(); // 在 src 设置后调用 load

          // 添加 onloadeddata 监听器来确保视频加载完成再播放
          videoPlayer.value.onloadeddata = () => {
            console.log("视频数据已加载 (onloadeddata)，尝试播放");
            videoPlayer.value
              .play()
              .then(() => {
                console.log("视频播放成功启动");
                // 播放成功启动后，强制调整窗口大小
                nextTick(() => {
                  handleWindowResize();
                  console.log("视频播放启动后触发窗口调整");
                });
              })
              .catch((err) => {
                console.error("播放失败:", err);
                alert(
                  `播放视频失败: ${err.message}\nURL: ${validUrl}\n请检查文件是否有效以及控制台输出。`
                );
              });
            // 清除监听器，避免重复执行
            videoPlayer.value.onloadeddata = null;
          };

          // 处理加载错误
          videoPlayer.value.onerror = (e) => {
            console.error(
              "视频加载错误 (onerror):",
              e,
              videoPlayer.value.error
            );
            alert(
              `加载视频失败，请检查文件格式或路径是否正确。错误: ${
                videoPlayer.value.error?.message || "未知错误"
              }`
            );
            // 清除监听器
            videoPlayer.value.onerror = null;
          };
        });
      } else {
        console.error("videoPlayer 引用无效");
      }
    };

    // 处理选项点击
    const handleOptionClick = (option) => {
      console.log("用户选择了选项:", option);

      // 清空互动选项
      interactiveOptions.value = [];

      // 获取图实例
      const graph = flowGraph.value.getGraph();
      if (!graph) return;

      // 如果选项有关联的下一个视频节点，播放它
      if (option.nextVideoNodes && option.nextVideoNodes.length > 0) {
        const nextVideoNodeId = option.nextVideoNodes[0];

        // 延迟一帧执行，确保UI已更新（特别是在全屏模式下）
        nextTick(() => {
          playNextVideo(nextVideoNodeId, graph);
        });
      } else {
        console.log("该选项没有关联的下一个视频节点");
      }
    };

    // 处理视频加载开始事件
    const handleVideoLoadStart = () => {
      console.log("视频开始加载，当前URL:", currentVideoUrl.value);

      // 如果是通过导入/拖放添加的视频（不是通过双击选择的），阻止自动播放
      if (!currentPlayingNodeId.value) {
        console.log("阻止自动播放 - 视频未通过双击选择");
        if (videoPlayer.value) {
          videoPlayer.value.pause();
        }
      }
    };

    // 监听currentVideoUrl变化，控制视频行为
    watch(currentVideoUrl, (newUrl, oldUrl) => {
      console.log("视频URL变化:", oldUrl, "->", newUrl);

      // 只在双击节点时才自动播放视频
      if (newUrl && currentPlayingNodeId.value) {
        console.log("URL变化由双击节点触发，允许播放");
      } else if (newUrl) {
        console.log("URL变化非由双击节点触发，阻止自动播放");
        // 让视频加载但不自动播放
        if (videoPlayer.value) {
          videoPlayer.value.pause();
        }
      }
    });

    // 处理文件打开事件
    const handleFileOpened = (fileInfo) => {
      console.log("文件已打开:", fileInfo);

      // --- 重置播放状态和相关数据 ---
      // 1. 停止当前播放并清除源
      if (videoPlayer.value) {
        videoPlayer.value.pause();
        // 移除 src 属性而不是设置为空字符串
        videoPlayer.value.removeAttribute("src");
        // 清除内部可能残留的 source 元素 (如果存在且动态添加)
        const sourceElement = videoPlayer.value.querySelector("source");
        if (sourceElement) {
          videoPlayer.value.removeChild(sourceElement);
        }
        // 显式调用 load() 来应用更改并停止任何加载尝试
        videoPlayer.value.load();
      }
      // 2. 清除播放器URL状态
      currentVideoUrl.value = "";
      // 3. 重置播放状态ID
      currentPlayingNodeId.value = null;
      // 4. 清除下游节点
      currentDownstreamNodes.value = [];
      // 5. 清除互动选项
      interactiveOptions.value = [];

      // 6. 清除旧的视频节点信息并释放Blob URL
      if (videoNodes.value) {
        Object.values(videoNodes.value).forEach((node) => {
          if (node.url && node.url.startsWith("blob:")) {
            try {
              URL.revokeObjectURL(node.url);
              console.log(`释放旧 Blob URL: ${node.url}`);
            } catch (revokeError) {
              console.error(`释放 Blob URL 出错: ${node.url}`, revokeError);
            }
          }
        });
        videoNodes.value = {}; // 清空集合
      }

      // 7. 清除 FlowGraph 中的播放状态
      if (flowGraph.value) {
        flowGraph.value.setPlayingNodeState(null, false);
      }
      // --- 重置结束 ---

      // 更新当前文件信息
      currentFile.value = {
        filePath: fileInfo.filePath,
        fileName: fileInfo.fileName,
        hasChanges: false,
      };

      // 可以在这里更新窗口标题等
      document.title = `交互式视频编辑器 - ${fileInfo.fileName}`;

      // 文件打开后，强制重新计算并应用画布尺寸
      nextTick(() => {
        handleWindowResize();
        console.log("文件打开后触发窗口调整");
      });
    };

    // 处理文件保存事件
    const handleFileSaved = (fileInfo) => {
      console.log("文件已保存:", fileInfo);

      // 更新当前文件信息
      currentFile.value = {
        filePath: fileInfo.filePath,
        fileName: fileInfo.fileName,
        hasChanges: false,
      };

      // 可以在这里更新窗口标题等
      document.title = `交互式视频编辑器 - ${fileInfo.fileName}`;
    };

    // 处理图表导入完成事件
    const handleGraphImportCompleted = () => {
      console.log("图表导入完成");
      // 可以在这里添加处理导入完成后的逻辑
    };

    // 组件挂载时初始化
    onMounted(() => {
      // 确保视频不会自动播放
      if (videoPlayer.value) {
        videoPlayer.value.autoplay = false;
      }

      // 添加窗口大小变化监听
      window.addEventListener("resize", handleWindowResize);

      // 监听全屏变化
      document.addEventListener("fullscreenchange", () => {
        console.log("全屏状态变化");
        // 延时确保DOM完全更新
        setTimeout(handleWindowResize, 500);
      });

      // 设置全屏状态监听器
      const cleanupFullscreenListeners = setupFullscreenListeners();

      // 检测窗口最大化状态变化
      let isMaximized =
        window.outerWidth >= window.screen.availWidth &&
        window.outerHeight >= window.screen.availHeight;

      // 使用定时器检测最大化状态变化
      const maximizeCheckInterval = setInterval(() => {
        const currentMaximized =
          window.outerWidth >= window.screen.availWidth &&
          window.outerHeight >= window.screen.availHeight;

        if (currentMaximized !== isMaximized) {
          console.log(
            "窗口最大化状态变化:",
            currentMaximized ? "最大化" : "还原"
          );
          isMaximized = currentMaximized;

          // 延时处理，确保能获取正确尺寸
          setTimeout(handleWindowResize, 500);
        }
      }, 1000);

      // 使用nextTick确保DOM已更新
      nextTick(() => {
        // 延时确保组件完全渲染
        setTimeout(() => {
          handleWindowResize();
          console.log("初始化完成后调整尺寸");
        }, 300);
      });

      // 返回清理函数，在组件卸载时执行
      return () => {
        clearInterval(maximizeCheckInterval);
        cleanupFullscreenListeners();
      };
    });

    // 组件卸载时清理
    onUnmounted(() => {
      // 停止视频播放
      if (videoPlayer.value) {
        videoPlayer.value.pause();
        videoPlayer.value.src = "";
        currentVideoUrl.value = "";
      }

      // 清除所有节点的播放状态
      if (flowGraph.value) {
        flowGraph.value.setPlayingNodeState(null, false);
      }

      // 释放视频资源
      Object.values(videoNodes.value).forEach((node) => {
        if (node.url && node.url.startsWith("blob:")) {
          URL.revokeObjectURL(node.url);
        }
      });

      window.removeEventListener("resize", handleWindowResize);
      document.removeEventListener("fullscreenchange", handleWindowResize);
      document.removeEventListener("mousemove", handleResize);
      document.removeEventListener("mouseup", stopResize);
    });

    // 处理窗口大小变化
    const handleWindowResize = () => {
      console.log("触发窗口大小变化事件");

      // 使用更可靠的方式获取窗口大小
      // 利用documentElement的clientHeight/Width来获取可视区域大小
      const windowWidth =
        document.documentElement.clientWidth || window.innerWidth;
      const windowHeight =
        document.documentElement.clientHeight || window.innerHeight;

      // 更新图表宽度
      graphWidth.value = windowWidth;

      // 确保顶部高度不超过窗口高度，且保留分隔条高度
      if (topHeight.value > windowHeight - 5) {
        topHeight.value = windowHeight - 5;
      }

      // 强制计算图表高度 - 当前窗口高度减去顶部高度
      const calculatedGraphHeight = windowHeight - topHeight.value;

      // 手动设置graph-section的高度
      const graphSection = document.querySelector(".graph-section");
      if (graphSection) {
        graphSection.style.height = `${calculatedGraphHeight}px`;
      }

      // 确保flowGraph能够获取到正确的容器大小
      const graphContainer = document.querySelector(".graph-container");
      if (graphContainer) {
        console.log(
          "图表容器尺寸:",
          graphContainer.offsetWidth,
          graphContainer.offsetHeight
        );
      }

      // 延迟调用resizeGraph确保DOM已更新
      if (flowGraph.value) {
        setTimeout(() => {
          flowGraph.value.resizeGraph();

          // 二次确认，防止尺寸仍不正确
          setTimeout(() => {
            flowGraph.value.resizeGraph();
          }, 300);
        }, 100);
      }

      console.log("窗口大小变化，更新尺寸:", {
        windowWidth,
        windowHeight,
        topHeight: topHeight.value,
        graphHeight: calculatedGraphHeight,
        isMaximized:
          window.outerWidth >= window.screen.availWidth &&
          window.outerHeight >= window.screen.availHeight,
      });
    };

    return {
      videoPlayer,
      flowGraph,
      currentTime,
      topHeight,
      graphWidth,
      graphHeight,
      selectedNodeId,
      currentVideoUrl,
      currentPlayingNodeId,
      currentDownstreamNodes,
      interactiveOptions,
      isFullScreen,
      startResize,
      handleTimeUpdate,
      handleNodeSelected,
      handleNodeDblClicked,
      handleCanvasClicked,
      handleVideoNodeCreated,
      handleVideoEnded,
      handleVideoLoadStart,
      handleFileOpened,
      handleFileSaved,
      handleOptionClick,
      handleGraphImportCompleted,
    };
  },
};
</script>

<style scoped>
.resizable-layout {
  position: relative;
  width: 100%;
  height: 100vh;
  overflow: hidden;
  background-color: #f5f5f5; /* 改为与图表相同的背景色 */
}

/* 视频部分 */
.video-section {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  background-color: #000;
  overflow: hidden;
  z-index: 1;
  display: flex;
  justify-content: center;
  align-items: center;
}

.video-container {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.video-element {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background-color: #000;
  display: block;
}

/* 隐藏全屏按钮 - 适用于WebKit浏览器（Chrome, Safari） */
.video-element::-webkit-media-controls-fullscreen-button {
  display: none;
}

/* 隐藏全屏按钮 - 适用于Firefox */
.video-element::-moz-fullscreen-button {
  display: none;
}

/* 隐藏全屏按钮 - 适用于MS Edge */
.video-element::-ms-fullscreen-button {
  display: none;
}

.video-placeholder {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #999;
  text-align: center;
  font-size: 18px;
  max-width: 80%;
  pointer-events: none;
}

/* 互动选项样式 */
.interactive-options-container {
  position: absolute;
  bottom: 50px;
  left: 0;
  width: 100%;
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 15px;
  padding: 0 20px;
  z-index: 10;
  pointer-events: auto;
}

/* 确保在全屏模式下选项仍然可见 */
.video-section:fullscreen .interactive-options-container {
  position: fixed;
  bottom: 50px;
  left: 0;
  width: 100%;
  z-index: 9999;
}

/* 特定浏览器的全屏支持 */
.video-section:-webkit-full-screen .interactive-options-container {
  position: fixed;
  bottom: 50px;
  left: 0;
  width: 100%;
  z-index: 9999;
}

.video-section:-moz-full-screen .interactive-options-container {
  position: fixed;
  bottom: 50px;
  left: 0;
  width: 100%;
  z-index: 9999;
}

.video-section:-ms-fullscreen .interactive-options-container {
  position: fixed;
  bottom: 50px;
  left: 0;
  width: 100%;
  z-index: 9999;
}

.interactive-option {
  background-color: rgba(75, 137, 220, 0.85);
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 16px;
  transition: all 0.3s ease;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(4px);
  max-width: 400px;
}

.interactive-option:hover {
  background-color: rgba(54, 109, 192, 0.95);
  transform: translateY(-3px);
  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.4);
}

/* 拖拽分隔条 */
.resizer {
  position: absolute;
  left: 0;
  width: 100%;
  height: 5px;
  background-color: #333;
  cursor: ns-resize;
  z-index: 3;
}

.resizer:hover,
.resizer:active {
  background-color: #42b983;
}

/* 图表部分 */
.graph-section {
  position: absolute;
  left: 0;
  width: 100%;
  background-color: #f5f5f5;
  overflow: hidden;
  z-index: 1;
  bottom: 0; /* 确保延伸到底部 */
  box-sizing: border-box; /* 确保边框不会增加元素尺寸 */
  min-height: 0; /* 允许最小高度为0 */
}

.graph {
  width: 100%;
  height: 100%;
  background-color: #f5f5f5;
  min-height: 0; /* 允许最小高度为0 */
}
</style>

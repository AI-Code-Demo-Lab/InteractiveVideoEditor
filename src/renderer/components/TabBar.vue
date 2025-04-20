<template>
  <div class="tab-bar">
    <div class="tab-buttons">
      <button class="tab-button" @click="handleAddVideo">
        <span class="icon">+</span>
        添加视频
      </button>
      <button class="tab-button" @click="handleAddOption">
        <span class="icon">⚙</span>
        添加选项
      </button>
    </div>
  </div>
</template>

<script>
export default {
  name: "TabBar",
  emits: ["add-video", "add-option"],
  setup(props, { emit }) {
    // 处理添加视频按钮点击
    const handleAddVideo = () => {
      // 创建一个隐藏的文件输入元素
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = "video/*"; // 只接受视频文件
      fileInput.multiple = true; // 支持多选
      fileInput.style.display = "none";
      document.body.appendChild(fileInput);

      // 监听文件选择
      fileInput.addEventListener("change", (e) => {
        const files = e.target.files;
        if (files && files.length > 0) {
          // 将选择的文件发送到父组件 (转换为数组)
          const filesArray = Array.from(files);
          emit("add-video", filesArray);
        }
        // 从DOM中移除文件输入元素
        document.body.removeChild(fileInput);
      });

      // 触发文件选择对话框
      fileInput.click();
    };

    // 处理添加选项按钮点击
    const handleAddOption = () => {
      // 发出添加选项事件
      emit("add-option");
      console.log("添加选项按钮被点击，发送事件到父组件");
    };

    return {
      handleAddVideo,
      handleAddOption,
    };
  },
};
</script>

<style scoped>
.tab-bar {
  width: 100%;
  background-color: #2c3e50;
  padding: 8px 16px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  display: flex;
  align-items: center;
  z-index: 10;
}

.tab-buttons {
  display: flex;
  gap: 10px;
}

.tab-button {
  display: flex;
  align-items: center;
  gap: 5px;
  background-color: #3498db;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 8px 12px;
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.tab-button:hover {
  background-color: #2980b9;
}

.tab-button .icon {
  font-weight: bold;
  font-size: 16px;
}
</style>

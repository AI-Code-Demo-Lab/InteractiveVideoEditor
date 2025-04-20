<template>
  <div
    class="text-node"
    :class="{ selected: data.selected }"
    @dblclick="handleDblClick"
  >
    <div class="handle input-handle" />
    <div class="text-content">
      <div v-if="isEditing" class="edit-container">
        <input
          ref="inputRef"
          v-model="editText"
          class="text-input nodrag"
          @keyup.enter="saveText"
          @blur="saveText"
          @click.stop
          @mousedown.stop
        />
      </div>
      <div v-else class="text-display">
        {{ data.text || "双击编辑文本" }}
      </div>
    </div>
    <div class="handle output-handle" />
  </div>
</template>

<script>
import { ref, computed, onMounted, nextTick } from "vue";

export default {
  name: "TextNode",
  props: {
    id: {
      type: String,
      required: true,
    },
    data: {
      type: Object,
      required: true,
    },
  },
  setup(props, { emit }) {
    const isEditing = ref(false);
    const editText = ref("");
    const inputRef = ref(null);

    // 处理双击事件
    const handleDblClick = (e) => {
      e.stopPropagation(); // 阻止事件冒泡
      isEditing.value = true;
      editText.value = props.data.text || "";

      // 等待DOM更新后聚焦输入框
      nextTick(() => {
        if (inputRef.value) {
          inputRef.value.focus();
        }
      });
    };

    // 保存编辑的文本
    const saveText = () => {
      isEditing.value = false;

      if (props.data.text !== editText.value) {
        // 发出文本更新事件，这样外部组件可以更新节点数据
        emit("update:text", props.id, editText.value);

        // 同时发出一个DOM自定义事件，以便FlowGraph组件可以捕获
        const event = new CustomEvent("textnode:update", {
          detail: {
            nodeId: props.id,
            text: editText.value,
          },
          bubbles: true, // 确保事件冒泡
          cancelable: true,
        });
        document.dispatchEvent(event);
      }
    };

    return {
      isEditing,
      editText,
      inputRef,
      handleDblClick,
      saveText,
    };
  },
};
</script>

<style scoped>
.text-node {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 8px;
  background-color: white;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  border: 2px solid #4b89dc;
  font-family: Arial, sans-serif;
  display: flex;
  align-items: center;
  padding: 10px 20px;
  box-sizing: border-box;
  min-height: 60px;
  z-index: 1;
}

.text-node.selected {
  border-color: #1890ff;
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.4);
}

.text-content {
  flex: 1;
  text-align: center;
  padding: 5px;
  margin: 0 15px;
  width: calc(100% - 30px);
  overflow: visible;
}

.text-input {
  width: 100%;
  padding: 5px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
  display: block;
}

.text-input:focus {
  border-color: #1890ff;
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
}

.text-display {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 14px;
  color: #333;
  width: 100%;
}

.handle {
  position: absolute;
  width: 12px;
  height: 12px;
  background: #4b89dc;
  border-radius: 50%;
  top: 50%;
  transform: translateY(-50%);
  cursor: crosshair;
  z-index: 10;
}

.input-handle {
  left: -6px;
}

.output-handle {
  right: -6px;
}

.edit-container {
  width: 100%;
  position: relative;
}
</style>

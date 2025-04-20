import { defineStore } from "pinia";

// 定义主应用状态存储
export const useAppStore = defineStore("app", {
  state: () => ({
    appName: "交互式视频编辑器",
    isLoading: false,
    currentProject: null,
    projects: [],
  }),

  getters: {
    // 获取项目数量
    projectCount: (state) => state.projects.length,

    // 判断是否有活跃项目
    hasActiveProject: (state) => state.currentProject !== null,
  },

  actions: {
    // 设置加载状态
    setLoading(status) {
      this.isLoading = status;
    },

    // 创建新项目
    createProject(project) {
      const newProject = {
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
        ...project,
      };

      this.projects.push(newProject);
      this.currentProject = newProject;

      return newProject;
    },

    // 切换当前项目
    setCurrentProject(projectId) {
      const project = this.projects.find((p) => p.id === projectId);
      if (project) {
        this.currentProject = project;
        return true;
      }
      return false;
    },

    // 更新项目
    updateProject(projectId, updates) {
      const index = this.projects.findIndex((p) => p.id === projectId);
      if (index !== -1) {
        this.projects[index] = {
          ...this.projects[index],
          ...updates,
          updatedAt: new Date().toISOString(),
        };

        if (this.currentProject && this.currentProject.id === projectId) {
          this.currentProject = this.projects[index];
        }

        return true;
      }
      return false;
    },
  },
});

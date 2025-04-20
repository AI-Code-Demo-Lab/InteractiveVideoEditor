import { createRouter, createWebHashHistory } from "vue-router";

// 导入视图组件
const Home = () => import("../views/Home.vue");

// 定义路由
const routes = [
  {
    path: "/",
    name: "Home",
    component: Home,
  },
  // 如果访问未定义的路由，重定向到首页
  {
    path: "/:pathMatch(.*)*",
    redirect: "/",
  },
];

// 创建路由实例
const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;

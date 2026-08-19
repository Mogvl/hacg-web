# HACG Web（琉璃神社 Web 端）

参照 [yueeng/hacg](https://github.com/yueeng/hacg)（Apache-2.0，Android 客户端）以“功能与原版完全一致”为目标实现的 Web 版：

- **前端**（Vue 3 + Vite + TypeScript）：端口 **8200**
- **后端**（Node.js + Express + cheerio）：端口 **8201**（抓取/解析/评论/代理）

## 快速开始

```bash
npm install
# 同时启动前后端（后端 8201 / 前端 8200）
npm run dev
# 或分开启动
npm run dev -w backend
npm run dev -w frontend
```

浏览器访问 <http://localhost:8200>。

生产构建：`npm run build`（产物在 `frontend/dist`），`npm run preview` 在 8200 端口以静态方式预览（`/api` 仍代理到 8201）。后端可用 `BACKEND_PORT` 环境变量覆盖端口。

## 一键部署（Docker Compose）

镜像由 GitHub Actions 在每次推送 `main` 时自动构建并推送到 GHCR，只需要 Docker 环境即可部署：

```bash
# 1. 拉取部署文件
git clone https://github.com/Mogvl/hacg-web.git
cd hacg-web

# 2. 一键启动（前端 8200 / 后端 8201，容器网络内互通）
docker compose up -d
```

浏览器访问 <http://<主机IP>:8200>。

- 前端镜像 `ghcr.io/mogvl/hacg-web/hacg-web-frontend:latest`（nginx 静态服务，`/api` 反向代理到后端）
- 后端镜像 `ghcr.io/mogvl/hacg-web/hacg-web-server:latest`（数据目录 `/data`，映射为 named volume `hacg-data`；NAS 等场景可在 compose 中改成绑定挂载，如 `/volume1/docker/hacg:/data`）
- 更新：`docker compose pull && docker compose up -d`

`docker-compose.yml` 完整内容：

```yaml
# hacg-web 一键部署（镜像由 GitHub Actions 自动构建推送到 GHCR）
# 用法：docker compose up -d   访问 http://<主机>:8200
services:
  hacg-web:
    image: ghcr.io/mogvl/hacg-web/hacg-web-frontend:latest
    container_name: hacg-web
    ports:
      - "8200:80"
    environment:
      - TZ=Asia/Shanghai
    restart: unless-stopped

  hacg-server:
    image: ghcr.io/mogvl/hacg-web/hacg-web-server:latest
    container_name: hacg-server
    environment:
      - TZ=Asia/Shanghai
      - HACG_DATA_DIR=/data
    volumes:
      # 想要绑定挂载（NAS 等）时改为：
      # - /volume1/docker/hacg:/data
      - hacg-data:/data
    restart: unless-stopped

volumes:
  hacg-data:
```

## 功能对照（与原版 yueeng/hacg 逐项对齐）

| 原版功能 | Web 实现 |
| --- | --- |
| 分类 Tab（最新/动画/漫画/游戏/文章/音乐/轻小说）+ 文章分页列表 | 首页 Tab + 无限滚动列表 |
| 文章卡片（随机色标题、彩色标签 chips、摘要、图片懒加载、时间行） | `ArticleCard`，含滑动入场动画 |
| 下拉刷新 / 加载更多 / 空/完/失败 footer / 黑猫点击重试 | `ArticleList` |
| 文章详情（jsoup Safelist 清洗、去 width/height、懒加载图、“下载此图”） | `DetailView` 内容页 |
| 磁力/百度云链接提取（40/32 位 hash、8+4 提取码） | 后端正则（与原版一致） |
| FAB 菜单：浏览器打开 / 评论 / 分享 / 链接（连点 3 次弹出） | `FabMenu` |
| 图片预览对话框：分享/保存/取消 | 保存对话框 |
| 内置浏览器（哲学/登录/用户主页），后退/前进/首页/刷新，WP 链接按类型路由 | `WebViewPage`（后端代理 + cookie 会话） |
| ~~评论/点赞~~（按需求移除，前端无任何评论/点赞入口） | 后端 wpdiscuz 接口保留，可随时恢复 |
| 搜索（含历史记录/清除）、搜索页 | 工具栏搜索 |
| 备用域名列表 / 变更域名 / 重置所有 / 自动选择最快域名 / 检测域名配置更新 | `HostDialog` + 菜单 |
| 关于对话框 / 检查更新（GitHub Releases） | `UpdateDialog` |
| 登录状态识别（`"user_id":"\d+"`） | 后端会话内识别，前端轮询 |
| 排版参照 | 与 hacg.me/wp 同源主题对齐：单列文章流、大图、标题、meta 行、摘要 |
| 退出确认（连按返回） | 浏览器行为由浏览器接管 |

## 目录结构

```
backend/            Node 后端（8201）
  src/
    index.js        Express API
    config.js       HAcg 配置（域名/分类/bbs，GitHub 远端配置更新）
    http.js         带 cookie 会话的抓取（手动重定向、user_id 识别）
    article.js      文章列表/详情解析（jsoup 逐选择器对齐）+ Safelist 清洗
    comment.js      wpdiscuz 评论加载/投票/发表
    proxy.js        页面代理（base/拦截脚本注入、CSS url() 改写、图片代理）
    session.js      每客户端 cookie jar 会话
  test/             单元测试（含站点抓取的 fixture）
frontend/           Vue 前端（8200）
  src/
    views/          Home / List / Detail / WebView
    components/     ArticleCard / ArticleList / CommentPanel / CommentItem /
                    CommentPostDialog / HostDialog / FabMenu / UpdateDialog
    api.ts          后端 API 封装
    store.ts        全局状态
    utils.ts        toast / 随机色 / 时间格式 / 磁力链接 / 剪贴板 / 历史
```

## 工作原理

- 后端是唯一直接访问 hacg 站点（`www.hacg.icu` / `www.hacg.mov` / `www.hacg.me` 等）的服务，前端只通过 `/api/*` 与后端交互，避免浏览器跨域与混合内容问题。
- 登录流程：WebView 页通过后端代理渲染登录页，表单提交经代理携带会话 cookie；后端在任意 WordPress 页面中识别 `"user_id":"..."` 并记录，之后发表评论即可免填姓名/邮箱（与原版一致）。
- 解析器（`article.js`/`comment.js`）逐选择器复刻原版 jsoup 代码，并用站点真实页面作为测试 fixture 保证行为一致。

## 致谢

原版客户端 [yueeng/hacg](https://github.com/yueeng/hacg)（Apache License 2.0）。本项目仅为功能复刻与 Web 移植。

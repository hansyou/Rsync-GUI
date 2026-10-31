# AGENTS.md — Rsync-GUI 设计要点

> **维护约定：本文件记录项目的设计要点与约定。任何改动（功能、结构、UI、依赖）完成后，必须在收尾时同步更新本文件对应小节。**
> 修改 UI 相关内容时，请同时对照「UI 设计语言」小节，保持风格一致。

## 项目概述

轻量级 Web 应用：通过浏览器管理 rsync / rclone 备份任务。单用户、无鉴权、无前端框架、无构建工具。

- 技术栈：Python ≥ 3.12 + Flask + Flask-SocketIO + APScheduler + SQLite；前端为原生 JS + 原生 CSS
- 入口：`main.py` → `rsync_gui/app.py:main()`；默认监听 `0.0.0.0:9765`（`async_mode="threading"`）
- 数据目录：环境变量 `RSYNC_GUI_DATA`（未设置时默认 `./data`，Docker 内为 `/app/data`）
  - SQLite 库：`tasks.db` / `remote_tasks.db` / `rclone_tasks.db`
  - 运行日志：`logs/task_{id}.json` / `remote_task_{id}.json` / `rclone_task_{id}.json`（JSON，读取时只保留末 200 行）
- Docker / 打包：PyInstaller 单文件（见「开发、编译与发布」）；Docker 环境变量 `RCLONE_CONFIG`、`XDG_CACHE_HOME` 也指向数据卷

## 目录结构

```
rsync_gui/
├── app.py             # Flask 应用工厂 create_app()、启动入口、root 检测
├── models.py          # 本地任务 SQLite 模型 + CRUD
├── remote_models.py   # 远程任务模型（表 remote_tasks）
├── rclone_models.py   # 网盘任务模型（表 rclone_tasks）
├── routes.py          # Blueprint "api"     → /api/tasks/*
├── remote_routes.py   # Blueprint "remote"  → /api/remote/*
├── rclone_routes.py   # Blueprint "rclone"  → /api/rclone/*
├── rsync_worker.py    # rsync 命令构建/执行/停止/日志（含 rclone_worker 共用的日志与进程管理）
├── rclone_worker.py   # rclone sync/copy 执行器
├── scheduler.py       # APScheduler cron 调度（add/remove_task_timer）
├── templates/index.html   # 唯一页面（三个表单弹窗 + 日志弹窗）
└── static/
    ├── css/  style.css(基础/布局/按钮) task-card.css(卡片/下拉/徽章)
    │         modal-form.css(弹窗/表单)  log-modal.css(日志弹窗)  misc.css(动画/滚动条/响应式)
    ├── js/   utils.js log.js backup.js task-card.js local.js remote.js rclone.js app.js
    └── icon/

docker/     # Dockerfile + Dockerfile.dockerignore（构建上下文必须是仓库根目录）
systemd/    # rsync-gui.service（systemd 部署示例）
```

## 后端架构要点

- **三类任务（本地 / 远程 / 网盘）是三套平行的模型 + 路由 + 执行器**，字段结构几乎一致。
  改动其中一类时必须检查另外两类（`*_models.py`、`*_routes.py`、worker、前端对应 js）。
- 数据库迁移：`migrate_db()` 系列函数用 `ALTER TABLE ADD COLUMN` 补列，新增字段需在对应 `*_models.py` 中同时改 `CREATE TABLE` 和 `migrate_db()`。
- 执行与日志（`rsync_worker.py`）：
  - `build_rsync_cmd(task, remote)` 构建命令；远程任务从路径解析 host/port 后拼接 `-e "ssh -p PORT [-i 私钥]"`，支持自定义 SSH 私钥路径
  - 内存字典 `task_logs` / `_running_procs` 管理运行中进程；执行过程经 `socketio.emit` 推送 `log` / `task_finished` 事件
  - 保存前命令预览：`POST /api/tasks/preview`（三类各有对应端点）
- 调度（`scheduler.py`）：cron 表达式为空则不启用定时；增删任务后需同步 add/remove timer。
- 备份还原：`GET /api/tasks/export`（JSON 下载，含本地+远程+网盘）、`POST /api/tasks/import`（同名跳过）。

## 前端架构要点

- 无框架、无打包器，原生 JS + **内联 `onclick` 事件**（全局函数挂在 `window` 上）。
- 页面骨架：header + `main-split` 两栏（`split-left` / `split-right`）。
  `app.js:updateLayout()` 按任务数量从多到少，把三个 `task-section`（本地/远程/网盘）动态分配进左右两栏：

  ```
  +------------------------------------------------------+
  | Rsync-GUI                     [导出配置] [还原配置]   |
  +------------------------------+-----------------------+
  | 本地任务         [+ 新建]   | 远程任务   [+ 新建]  |
  | +--------------------------+ | +-------------------+  |
  | | 任务卡片   [执行][其他v] | | | 任务卡片          |  |
  | | 任务卡片                 | | | 任务卡片          |  |
  | +--------------------------+ | +-------------------+  |
  |                              | 网盘任务   [+ 新建]  |
  |                              | +-------------------+  |
  |                              | | 任务卡片          |  |
  |                              | +-------------------+  |
  +------------------------------+-----------------------+
  ```
- 任务卡片 HTML 由 `task-card.js:renderTaskCard(t, remote, rclone)` **字符串拼接**生成：
  改 UI 时要同步修改这里的 HTML 字符串（badge、按钮、下拉菜单等都在其中）。
- 其余 js：`local.js` / `remote.js` / `rclone.js` 各自负责三类任务的表单弹窗与 API 调用；`log.js` 日志弹窗 + WebSocket 订阅；`backup.js` 导入导出；`utils.js` 转义等工具。
- 外部 CDN 依赖：`socket.io 4.7.5`、`sortablejs 1.15.3`（卡片拖拽排序，handle 为 `.task-drag-handle`）。
- 卡片操作收敛为「执行」+「其他」下拉（日志/编辑/克隆/删除），删除/克隆用 `confirm()` 二次确认。

## UI 设计语言（macOS 26 Liquid Glass 液态玻璃）

主题为浅色液态玻璃：多彩极光背景 + 半透明磨砂玻璃表面。**玻璃必须保持半透明**，新增元素时禁止使用不透明纯色背景（会破坏材质感）。

- **背景**：`body::before` 固定层，多层 `radial-gradient` 蓝/紫/粉/青 + 线性渐变底色（勿用 `background-attachment: fixed`，iOS 兼容差）
- **玻璃材质配方**：半透明白底（白 0.28~0.66，层级越高越不透明）+ `backdrop-filter: saturate(180%) blur(22~32px)`（必须带 `-webkit-` 前缀）+ 1px 白色半透明描边 + 顶部内高光 `inset 0 1px 0 rgba(255,255,255,.65)`
- **层级**（透明度递增、z-index 递增）：页面背景 < 玻璃面板 `.task-section.active`（白 0.42）< 玻璃卡片 `.task-card`（渐变白 0.56→0.34）< 下拉菜单 `.task-more-menu`（白 0.72 + blur 32）< 表单弹窗 `.modal`（白 0.66）< 日志弹窗（z-index 200）
- **层叠上下文陷阱**：`backdrop-filter` 会为元素创建层叠上下文，`.task-card` 内浮层的 z-index 无法越过兄弟卡片。
  「其他」下拉打开时 `toggleMoreMenu()` 会给卡片加 `menu-open` 类提升卡片（z 30）及所属面板（z 40，`:has()` 实现，低于 header 的 z 50）；新增浮层元素（tooltip、菜单等）时注意同类问题，需同步提升宿主元素层级
- **按钮**：一律胶囊形（`--radius-btn: 999px`）；`.btn-primary` 蓝色渐变 + 内高光 + 蓝色投影；`.btn-danger` 红色渐变；`.btn-secondary` 玻璃按钮；hover 上浮 1px、阴影加深；小号按钮用 `.btn-sm`
- **徽章**：彩色半透明玻璃胶囊（语义色 tint 12~14% + 同色描边 + blur(8px)）：running/success/failed/idle/cron/dry-run/copy-mode/max-duration/max-size/remote-host
- **输入框**：内凹玻璃（白 0.5 底 + `inset 0 1px 2px` 内阴影），hover 提亮，聚焦蓝描边 + `0 0 0 4px rgba(37,99,235,.14)` 光环；checkbox `accent-color: var(--primary)`
- **弹窗**：遮罩 `rgba(28,34,58,.26)` + blur(10px)；弹窗白 0.66 + blur(32px)、圆角 22px、进入动画 `modal-in`（0.22s，缩放+上移）
- **日志终端**：深色玻璃 `rgba(18,20,32,.88)` + blur(20px)，等宽字体，底部圆角随弹窗
- **阴影体系**：`--glass-shadow`（面板/卡片常态）、`--glass-shadow-lg`（弹窗/拖拽/hover）；卡片 hover `translateY(-2px)`
- **分隔线**：外边缘用白色半透明描边（`--glass-border`），内部发丝分隔线用 `--hairline: rgba(31,41,82,.08)`
- **圆角体系**：卡片 14px（`--radius`）、面板/弹窗 20px+（`--radius-lg`）、按钮/徽章胶囊
- **响应式**：≤768px 两栏改上下排列、弹窗全屏直角、表单单列（`.form-row-3col` 同样折叠）
- **动效**：统一 0.15~0.22s 过渡；`prefers-reduced-motion` 下关闭动画；滚动条为细玻璃条（8px、圆角 thumb）
- 当前仅浅色主题，暂无 dark mode（如需支持需为玻璃变量补充深色值）

## 开发、编译与发布

### 开发环境

- Python ≥ 3.12，依赖用 uv 管理：`uv sync`（升级到最新版 `uv sync -U`，可能出兼容性问题）
- 本地启动：`uv run main.py`（端口 9765）
- 依赖：Flask、Flask-SocketIO、APScheduler、PyInstaller（见 `pyproject.toml`）

### 打包为单文件（PyInstaller）

```bash
uv run pyinstaller --onefile --name rsync-gui \
    --collect-all flask \
    --collect-all flask_socketio \
    --collect-all socketio \
    --collect-all engineio \
    --collect-all apscheduler \
    --collect-all jinja2 \
    --collect-all markupsafe \
    --collect-all itsdangerous \
    --collect-all werkzeug \
    --collect-all click \
    --collect-all pytz \
    --collect-all tzlocal \
    --collect-all sqlalchemy \
    --add-data rsync_gui/templates:rsync_gui/templates \
    --add-data rsync_gui/static:rsync_gui/static \
    main.py
```

- 产物：`dist/rsync-gui`，可在其他 Linux 设备直接运行（目标机需已安装 rsync）
- 单文件运行时数据目录为当前工作目录下的 `data/`
- systemd 部署参考 `systemd/rsync-gui.service`（改 `WorkingDirectory` / `ExecStart` 为实际路径）

### Docker 镜像构建

Dockerfile 在 `docker/` 目录，运行的是 PyInstaller 单文件产物。**构建上下文必须是仓库根目录**（Dockerfile 内 `COPY dist/...` 按上下文根解析），构建前需准备 `dist/`：

1. 按上节打包生成 `dist/rsync-gui`
2. 下载 rclone 官方静态二进制放到 `dist/rclone`（构建时 COPY 进镜像，不联网）

```bash
# 在仓库根目录执行
docker build -f docker/Dockerfile -t hansyou/rsync-gui:latest .
```

- 忽略文件为 `docker/Dockerfile.dockerignore`（BuildKit 按「Dockerfile 同名」规则自动读取，只放行 `dist/rclone` 与 `dist/rsync-gui`）。
  注意 `.dockerignore` 只在构建上下文根目录生效，放在 `docker/` 下不会被读到；若使用旧版构建器（`DOCKER_BUILDKIT=0`）则忽略文件不生效，仅影响传输速度，不影响结果
- 不要 `cd docker` 后构建：上下文会变成 `docker/`，找不到 `dist/` 导致 COPY 失败
- Dockerfile 内 apt 已换中科大源（USTC，`mirrors.ustc.edu.cn`）加速国内构建，兼容 `debian.sources` / `sources.list` 两种格式

镜像内环境变量：`RSYNC_GUI_DATA=/app/data`、`RCLONE_CONFIG=/app/data/rclone.conf`、`XDG_CACHE_HOME=/app/data/.cache`，数据卷 `/app/data`；内置 rsync、openssh-client、rclone，带健康检查。

### 发布清单

- 版本号两处同步：`pyproject.toml` + `index.html`（`.app-version`）
- 按维护约定同步 README.md / 本文件

## 关键约定与联动清单

- 版本号同时出现在 `pyproject.toml` 和 `index.html`（`.app-version`）中，发布时两处同步。
- 新建任务默认：演习模式（dry-run）开启、排除规则预填 `.Trash-*` 与 `.DS_Store`；rsync 固定启用归档模式。
- 「导出配置 / 还原配置」按钮调用 `backup.js` 的 `exportAllTasks()` / `importAllTasks()`。
- 修改任务字段时的联动点：对应 `*_models.py`（建表 + 迁移）→ `*_routes.py`（校验/预览/CRUD）→ worker 命令构建 → 前端表单（`index.html` + 对应 js）→ `renderTaskCard()`（卡片展示）→ 备份导出/导入逻辑 → 本文件。
- CSS 按模块拆分（见目录结构），新增样式按归属放入对应文件；颜色/圆角/阴影等一律走 `style.css` 顶部的 CSS 变量，不要写死颜色值。
- 文档分工：README.md 只放用户使用内容（功能、启动、数据目录、Docker 部署），本文件放技术内容（架构、设计、UI 规范、开发、编译打包、发布）；功能增删时两者同步更新。

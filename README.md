# Rsync-GUI

轻量级 Web 界面，管理 rsync 备份任务。

## 快速开始

```bash
# 1. 安装依赖
uv sync
# uv sync -U # 安装最新版依赖（可能出兼容性问题）

# 2. 启动
uv run main.py
```

浏览器访问 `http://127.0.0.1:9765`。

程序以当前用户权限运行。如需访问所有文件，建议以 root 启动。

## 功能

- 创建、编辑、克隆、删除备份任务
- 支持多个目标目录同步
- 定时执行（cron 表达式）
- WebSocket 实时日志推送
- 手动执行 / 强制停止
- 保存前预览 rsync 命令

## 打包为单文件

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

生成的可执行文件位于 `dist/rsync-gui`，可在其他 Linux 设备上直接运行（需已安装 rsync）。

首次运行会自动创建 `~/.rsync-gui/data/` 存放数据库和日志。

## 依赖

- Python >= 3.12
- Flask, Flask-SocketIO, APScheduler

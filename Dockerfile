FROM python:3.13-slim

# rsync         -> 本地同步任务
# openssh-client-> 远程任务通过 SSH 执行 rsync
# curl          -> 健康检查
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        rsync \
        openssh-client \
        ca-certificates \
        tzdata \
        curl \
    && rm -rf /var/lib/apt/lists/*

# rclone 官方静态二进制（在宿主机下载后放入 dist/，构建时直接 COPY，不联网）
COPY dist/rclone /usr/local/bin/rclone
RUN chmod +x /usr/local/bin/rclone

# 复制构建好的单文件可执行程序（PyInstaller 产物已内嵌所有 Python 依赖）
# 注: 镜像中保留 Python 环境，后续如需改为“源码直接运行”或加 Python 工具可直接复用
COPY dist/rsync-gui /app/rsync-gui
RUN chmod +x /app/rsync-gui

# 数据目录（tasks.db / rclone_tasks.db / logs 等），用环境变量显式指定
ENV RSYNC_GUI_DATA=/app/data
# rclone 配置（remote 定义与凭据）与缓存也放入数据卷，随容器持久化
ENV RCLONE_CONFIG=/app/data/rclone.conf
ENV XDG_CACHE_HOME=/app/data/.cache
WORKDIR /app
RUN mkdir -p /app/data

# 数据库与日志持久化（容器重建不丢失任务配置）
VOLUME ["/app/data"]

EXPOSE 9765

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS http://127.0.0.1:9765/ > /dev/null || exit 1

# 默认以 root 运行，便于备份任务访问任意路径（与项目 README 建议一致）
USER root

CMD ["/app/rsync-gui"]

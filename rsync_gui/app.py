"""Flask 主应用入口"""

import atexit
import os
import sys

from flask import Flask
from flask_socketio import SocketIO

from .models import init_db
from .rclone_models import init_db as init_rclone_db
from .rclone_routes import rclone_bp
from .remote_models import init_db as init_remote_db
from .remote_routes import remote_bp
from .routes import bp
from .scheduler import init_scheduler, stop_scheduler


def _is_root():
    """跨平台判断是否以 root 身份运行。Windows 上始终返回 False。"""
    if sys.platform == "win32":
        return False
    try:
        return os.geteuid() == 0
    except AttributeError:
        return False


def create_app():
    """创建并配置 Flask 应用实例"""
    # 未显式设置 RSYNC_GUI_DATA 时自动推导
    if "RSYNC_GUI_DATA" not in os.environ:
        data_dir = os.path.join(os.getcwd(), "data")
        os.environ["RSYNC_GUI_DATA"] = data_dir

    app = Flask(__name__)
    app.config["SECRET_KEY"] = os.urandom(24).hex()

    data_dir = os.environ["RSYNC_GUI_DATA"]
    os.makedirs(data_dir, exist_ok=True)

    # 初始化数据库
    init_db()
    init_remote_db()
    init_rclone_db()

    # 注册蓝图
    app.register_blueprint(bp)
    app.register_blueprint(remote_bp)
    app.register_blueprint(rclone_bp)

    # 初始化 SocketIO
    socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")
    app.extensions["socketio"] = socketio

    # 初始化调度器
    with app.app_context():
        init_scheduler(app, socketio)

    return app, socketio


def main():
    app, socketio = create_app()

    # 应用退出时优雅关闭调度器
    atexit.register(stop_scheduler)

    current_user = os.environ.get("USER") or os.environ.get("LOGNAME") or "unknown"
    is_root = _is_root()

    print("Rsync-GUI 启动")
    print(f"进程用户: {current_user} {'(root)' if is_root else ''}")
    print("访问地址: http://127.0.0.1:9765")
    print()
    socketio.run(
        app, host="0.0.0.0", port=9765, debug=False, allow_unsafe_werkzeug=True
    )


if __name__ == "__main__":
    main()

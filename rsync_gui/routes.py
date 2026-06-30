"""Flask 路由和 API 模块"""

import json
from datetime import datetime, timezone

from flask import Blueprint, Response, current_app, jsonify, render_template, request

from .models import create_task, delete_task, get_all_tasks, get_task, update_task
from .rsync_worker import (
    _log_key,
    build_rsync_cmd,
    load_log_from_disk,
    run_task_async,
    stop_task,
    task_logs,
)
from .scheduler import add_task_timer, remove_task_timer

bp = Blueprint("api", __name__)


@bp.route("/")
def index():
    """主页面"""
    return render_template("index.html")


# ---- 任务 CRUD ----


@bp.route("/api/tasks/preview", methods=["POST"])
def api_preview_command():
    """预览拼接后的 rsync 命令"""
    data = request.get_json()
    errors = validate_task_data(data)
    if errors:
        return jsonify({"error": errors}), 400

    commands = build_preview_commands(data)
    return jsonify({"commands": commands})


@bp.route("/api/tasks", methods=["GET"])
def api_get_tasks():
    tasks = get_all_tasks()
    # 添加实时状态
    result = []
    for t in tasks:
        t["running"] = task_logs.get(_log_key(t["id"]), {}).get("running", False)
        t["targets_list"] = json.loads(t.get("targets", "[]"))
        result.append(t)
    return jsonify(result)


@bp.route("/api/tasks", methods=["POST"])
def api_create_task():
    data = request.get_json()
    errors = validate_task_data(data)
    if errors:
        return jsonify({"error": errors}), 400

    task_id = create_task(data)

    # 注册定时任务
    if data.get("cron_expr"):
        socketio = current_app.extensions["socketio"]
        add_task_timer(task_id, data["cron_expr"], socketio)

    return jsonify({"id": task_id}), 201


@bp.route("/api/tasks/<int:task_id>", methods=["PUT"])
def api_update_task(task_id):
    task = get_task(task_id)
    if not task:
        return jsonify({"error": "任务不存在"}), 404

    data = request.get_json()
    errors = validate_task_data(data)
    if errors:
        return jsonify({"error": errors}), 400

    update_task(task_id, data)

    # 更新定时任务
    socketio = current_app.extensions["socketio"]
    if data.get("cron_expr"):
        add_task_timer(task_id, data["cron_expr"], socketio)
    else:
        remove_task_timer(task_id)

    return jsonify({"ok": True})


@bp.route("/api/tasks/<int:task_id>", methods=["DELETE"])
def api_delete_task(task_id):
    task = get_task(task_id)
    if not task:
        return jsonify({"error": "任务不存在"}), 404

    delete_task(task_id)
    remove_task_timer(task_id)
    # 清理日志
    key = _log_key(task_id)
    if key in task_logs:
        del task_logs[key]

    return jsonify({"ok": True})


@bp.route("/api/tasks/<int:task_id>/run", methods=["POST"])
def api_run_task(task_id):
    task = get_task(task_id)
    if not task:
        return jsonify({"error": "任务不存在"}), 404

    if task_logs.get(_log_key(task_id), {}).get("running"):
        return jsonify({"error": "任务正在执行中"}), 409

    socketio = current_app.extensions["socketio"]
    run_task_async(task_id, socketio)
    return jsonify({"ok": True})


@bp.route("/api/tasks/<int:task_id>/stop", methods=["POST"])
def api_stop_task(task_id):
    """强制停止正在执行的任务"""
    task = get_task(task_id)
    if not task:
        return jsonify({"error": "任务不存在"}), 404

    success = stop_task(task_id)
    if not success:
        return jsonify({"error": "任务未在运行"}), 409

    socketio = current_app.extensions["socketio"]
    socketio.emit(
        "task_complete",
        {"task_id": task_id, "exit_code": -9, "remote": False, "rclone": False},
    )
    return jsonify({"ok": True})


@bp.route("/api/tasks/<int:task_id>/clone", methods=["POST"])
def api_clone_task(task_id):
    """克隆任务"""
    task = get_task(task_id)
    if not task:
        return jsonify({"error": "任务不存在"}), 404

    # 名称加括注
    task["name"] = f"{task['name']}（副本）"
    # 清除 id 和 timestamp，让数据库自动生成
    task.pop("id", None)
    task.pop("created_at", None)
    task.pop("updated_at", None)

    new_id = create_task(task)

    # 注册定时任务
    if task.get("cron_expr"):
        socketio = current_app.extensions["socketio"]
        add_task_timer(new_id, task["cron_expr"], socketio)

    return jsonify({"id": new_id}), 201


@bp.route("/api/tasks/reorder", methods=["PUT"])
def api_reorder_tasks():
    """更新任务排序"""
    from .models import get_connection

    data = request.get_json()
    if not data or not isinstance(data, list):
        return jsonify({"error": "需要提供任务 ID 数组"}), 400

    with get_connection() as conn:
        for i, task_id in enumerate(data):
            conn.execute(
                "UPDATE tasks SET sort_order = ? WHERE id = ?",
                (float(i), task_id),
            )
    return jsonify({"ok": True})


@bp.route("/api/tasks/<int:task_id>/status")
def api_task_status(task_id):
    log = task_logs.get(_log_key(task_id))
    if log:
        return jsonify(
            {
                "running": log.get("running", False),
                "exit_code": log.get("exit_code"),
            }
        )
    return jsonify({"running": False, "exit_code": None})


@bp.route("/api/tasks/<int:task_id>/last_log")
def api_last_log(task_id):
    """获取上次执行的日志"""
    log = task_logs.get(_log_key(task_id))
    if log and log.get("output"):
        return jsonify(
            {
                "output": log["output"],
                "started_at": log.get("started_at"),
            }
        )

    # 尝试从磁盘加载
    disk_log = load_log_from_disk(task_id)
    if disk_log:
        return jsonify(
            {
                "output": disk_log.get("output", ""),
                "started_at": disk_log.get("started_at"),
            }
        )

    return jsonify({"output": "暂无执行日志", "started_at": None})


# ---- 命令预览 ----


def build_preview_commands(data):
    """根据前端提交的数据生成预览命令列表"""
    try:
        targets = json.loads(data.get("targets", "[]"))
    except (json.JSONDecodeError, TypeError):
        targets = []

    source = data.get("source", "")

    base_cmd = build_rsync_cmd(data)

    commands = []
    for target in targets:
        full_cmd = base_cmd + [source, target]
        commands.append(" ".join(full_cmd))

    return commands


# ---- 验证 ----


def validate_task_data(data):
    errors = []

    if not data.get("name", "").strip():
        errors.append("任务名称不能为空")

    source = data.get("source", "").strip()
    if not source:
        errors.append("源目录不能为空")
    elif not source.startswith("/"):
        errors.append("源目录必须是绝对路径")

    targets_raw = data.get("targets", "[]")
    try:
        targets = json.loads(targets_raw)
        if not isinstance(targets, list) or not targets:
            errors.append("目标目录至少需要一项")
        else:
            for t in targets:
                if not t.startswith("/"):
                    errors.append(f"目标目录必须是绝对路径: {t}")
                    break
    except (json.JSONDecodeError, TypeError):
        errors.append("目标目录格式错误，需为 JSON 数组")

    return errors


# ---- 备份 / 还原 ----


@bp.route("/api/tasks/export", methods=["GET"])
def api_export_tasks():
    """导出所有任务（local + remote + rclone）为单个 JSON 文件"""

    def strip(rows):
        result = []
        for t in rows:
            r = dict(t)
            for k in (
                "id",
                "created_at",
                "updated_at",
                "running",
                "exit_code",
                "targets_list",
            ):
                r.pop(k, None)
            result.append(r)
        return result

    from . import rclone_models, remote_models

    payload = json.dumps(
        {
            "local": strip(get_all_tasks()),
            "remote": strip(remote_models.get_all_tasks()),
            "rclone": strip(rclone_models.get_all_tasks()),
        },
        ensure_ascii=False,
        indent=2,
    ).encode("utf-8")

    now = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"rsync-tasks-{now}.json"

    return Response(
        payload,
        mimetype="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@bp.route("/api/tasks/import", methods=["POST"])
def api_import_tasks():
    """从 JSON 文件还原任务（自动识别 local/remote/rclone）"""
    file = request.files.get("file")
    if not file:
        return jsonify({"error": "未上传文件"}), 400

    try:
        data = json.loads(file.read().decode("utf-8"))
    except Exception:
        return jsonify({"error": "文件解析失败"}), 400

    socketio = current_app.extensions.get("socketio")

    def do_import(records, create_fn, get_all_fn, remote=False, rclone=False):
        imported = 0
        skipped = 0
        if not isinstance(records, list):
            return imported, skipped
        existing_names = {t["name"] for t in get_all_fn()}
        for rec in records:
            if rec.get("name") in existing_names:
                skipped += 1
                continue
            tid = create_fn(rec)
            if rec.get("cron_expr") and socketio:
                add_task_timer(
                    tid, rec["cron_expr"], socketio, remote=remote, rclone=rclone
                )
            existing_names.add(rec.get("name"))
            imported += 1
        return imported, skipped

    imported_total = 0
    skipped_total = 0

    if isinstance(data, dict) and (
        "local" in data or "remote" in data or "rclone" in data
    ):
        from . import rclone_models, remote_models

        i, s = do_import(data.get("local", []), create_task, get_all_tasks)
        imported_total += i
        skipped_total += s
        i, s = do_import(
            data.get("remote", []),
            remote_models.create_task,
            remote_models.get_all_tasks,
            remote=True,
        )
        imported_total += i
        skipped_total += s
        i, s = do_import(
            data.get("rclone", []),
            rclone_models.create_task,
            rclone_models.get_all_tasks,
            rclone=True,
        )
        imported_total += i
        skipped_total += s
    elif isinstance(data, list):
        # 旧格式 [...]
        if data and data[0].get("ssh_host"):
            from . import remote_models

            imported_total, skipped_total = do_import(
                data,
                remote_models.create_task,
                remote_models.get_all_tasks,
                remote=True,
            )
        else:
            imported_total, skipped_total = do_import(data, create_task, get_all_tasks)
    else:
        return jsonify({"error": "文件格式无效"}), 400

    return jsonify({"imported": imported_total, "skipped": skipped_total})

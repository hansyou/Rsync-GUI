"""远程任务路由"""

import json

from flask import Blueprint, current_app, jsonify, request

from . import remote_models as models
from .rsync_worker import (
    _log_key,
    build_rsync_cmd,
    load_log_from_disk,
    run_task_async,
    stop_task,
    task_logs,
)
from .scheduler import add_task_timer, remove_task_timer

remote_bp = Blueprint("remote", __name__)


@remote_bp.route("/api/remote/preview", methods=["POST"])
def api_preview_command():
    data = request.get_json()
    errors = validate_remote_task_data(data)
    if errors:
        return jsonify({"error": errors}), 400
    commands = build_preview_commands(data)
    return jsonify({"commands": commands})


@remote_bp.route("/api/remote", methods=["GET"])
def api_get_tasks():
    tasks = models.get_all_tasks()
    result = []
    for t in tasks:
        t["running"] = task_logs.get(_log_key(t["id"], remote=True), {}).get(
            "running", False
        )
        t["targets_list"] = json.loads(t.get("targets", "[]"))
        result.append(t)
    return jsonify(result)


@remote_bp.route("/api/remote", methods=["POST"])
def api_create_task():
    data = request.get_json()
    errors = validate_remote_task_data(data)
    if errors:
        return jsonify({"error": errors}), 400
    task_id = models.create_task(data)
    if data.get("cron_expr"):
        socketio = current_app.extensions["socketio"]
        add_task_timer(task_id, data["cron_expr"], socketio, remote=True)
    return jsonify({"id": task_id}), 201


@remote_bp.route("/api/remote/<int:task_id>", methods=["PUT"])
def api_update_task(task_id):
    if not models.get_task(task_id):
        return jsonify({"error": "任务不存在"}), 404
    data = request.get_json()
    errors = validate_remote_task_data(data)
    if errors:
        return jsonify({"error": errors}), 400
    models.update_task(task_id, data)
    socketio = current_app.extensions["socketio"]
    if data.get("cron_expr"):
        add_task_timer(task_id, data["cron_expr"], socketio, remote=True)
    else:
        remove_task_timer(task_id, remote=True)
    return jsonify({"ok": True})


@remote_bp.route("/api/remote/<int:task_id>", methods=["DELETE"])
def api_delete_task(task_id):
    if not models.get_task(task_id):
        return jsonify({"error": "任务不存在"}), 404
    models.delete_task(task_id)
    remove_task_timer(task_id, remote=True)
    key = _log_key(task_id, remote=True)
    if key in task_logs:
        del task_logs[key]
    return jsonify({"ok": True})


@remote_bp.route("/api/remote/<int:task_id>/run", methods=["POST"])
def api_run_task(task_id):
    if not models.get_task(task_id):
        return jsonify({"error": "任务不存在"}), 404
    if task_logs.get(_log_key(task_id, remote=True), {}).get("running"):
        return jsonify({"error": "任务正在执行中"}), 409
    socketio = current_app.extensions["socketio"]
    run_task_async(task_id, socketio, remote=True)
    return jsonify({"ok": True})


@remote_bp.route("/api/remote/<int:task_id>/stop", methods=["POST"])
def api_stop_task(task_id):
    if not models.get_task(task_id):
        return jsonify({"error": "任务不存在"}), 404
    if not stop_task(task_id):
        return jsonify({"error": "任务未在运行"}), 409
    socketio = current_app.extensions["socketio"]
    socketio.emit("task_complete", {"task_id": task_id, "exit_code": -9})
    return jsonify({"ok": True})


@remote_bp.route("/api/remote/<int:task_id>/clone", methods=["POST"])
def api_clone_task(task_id):
    task = models.get_task(task_id)
    if not task:
        return jsonify({"error": "任务不存在"}), 404
    task["name"] = f"{task['name']}（副本）"
    task.pop("id", None)
    task.pop("created_at", None)
    task.pop("updated_at", None)
    new_id = models.create_task(task)
    if task.get("cron_expr"):
        socketio = current_app.extensions["socketio"]
        add_task_timer(new_id, task["cron_expr"], socketio, remote=True)
    return jsonify({"id": new_id}), 201


@remote_bp.route("/api/remote/<int:task_id>/status")
def api_task_status(task_id):
    log = task_logs.get(_log_key(task_id, remote=True))
    if log:
        return jsonify(
            {"running": log.get("running", False), "exit_code": log.get("exit_code")}
        )
    return jsonify({"running": False, "exit_code": None})


@remote_bp.route("/api/remote/<int:task_id>/last_log")
def api_last_log(task_id):
    log = task_logs.get(_log_key(task_id, remote=True))
    if log and log.get("output"):
        return jsonify({"output": log["output"], "started_at": log.get("started_at")})
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
    try:
        targets = json.loads(data.get("targets", "[]"))
    except (json.JSONDecodeError, TypeError):
        targets = []
    source = data.get("source", "")
    base_cmd = build_rsync_cmd(data, remote=True)
    commands = []
    for target in targets:
        commands.append(" ".join(base_cmd + [source, target]))
    return commands


# ---- 验证 ----


def validate_remote_task_data(data):
    errors = []
    if not data.get("name", "").strip():
        errors.append("任务名称不能为空")
    source = data.get("source", "").strip()
    if not source:
        errors.append("源目录不能为空")
    targets_raw = data.get("targets", "[]")
    try:
        targets = json.loads(targets_raw)
        if not isinstance(targets, list) or not targets:
            errors.append("目标目录至少需要一项")
    except (json.JSONDecodeError, TypeError):
        errors.append("目标目录格式错误，需为 JSON 数组")
    return errors

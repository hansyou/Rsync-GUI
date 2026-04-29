"""rclone 命令构建与执行模块"""

import json
import subprocess
import threading
from datetime import datetime, timezone

from . import rclone_models
from .rsync_worker import _log_key, _running_procs, save_log_to_disk, task_logs


def build_rclone_cmd(task):
    """构建 rclone sync 命令"""
    cmd = ["rclone", "sync", "--progress", "--transfers", "4", "--checkers", "4"]

    if task.get("excludes"):
        for line in task["excludes"].split("\n"):
            line = line.strip()
            if line:
                cmd.extend(["--exclude", line])

    if task.get("dry_run"):
        cmd.append("--dry-run")

    return cmd


def stop_task(task_id):
    key = _log_key(task_id, rclone=True)
    log = task_logs.get(key)
    if not log or not log.get("running"):
        return False
    proc = _running_procs.pop(key, None)
    if proc:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
    log["running"] = False
    log["exit_code"] = -9
    log["output"] += "\n[已停止] 任务被用户强制终止\n"
    save_log_to_disk(task_id, dict(log))
    return True


def run_task(task_id, socketio=None):
    """执行 rclone 任务"""
    task = rclone_models.get_task(task_id)
    if not task:
        return

    log_entry = {
        "exit_code": None,
        "output": "",
        "running": True,
        "started_at": datetime.now(timezone.utc).isoformat(),
    }
    key = _log_key(task_id, rclone=True)
    task_logs[key] = log_entry

    cmd = build_rclone_cmd(task)

    try:
        targets = json.loads(task["targets"])
    except (json.JSONDecodeError, TypeError):
        targets = []

    source = task["source"]

    for target in targets:
        full_cmd = cmd + [source, target]

        try:
            proc = subprocess.Popen(
                full_cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
            )
            _running_procs[key] = proc

            for line in iter(proc.stdout.readline, ""):
                if socketio:
                    socketio.emit("log_update", {"task_id": task_id, "line": line})
                log_entry["output"] += line

            proc.wait()
            _running_procs.pop(key, None)

            if proc.returncode != 0:
                if log_entry["exit_code"] is None:
                    log_entry["exit_code"] = proc.returncode
                log_entry["output"] += (
                    f"\n[错误] 目标 {target} 同步失败，退出码: {proc.returncode}\n"
                )

        except FileNotFoundError:
            _running_procs.pop(key, None)
            log_entry["output"] += "\n[错误] rclone 命令未找到，请确认已安装 rclone\n"
            if log_entry["exit_code"] is None:
                log_entry["exit_code"] = -1
        except Exception as e:
            _running_procs.pop(key, None)
            log_entry["output"] += f"\n[错误] 执行异常: {e}\n"
            if log_entry["exit_code"] is None:
                log_entry["exit_code"] = -2

    if log_entry["exit_code"] is None:
        log_entry["exit_code"] = 0

    log_entry["running"] = False
    save_log_to_disk(task_id, dict(log_entry))

    if socketio:
        socketio.emit(
            "task_complete",
            {"task_id": task_id, "exit_code": log_entry["exit_code"]},
        )


def run_task_async(task_id, socketio=None):
    """在后台线程中异步执行 rclone 任务"""
    thread = threading.Thread(target=run_task, args=(task_id, socketio), daemon=True)
    thread.start()
    return thread

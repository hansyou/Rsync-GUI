"""rsync 命令构建、执行、日志管理模块"""

import json
import os
import subprocess
import threading
from datetime import datetime, timezone

from . import remote_models
from .models import get_task


def _get_data_dir():
    """返回数据目录（优先使用环境变量，否则使用当前运行目录下的 data）"""
    data_dir = os.environ.get("RSYNC_GUI_DATA")
    if data_dir:
        return data_dir

    return os.path.join(os.getcwd(), "data")


def _get_log_dir():
    return os.path.join(_get_data_dir(), "logs")


def _get_log_path(task_id, remote=False, rclone=False):
    log_dir = _get_log_dir()
    os.makedirs(log_dir, exist_ok=True)
    if rclone:
        return os.path.join(log_dir, f"rclone_task_{task_id}.json")
    if remote:
        return os.path.join(log_dir, f"remote_task_{task_id}.json")
    return os.path.join(log_dir, f"task_{task_id}.json")


# 内存字典 — 用于 WebSocket 实时推送和进程管理
task_logs: dict = {}
_running_procs: dict = {}


def _log_key(task_id, remote=False, rclone=False):
    if rclone:
        return f"rclone_{task_id}"
    if remote:
        return f"remote_{task_id}"
    return f"local_{task_id}"


def save_log_to_disk(task_id, log_data, remote=False, rclone=False):
    path = _get_log_path(task_id, remote=remote, rclone=rclone)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(log_data, f, ensure_ascii=False)


def load_log_from_disk(task_id, remote=False, rclone=False):
    path = _get_log_path(task_id, remote=remote, rclone=rclone)
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return None


def build_rsync_cmd(task, remote=False):
    """
    根据任务配置构建 rsync 命令参数列表。
    固定以 -a 开头，再根据字段动态追加其他选项。
    """
    cmd = ["rsync", "-a"]

    if remote:
        # SSH 连接：-e "ssh [-p PORT] [-i KEY]"
        # 从 source/targets 中解析 host:port
        import re

        hosts = set()
        ports = set()
        for path in [task.get("source", "")] + json.loads(task.get("targets", "[]")):
            m = re.match(r"(?:[\w.-]+@)?([\w.-]+)(?::(\d+))?:", path)
            if m:
                hosts.add(m.group(1))
                if m.group(2):
                    ports.add(int(m.group(2)))
        if hosts:
            port = max(ports) if ports else 22
            ssh_opts = ["ssh", f"-p {port}"]
            if task.get("ssh_key"):
                ssh_opts.append(f"-i {task['ssh_key']}")
            cmd.extend(["-e", " ".join(ssh_opts)])

    if task.get("verbose"):
        cmd.append("-v")
    if task.get("compress"):
        cmd.append("-z")
    if task.get("preserve_times"):
        cmd.append("-t")
    if task.get("delete_mode"):
        cmd.append("--delete")
    if task.get("dry_run"):
        cmd.append("--dry-run")
    if task.get("timeout", 0) > 0:
        cmd.extend(["--timeout", str(task["timeout"])])
    if task.get("bandwidth_limit"):
        cmd.extend(["--bwlimit", task["bandwidth_limit"]])

    # 排除规则（换行分隔）
    if task.get("excludes"):
        for line in task["excludes"].split("\n"):
            line = line.strip()
            if line:
                cmd.extend(["--exclude", line])

    return cmd


def stop_task(task_id, remote=False):
    """
    强制停止正在执行的任务。
    返回 True 表示成功终止，False 表示任务未在运行。
    """
    key = _log_key(task_id, remote=remote)
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
    save_log_to_disk(task_id, dict(log), remote=remote)
    return True


def run_task(task_id, socketio=None, remote=False):
    """
    执行指定 id 的 rsync 任务。
    边执行边通过 WebSocket 推送输出，执行完毕持久化日志到磁盘。
    此函数会在单独线程中运行。
    """
    if remote:
        task = remote_models.get_task(task_id)
    else:
        task = get_task(task_id)
    if not task:
        return

    # 初始化日志条目
    log_entry = {
        "exit_code": None,
        "output": "",
        "running": True,
        "started_at": datetime.now(timezone.utc).isoformat(),
    }
    key = _log_key(task_id, remote=remote)
    task_logs[key] = log_entry

    # 构建命令
    cmd = build_rsync_cmd(task, remote=remote)

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
                encoding="utf-8",
                errors="replace",
            )

            # 记录进程以便强制停止
            _running_procs[key] = proc

            for line in iter(proc.stdout.readline, ""):
                if socketio:
                    socketio.emit(
                        "log_update",
                        {
                            "task_id": task_id,
                            "line": line,
                            "remote": remote,
                            "rclone": False,
                        },
                    )
                log_entry["output"] += line

            proc.wait()
            _running_procs.pop(key, None)

            if proc.returncode != 0:
                if log_entry["exit_code"] is None:
                    log_entry["exit_code"] = proc.returncode
                error_line = (
                    f"\n[错误] 目标 {target} 同步失败，退出码: {proc.returncode}\n"
                )
                log_entry["output"] += error_line

        except FileNotFoundError:
            _running_procs.pop(key, None)
            msg = "\n[错误] rsync 命令未找到，请确认已安装 rsync\n"
            log_entry["output"] += msg
            if log_entry["exit_code"] is None:
                log_entry["exit_code"] = -1
        except Exception as e:
            _running_procs.pop(key, None)
            msg = f"\n[错误] 执行异常: {e}\n"
            log_entry["output"] += msg
            if log_entry["exit_code"] is None:
                log_entry["exit_code"] = -2

    if log_entry["exit_code"] is None:
        log_entry["exit_code"] = 0

    log_entry["running"] = False

    # 持久化到磁盘
    save_log_to_disk(task_id, dict(log_entry), remote=remote)

    if socketio:
        socketio.emit(
            "task_complete",
            {
                "task_id": task_id,
                "exit_code": log_entry["exit_code"],
                "remote": remote,
                "rclone": False,
            },
        )


def run_task_async(task_id, socketio=None, remote=False):
    """在后台线程中异步执行任务"""
    thread = threading.Thread(
        target=run_task,
        args=(task_id, socketio),
        kwargs={"remote": remote},
        daemon=True,
    )
    thread.start()
    return thread

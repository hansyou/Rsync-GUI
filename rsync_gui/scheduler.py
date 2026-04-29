"""APScheduler 定时任务管理模块"""

from apscheduler.jobstores.base import JobLookupError
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from .models import get_enabled_cron_tasks
from .rclone_models import get_enabled_cron_tasks as get_enabled_rclone_cron_tasks
from .rclone_worker import run_task_async as run_rclone_async
from .remote_models import get_enabled_cron_tasks as get_enabled_remote_cron_tasks
from .rsync_worker import run_task_async

scheduler: BackgroundScheduler = None


def init_scheduler(app, socketio):
    """初始化调度器，从数据库加载已启用的定时任务"""
    global scheduler

    scheduler = BackgroundScheduler(
        timezone=app.config.get("SCHEDULER_TIMEZONE", "Asia/Shanghai"),
    )
    scheduler.start()

    for task in get_enabled_cron_tasks():
        _add_job(task["id"], task["cron_expr"], socketio)
    for task in get_enabled_remote_cron_tasks():
        _add_job(
            task["id"],
            task["cron_expr"],
            socketio,
            prefix="remote_",
            runner_kwargs={"remote": True},
        )
    for task in get_enabled_rclone_cron_tasks():
        _add_job(
            task["id"],
            task["cron_expr"],
            socketio,
            prefix="rclone_",
            runner=run_rclone_async,
        )

    return scheduler


def _add_job(
    task_id,
    cron_expr,
    socketio,
    prefix="task_",
    runner=run_task_async,
    runner_kwargs=None,
):
    """添加单个定时任务到调度器"""
    trigger = CronTrigger.from_crontab(cron_expr)
    scheduler.add_job(
        runner,
        trigger,
        args=[task_id, socketio],
        kwargs=runner_kwargs or {},
        id=f"{prefix}{task_id}",
        replace_existing=True,
    )


def add_task_timer(task_id, cron_expr, socketio, remote=False, rclone=False):
    """添加/更新任务的定时调度"""
    if not cron_expr:
        remove_task_timer(task_id, remote=remote, rclone=rclone)
        return
    if rclone:
        _add_job(
            task_id, cron_expr, socketio, prefix="rclone_", runner=run_rclone_async
        )
    elif remote:
        _add_job(
            task_id,
            cron_expr,
            socketio,
            prefix="remote_",
            runner=run_task_async,
            runner_kwargs={"remote": True},
        )
    else:
        _add_job(task_id, cron_expr, socketio)


def remove_task_timer(task_id, remote=False, rclone=False):
    """移除任务的定时调度"""
    if rclone:
        prefix = "rclone_"
    elif remote:
        prefix = "remote_"
    else:
        prefix = "task_"
    try:
        scheduler.remove_job(f"{prefix}{task_id}")
    except JobLookupError:
        pass


def stop_scheduler():
    """停止调度器（应用关闭时调用）"""
    global scheduler
    if scheduler:
        scheduler.shutdown(wait=False)

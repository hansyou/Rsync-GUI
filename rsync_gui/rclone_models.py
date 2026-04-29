"""rclone 任务数据库模型"""

import os
import sqlite3


def _get_data_dir():
    data_dir = os.environ.get("RSYNC_GUI_DATA")
    if data_dir:
        return data_dir
    return os.path.join(os.getcwd(), "data")


def get_connection():
    data_dir = _get_data_dir()
    os.makedirs(data_dir, exist_ok=True)
    db_path = os.path.join(data_dir, "rclone_tasks.db")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS rclone_tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,

                -- 源和目标（支持 rclone remote:path 或 /local/path）
                source  TEXT NOT NULL,
                targets TEXT NOT NULL,       -- JSON 数组

                -- rclone 选项
                dry_run  BOOLEAN DEFAULT 1,

                excludes   TEXT,              -- 换行分隔，对应 --exclude

                cron_expr        TEXT,

                created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)


def get_all_tasks():
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM rclone_tasks ORDER BY id").fetchall()
        return [dict(r) for r in rows]


def get_task(task_id):
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM rclone_tasks WHERE id = ?", (task_id,)
        ).fetchone()
        return dict(row) if row else None


def create_task(data):
    with get_connection() as conn:
        cur = conn.execute(
            """
            INSERT INTO rclone_tasks (name, source, targets, dry_run, excludes, cron_expr)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                data["name"],
                data["source"],
                data["targets"],
                int(data.get("dry_run", 1)),
                data.get("excludes", ""),
                data.get("cron_expr", ""),
            ),
        )
        return cur.lastrowid


def update_task(task_id, data):
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE rclone_tasks SET
                name=?, source=?, targets=?, dry_run=?, excludes=?, cron_expr=?,
                updated_at=CURRENT_TIMESTAMP
            WHERE id=?
            """,
            (
                data["name"],
                data["source"],
                data["targets"],
                int(data.get("dry_run", 1)),
                data.get("excludes", ""),
                data.get("cron_expr", ""),
                task_id,
            ),
        )


def delete_task(task_id):
    with get_connection() as conn:
        conn.execute("DELETE FROM rclone_tasks WHERE id = ?", (task_id,))


def get_enabled_cron_tasks():
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, cron_expr FROM rclone_tasks WHERE cron_expr IS NOT NULL AND cron_expr != ''"
        ).fetchall()
        return [dict(r) for r in rows]

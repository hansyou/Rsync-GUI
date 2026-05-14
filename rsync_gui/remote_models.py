"""远程任务数据库模型"""

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
    db_path = os.path.join(data_dir, "remote_tasks.db")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS remote_tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,

                -- SSH 私钥路径，留空使用 ~/.ssh/id_ed25519
                ssh_key   TEXT DEFAULT '',

                -- 源和目标（user@host:/path 或 /path，端口可选 user@host:port:/path）
                source  TEXT NOT NULL,
                targets TEXT NOT NULL,       -- JSON 数组

                -- rsync 选项
                verbose        BOOLEAN DEFAULT 1,
                compress       BOOLEAN DEFAULT 1,
                preserve_times BOOLEAN DEFAULT 0,
                delete_mode    BOOLEAN DEFAULT 1,
                dry_run        BOOLEAN DEFAULT 1,

                excludes   TEXT,

                timeout          INTEGER DEFAULT 0,
                bandwidth_limit  TEXT DEFAULT '',

                cron_expr        TEXT,

                sort_order       REAL NOT NULL DEFAULT 0,

                created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)


def migrate_db():
    """迁移数据库：为旧表添加 sort_order 列（如果不存在）"""
    with get_connection() as conn:
        info = conn.execute("PRAGMA table_info(remote_tasks)").fetchall()
        columns = [row["name"] for row in info]
        if "sort_order" not in columns:
            conn.execute(
                "ALTER TABLE remote_tasks ADD COLUMN sort_order REAL NOT NULL DEFAULT 0"
            )


def get_all_tasks():
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM remote_tasks ORDER BY sort_order, id"
        ).fetchall()
        return [dict(r) for r in rows]


def get_task(task_id):
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM remote_tasks WHERE id = ?", (task_id,)
        ).fetchone()
        return dict(row) if row else None


def create_task(data):
    with get_connection() as conn:
        # 计算新任务的 sort_order：放在末尾
        max_order = conn.execute(
            "SELECT COALESCE(MAX(sort_order), 0) FROM remote_tasks"
        ).fetchone()[0]
        new_order = max_order + 1

        cur = conn.execute(
            """
            INSERT INTO remote_tasks (name, ssh_key,
                source, targets,
                verbose, compress, preserve_times, delete_mode, dry_run,
                excludes, timeout, bandwidth_limit,
                cron_expr, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data["name"],
                data.get("ssh_key", ""),
                data["source"],
                data["targets"],
                int(data.get("verbose", 1)),
                int(data.get("compress", 1)),
                int(data.get("preserve_times", 0)),
                int(data.get("delete_mode", 1)),
                int(data.get("dry_run", 1)),
                data.get("excludes", ""),
                int(data.get("timeout", 0)),
                data.get("bandwidth_limit", ""),
                data.get("cron_expr", ""),
                new_order,
            ),
        )
        return cur.lastrowid


def update_task(task_id, data):
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE remote_tasks SET
                name=?, ssh_key=?,
                source=?, targets=?,
                verbose=?, compress=?, preserve_times=?, delete_mode=?, dry_run=?,
                excludes=?, timeout=?, bandwidth_limit=?,
                cron_expr=?,
                updated_at=CURRENT_TIMESTAMP
            WHERE id=?
            """,
            (
                data["name"],
                data.get("ssh_key", ""),
                data["source"],
                data["targets"],
                int(data.get("verbose", 1)),
                int(data.get("compress", 1)),
                int(data.get("preserve_times", 0)),
                int(data.get("delete_mode", 1)),
                int(data.get("dry_run", 1)),
                data.get("excludes", ""),
                int(data.get("timeout", 0)),
                data.get("bandwidth_limit", ""),
                data.get("cron_expr", ""),
                task_id,
            ),
        )


def delete_task(task_id):
    with get_connection() as conn:
        conn.execute("DELETE FROM remote_tasks WHERE id = ?", (task_id,))


def get_enabled_cron_tasks():
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, cron_expr FROM remote_tasks WHERE cron_expr IS NOT NULL AND cron_expr != ''"
        ).fetchall()
        return [dict(r) for r in rows]

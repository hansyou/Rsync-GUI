/* Rsync-GUI 入口 */

// ===== State =====
var tasks = [];
var remoteTasks = [];
var rcloneTasks = [];
var currentTaskId = null;
var currentIsRemote = false;
var currentIsRclone = false;
var socket = null;

// ===== DOM refs =====
var taskListEl = null;
var emptyStateEl = null;
var remoteTaskListEl = null;
var remoteEmptyStateEl = null;
var rcloneTaskListEl = null;
var rcloneEmptyStateEl = null;

// ===== SocketIO =====
function connectSocket() {
    socket = io();
    socket.on("log_update", function (data) {
        if (data.task_id === currentTaskId) appendLogLine(data.line);
    });
    socket.on("task_complete", function (data) {
        if (data.task_id === currentTaskId) {
            appendLogLine(
                "\n--- 任务执行完成 (退出码: " + data.exit_code + ") ---\n",
            );
            btnStopLog.style.display = "none";
        }
        loadTasks();
    });
}

// ===== Load Tasks =====
async function loadTasks() {
    try {
        var resp = await fetch("/api/tasks");
        var remoteResp = await fetch("/api/remote");
        var rcloneResp = await fetch("/api/rclone");
        tasks = await resp.json();
        remoteTasks = await remoteResp.json();
        rcloneTasks = await rcloneResp.json();
        renderTasks();
        renderRemoteTasks();
        renderRcloneTasks();
    } catch (e) {
        console.error("加载任务失败", e);
    }
}

function renderTasks() {
    if (tasks.length === 0) {
        taskListEl.innerHTML = "";
        emptyStateEl.style.display = "block";
    } else {
        emptyStateEl.style.display = "none";
        taskListEl.innerHTML = tasks
            .map(function (t) {
                return renderTaskCard(t, false, false);
            })
            .join("");
    }
}

function renderRemoteTasks() {
    if (remoteTasks.length === 0) {
        remoteTaskListEl.innerHTML = "";
        remoteEmptyStateEl.style.display = "block";
    } else {
        remoteEmptyStateEl.style.display = "none";
        remoteTaskListEl.innerHTML = remoteTasks
            .map(function (t) {
                return renderTaskCard(t, true, false);
            })
            .join("");
    }
}

function renderRcloneTasks() {
    if (rcloneTasks.length === 0) {
        rcloneTaskListEl.innerHTML = "";
        rcloneEmptyStateEl.style.display = "block";
    } else {
        rcloneEmptyStateEl.style.display = "none";
        rcloneTaskListEl.innerHTML = rcloneTasks
            .map(function (t) {
                return renderTaskCard(t, false, true);
            })
            .join("");
    }
}

// ===== Stop (shared) =====
async function stopTask(taskId) {
    if (!confirm("确定要强制停止这个任务吗？")) return;
    var prefix = currentIsRclone
        ? "/api/rclone"
        : currentIsRemote
          ? "/api/remote"
          : "/api/tasks";
    try {
        var resp = await fetch(prefix + "/" + taskId + "/stop", {
            method: "POST",
        });
        if (!resp.ok) {
            var err = await resp.json();
            alert(err.error || "取消失败");
            return;
        }
        btnStopLog.style.display = "none";
    } catch (e) {
        alert("停止请求失败");
    }
}

// ===== Init =====
document.addEventListener("DOMContentLoaded", function () {
    taskListEl = document.getElementById("task-list");
    emptyStateEl = document.getElementById("empty-state");
    remoteTaskListEl = document.getElementById("remote-task-list");
    remoteEmptyStateEl = document.getElementById("remote-empty-state");
    rcloneTaskListEl = document.getElementById("rclone-task-list");
    rcloneEmptyStateEl = document.getElementById("rclone-empty-state");

    initLocalModal(
        document.getElementById("modal-overlay"),
        document.getElementById("modal-title"),
        document.getElementById("task-form"),
        document.getElementById("form-errors"),
    );
    initLocalFormSubmit();

    initRemoteModal(
        document.getElementById("remote-modal-overlay"),
        document.getElementById("remote-modal-title"),
        document.getElementById("remote-task-form"),
        document.getElementById("remote-form-errors"),
    );
    initRemoteFormSubmit();

    initRcloneModal(
        document.getElementById("rclone-modal-overlay"),
        document.getElementById("rclone-modal-title"),
        document.getElementById("rclone-task-form"),
        document.getElementById("rclone-form-errors"),
    );
    initRcloneFormSubmit();

    initLogModal(
        document.getElementById("log-modal-overlay"),
        document.getElementById("log-modal-title"),
        document.getElementById("log-modal-body"),
        document.getElementById("btn-stop-log"),
        document.getElementById("btn-clear-log"),
    );

    connectSocket();
    loadTasks();

    document
        .getElementById("modal-overlay")
        .addEventListener("click", function (e) {
            if (e.target === modalOverlay) closeModal();
        });
    document
        .getElementById("remote-modal-overlay")
        .addEventListener("click", function (e) {
            if (e.target === remoteModalOverlay) closeRemoteModal();
        });
    document
        .getElementById("rclone-modal-overlay")
        .addEventListener("click", function (e) {
            if (e.target === rcloneModalOverlay) closeRcloneModal();
        });
    document
        .getElementById("log-modal-overlay")
        .addEventListener("click", function (e) {
            if (e.target === logModalOverlay) closeLogModal();
        });

    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
            if (logModalOverlay.style.display === "flex") closeLogModal();
            else if (rcloneModalOverlay.style.display === "flex")
                closeRcloneModal();
            else if (remoteModalOverlay.style.display === "flex")
                closeRemoteModal();
            else if (modalOverlay.style.display === "flex") closeModal();
        }
    });

    btnStopLog.addEventListener("click", function () {
        if (currentTaskId) stopTask(currentTaskId);
    });

    btnClearLog.addEventListener("click", function () {
        logModalBody.textContent = "";
    });
});

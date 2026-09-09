/* Rsync-GUI 远程任务 */

var remoteModalOverlay = null;
var remoteModalTitle = null;
var remoteTaskForm = null;
var remoteFormErrors = null;

function initRemoteModal(overlay, title, form, errors) {
    remoteModalOverlay = overlay;
    remoteModalTitle = title;
    remoteTaskForm = form;
    remoteFormErrors = errors;
}

function openRemoteModal(title, taskData) {
    remoteModalTitle.textContent = title;
    remoteFormErrors.textContent = "";
    remoteTaskForm.reset();

    if (taskData) {
        document.getElementById("remote-task-id").value = taskData.id || "";
        document.getElementById("remote-name").value = taskData.name || "";
        document.getElementById("ssh_key").value = taskData.ssh_key || "";
        document.getElementById("remote-source").value = taskData.source || "";
        document.getElementById("remote-targets").value = formatTargets(
            taskData.targets || "[]",
        );
        document.getElementById("remote-verbose").checked =
            taskData.verbose !== 0;
        document.getElementById("remote-compress").checked =
            !!taskData.compress;
        document.getElementById("remote-preserve_times").checked =
            !!taskData.preserve_times;
        document.getElementById("remote-delete_mode").checked =
            !!taskData.delete_mode;
        document.getElementById("remote-excludes").value =
            taskData.excludes || "";
        document.getElementById("remote-timeout").value = taskData.timeout || 0;
        document.getElementById("remote-bandwidth_limit").value =
            taskData.bandwidth_limit || "";
        document.getElementById("remote-cron_expr").value =
            taskData.cron_expr || "";
        document.getElementById("remote-dry_run").checked =
            taskData.dry_run !== 0;
    } else {
        document.getElementById("remote-task-id").value = "";
        document.getElementById("remote-verbose").checked = true;
        document.getElementById("remote-compress").checked = false;
        document.getElementById("remote-delete_mode").checked = true;
        document.getElementById("remote-dry_run").checked = true;
        document.getElementById("remote-excludes").value =
            ".Trash-*\n.DS_Store";
    }

    remoteModalOverlay.style.display = "flex";
}

function closeRemoteModal() {
    remoteModalOverlay.style.display = "none";
    remoteFormErrors.textContent = "";
}

function buildRemoteFormData() {
    return {
        name: document.getElementById("remote-name").value.trim(),
        ssh_key: document.getElementById("ssh_key").value.trim(),
        source: document.getElementById("remote-source").value.trim(),
        targets: formatTargetsForSubmit(
            document.getElementById("remote-targets").value,
        ),
        verbose: document.getElementById("remote-verbose").checked,
        compress: document.getElementById("remote-compress").checked,
        preserve_times: document.getElementById("remote-preserve_times")
            .checked,
        delete_mode: document.getElementById("remote-delete_mode").checked,
        dry_run: document.getElementById("remote-dry_run").checked,
        excludes: document.getElementById("remote-excludes").value,
        timeout: parseInt(document.getElementById("remote-timeout").value) || 0,
        bandwidth_limit: document
            .getElementById("remote-bandwidth_limit")
            .value.trim(),
        cron_expr: document.getElementById("remote-cron_expr").value.trim(),
    };
}

function newRemoteTask() {
    openRemoteModal("新建远程任务", null);
}

function editRemoteTask(taskId) {
    var task = remoteTasks.find(function (t) {
        return t.id === taskId;
    });
    if (task) openRemoteModal("编辑远程任务", task);
}

// ---- CRUD ----

async function runRemoteTask(taskId) {
    var prefix = "/api/remote";
    try {
        var resp = await fetch(prefix + "/" + taskId + "/run", {
            method: "POST",
        });
        if (!resp.ok) {
            var err = await resp.json();
            alert(err.error || "执行失败");
            return;
        }
        window.loadTasks();
    } catch (e) {
        alert("执行请求失败");
    }
}

async function deleteRemoteTask(taskId) {
    if (!confirm("确定要删除这个远程任务吗？")) return;
    try {
        await fetch("/api/remote/" + taskId, { method: "DELETE" });
        if (window.currentTaskId === taskId && window.currentIsRemote)
            closeLogModal();
        window.loadTasks();
    } catch (e) {
        alert("删除失败");
    }
}

async function cloneRemoteTask(taskId) {
    if (!confirm("确定要克隆这个远程任务吗？")) return;
    try {
        var resp = await fetch("/api/remote/" + taskId + "/clone", {
            method: "POST",
        });
        if (!resp.ok) {
            var err = await resp.json();
            alert(err.error || "克隆失败");
            return;
        }
        window.loadTasks();
    } catch (e) {
        alert("克隆请求失败");
    }
}

// ---- Preview & Submit ----

async function previewRemoteCommand(data) {
    try {
        var resp = await fetch("/api/remote/preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });
        if (!resp.ok) return null;
        var result = await resp.json();
        return result.commands || [];
    } catch (e) {
        return null;
    }
}

function initRemoteFormSubmit() {
    remoteTaskForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        remoteFormErrors.textContent = "";
        var taskId = document.getElementById("remote-task-id").value;
        var data = buildRemoteFormData();

        var commands = await previewRemoteCommand(data);
        if (!commands || commands.length === 0) {
            remoteFormErrors.textContent = "无法生成预览命令，请检查配置";
            return;
        }
        if (
            !confirm(
                "即将执行的命令：\n\n" +
                    commands.join("\n\n") +
                    "\n\n确认保存？",
            )
        )
            return;

        try {
            var resp;
            if (taskId) {
                resp = await fetch("/api/remote/" + taskId, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(data),
                });
            } else {
                resp = await fetch("/api/remote", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(data),
                });
            }
            if (!resp.ok) {
                var err = await resp.json();
                remoteFormErrors.textContent = Array.isArray(err.error)
                    ? err.error.join("\n")
                    : err.error || "保存失败";
                return;
            }
            closeRemoteModal();
            window.loadTasks();
        } catch (e) {
            remoteFormErrors.textContent = "网络错误";
        }
    });
}

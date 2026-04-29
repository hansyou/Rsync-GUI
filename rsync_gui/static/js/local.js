/* Rsync-GUI 本地任务 */

// DOM refs
var modalOverlay = null;
var modalTitle = null;
var taskForm = null;
var formErrors = null;

function initLocalModal(overlay, title, form, errors) {
    modalOverlay = overlay;
    modalTitle = title;
    taskForm = form;
    formErrors = errors;
}

function openModal(title, taskData) {
    modalTitle.textContent = title;
    formErrors.textContent = "";
    taskForm.reset();

    if (taskData) {
        document.getElementById("task-id").value = taskData.id || "";
        document.getElementById("name").value = taskData.name || "";
        document.getElementById("source").value = taskData.source || "";
        document.getElementById("targets").value = formatTargets(taskData.targets || "[]");
        document.getElementById("verbose").checked = taskData.verbose !== 0;
        document.getElementById("compress").checked = !!taskData.compress;
        document.getElementById("preserve_times").checked = !!taskData.preserve_times;
        document.getElementById("delete_mode").checked = !!taskData.delete_mode;
        document.getElementById("excludes").value = taskData.excludes || "";
        document.getElementById("timeout").value = taskData.timeout || 0;
        document.getElementById("bandwidth_limit").value = taskData.bandwidth_limit || "";
        document.getElementById("cron_expr").value = taskData.cron_expr || "";
        document.getElementById("dry_run").checked = taskData.dry_run !== 0;
    } else {
        document.getElementById("task-id").value = "";
        document.getElementById("verbose").checked = true;
        document.getElementById("compress").checked = true;
        document.getElementById("delete_mode").checked = true;
        document.getElementById("dry_run").checked = true;
        document.getElementById("excludes").value = ".Trash-*\n.DS_Store";
    }

    modalOverlay.style.display = "flex";
}

function closeModal() {
    modalOverlay.style.display = "none";
    formErrors.textContent = "";
}

function buildFormData() {
    return {
        name: document.getElementById("name").value.trim(),
        source: document.getElementById("source").value.trim(),
        targets: formatTargetsForSubmit(document.getElementById("targets").value),
        verbose: document.getElementById("verbose").checked,
        compress: document.getElementById("compress").checked,
        preserve_times: document.getElementById("preserve_times").checked,
        delete_mode: document.getElementById("delete_mode").checked,
        dry_run: document.getElementById("dry_run").checked,
        excludes: document.getElementById("excludes").value,
        timeout: parseInt(document.getElementById("timeout").value) || 0,
        bandwidth_limit: document.getElementById("bandwidth_limit").value.trim(),
        cron_expr: document.getElementById("cron_expr").value.trim(),
    };
}

function newTask() { openModal("新建任务", null); }

function editTask(taskId) {
    var task = window.tasks.find(function (t) { return t.id === taskId; });
    if (task) openModal("编辑任务", task);
}

// ---- CRUD ----

async function runTask(taskId) {
    var prefix = "/api/tasks";
    try {
        var resp = await fetch(prefix + "/" + taskId + "/run", { method: "POST" });
        if (!resp.ok) { var err = await resp.json(); alert(err.error || "执行失败"); return; }
        window.loadTasks();
    } catch (e) { alert("执行请求失败"); }
}

async function deleteTask(taskId) {
    if (!confirm("确定要删除这个任务吗？")) return;
    try {
        await fetch("/api/tasks/" + taskId, { method: "DELETE" });
        if (window.currentTaskId === taskId && !window.currentIsRemote) closeLogModal();
        window.loadTasks();
    } catch (e) { alert("删除失败"); }
}

async function cloneTask(taskId) {
    if (!confirm("确定要克隆这个任务吗？")) return;
    try {
        var resp = await fetch("/api/tasks/" + taskId + "/clone", { method: "POST" });
        if (!resp.ok) { var err = await resp.json(); alert(err.error || "克隆失败"); return; }
        window.loadTasks();
    } catch (e) { alert("克隆请求失败"); }
}

// ---- Preview & Submit ----

async function previewCommand(data) {
    try {
        var resp = await fetch("/api/tasks/preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });
        if (!resp.ok) return null;
        var result = await resp.json();
        return result.commands || [];
    } catch (e) { return null; }
}

function initLocalFormSubmit() {
    taskForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        formErrors.textContent = "";
        var taskId = document.getElementById("task-id").value;
        var data = buildFormData();

        var commands = await previewCommand(data);
        if (!commands || commands.length === 0) {
            formErrors.textContent = "无法生成预览命令，请检查配置";
            return;
        }
        if (!confirm("即将执行的命令：\n\n" + commands.join("\n\n") + "\n\n确认保存？")) return;

        try {
            var resp;
            if (taskId) {
                resp = await fetch("/api/tasks/" + taskId, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(data),
                });
            } else {
                resp = await fetch("/api/tasks", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(data),
                });
            }
            if (!resp.ok) {
                var err = await resp.json();
                formErrors.textContent = Array.isArray(err.error) ? err.error.join("\n") : (err.error || "保存失败");
                return;
            }
            closeModal();
            window.loadTasks();
        } catch (e) { formErrors.textContent = "网络错误"; }
    });
}

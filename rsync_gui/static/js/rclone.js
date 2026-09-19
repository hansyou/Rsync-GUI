/* Rsync-GUI rclone 任务 */

var rcloneModalOverlay = null;
var rcloneModalTitle = null;
var rcloneTaskForm = null;
var rcloneFormErrors = null;

function initRcloneModal(overlay, title, form, errors) {
    rcloneModalOverlay = overlay;
    rcloneModalTitle = title;
    rcloneTaskForm = form;
    rcloneFormErrors = errors;
}

function openRcloneModal(title, taskData) {
    rcloneModalTitle.textContent = title;
    rcloneFormErrors.textContent = "";
    rcloneTaskForm.reset();

    if (taskData) {
        document.getElementById("rclone-task-id").value = taskData.id || "";
        document.getElementById("rclone-name").value = taskData.name || "";
        document.getElementById("rclone-source").value = taskData.source || "";
        document.getElementById("rclone-targets").value = formatTargets(taskData.targets || "[]");
        document.getElementById("rclone-excludes").value = taskData.excludes || "";
        document.getElementById("rclone-cron_expr").value = taskData.cron_expr || "";
        document.getElementById("rclone-dry_run").checked = taskData.dry_run !== 0;
        document.getElementById("rclone-delete_mode").checked = taskData.delete_mode !== 0;
        
        // 处理 max_duration
        var maxDurationEnabled = taskData.max_duration && taskData.max_duration.trim() !== "";
        document.getElementById("rclone-max_duration-enabled").checked = maxDurationEnabled;
        document.getElementById("rclone-max_duration").value = taskData.max_duration || "";
        document.getElementById("rclone-max_duration").disabled = !maxDurationEnabled;
        
        // 处理 max_size
        var maxSizeEnabled = taskData.max_size && taskData.max_size.trim() !== "";
        document.getElementById("rclone-max_size-enabled").checked = maxSizeEnabled;
        document.getElementById("rclone-max_size").value = taskData.max_size || "";
        document.getElementById("rclone-max_size").disabled = !maxSizeEnabled;
    } else {
        document.getElementById("rclone-task-id").value = "";
        document.getElementById("rclone-dry_run").checked = true;
        document.getElementById("rclone-delete_mode").checked = true;
        document.getElementById("rclone-excludes").value = ".Trash-*\n.DS_Store\nvenv\n.venv\nnode_modules\n__pycache__\n.git";
        
        // 默认不勾选传输限制
        document.getElementById("rclone-max_duration-enabled").checked = false;
        document.getElementById("rclone-max_duration").value = "";
        document.getElementById("rclone-max_duration").disabled = true;
        
        document.getElementById("rclone-max_size-enabled").checked = false;
        document.getElementById("rclone-max_size").value = "";
        document.getElementById("rclone-max_size").disabled = true;
    }

    rcloneModalOverlay.style.display = "flex";
}

function closeRcloneModal() {
    rcloneModalOverlay.style.display = "none";
    rcloneFormErrors.textContent = "";
}

function buildRcloneFormData() {
    var maxDurationEnabled = document.getElementById("rclone-max_duration-enabled").checked;
    var maxSizeEnabled = document.getElementById("rclone-max_size-enabled").checked;
    return {
        name: document.getElementById("rclone-name").value.trim(),
        source: document.getElementById("rclone-source").value.trim(),
        targets: formatTargetsForSubmit(document.getElementById("rclone-targets").value),
        dry_run: document.getElementById("rclone-dry_run").checked,
        delete_mode: document.getElementById("rclone-delete_mode").checked,
        excludes: document.getElementById("rclone-excludes").value,
        max_duration: maxDurationEnabled ? document.getElementById("rclone-max_duration").value.trim() : "",
        max_size: maxSizeEnabled ? document.getElementById("rclone-max_size").value.trim() : "",
        cron_expr: document.getElementById("rclone-cron_expr").value.trim(),
    };
}

function newRcloneTask() { openRcloneModal("新建网盘任务", null); }

function editRcloneTask(taskId) {
    var task = window.rcloneTasks.find(function (t) { return t.id === taskId; });
    if (task) openRcloneModal("编辑网盘任务", task);
}

// ---- CRUD ----

async function runRcloneTask(taskId) {
    try {
        var resp = await fetch("/api/rclone/" + taskId + "/run", { method: "POST" });
        if (!resp.ok) { var err = await resp.json(); alert(err.error || "执行失败"); return; }
        window.loadTasks();
    } catch (e) { alert("执行请求失败"); }
}

async function deleteRcloneTask(taskId) {
    if (!confirm("确定要删除这个网盘任务吗？")) return;
    try {
        await fetch("/api/rclone/" + taskId, { method: "DELETE" });
        if (window.currentTaskId === taskId && window.currentIsRclone) closeLogModal();
        window.loadTasks();
    } catch (e) { alert("删除失败"); }
}

async function cloneRcloneTask(taskId) {
    if (!confirm("确定要克隆这个网盘任务吗？")) return;
    try {
        var resp = await fetch("/api/rclone/" + taskId + "/clone", { method: "POST" });
        if (!resp.ok) { var err = await resp.json(); alert(err.error || "克隆失败"); return; }
        window.loadTasks();
    } catch (e) { alert("克隆请求失败"); }
}

// ---- Preview & Submit ----

async function previewRcloneCommand(data) {
    try {
        var resp = await fetch("/api/rclone/preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });
        if (!resp.ok) return null;
        var result = await resp.json();
        return result.commands || [];
    } catch (e) { return null; }
}

function initRcloneFormSubmit() {
    // 添加复选框事件监听器
    document.getElementById("rclone-max_duration-enabled").addEventListener("change", function() {
        document.getElementById("rclone-max_duration").disabled = !this.checked;
    });
    
    document.getElementById("rclone-max_size-enabled").addEventListener("change", function() {
        document.getElementById("rclone-max_size").disabled = !this.checked;
    });
    
    rcloneTaskForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        rcloneFormErrors.textContent = "";
        var taskId = document.getElementById("rclone-task-id").value;
        var data = buildRcloneFormData();

        var commands = await previewRcloneCommand(data);
        if (!commands || commands.length === 0) {
            rcloneFormErrors.textContent = "无法生成预览命令，请检查配置";
            return;
        }
        if (!confirm("即将执行的命令：\n\n" + commands.join("\n\n") + "\n\n确认保存？")) return;

        try {
            var resp;
            if (taskId) {
                resp = await fetch("/api/rclone/" + taskId, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(data),
                });
            } else {
                resp = await fetch("/api/rclone", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(data),
                });
            }
            if (!resp.ok) {
                var err = await resp.json();
                rcloneFormErrors.textContent = Array.isArray(err.error) ? err.error.join("\n") : (err.error || "保存失败");
                return;
            }
            closeRcloneModal();
            window.loadTasks();
        } catch (e) { rcloneFormErrors.textContent = "网络错误"; }
    });
}

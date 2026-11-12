/* Rsync-GUI 日志弹窗 */

var logModalOverlay = null;
var logModalTitle = null;
var logModalBody = null;
var btnStopLog = null;
var btnClearLog = null;

function initLogModal(overlay, title, body, stop, clear) {
    logModalOverlay = overlay;
    logModalTitle = title;
    logModalBody = body;
    btnStopLog = stop;
    btnClearLog = clear;
}

async function showLogModal(taskId, isRemote, isRclone) {
    var list = isRclone
        ? window.rcloneTasks
        : isRemote
          ? window.remoteTasks
          : window.tasks;
    var task = list.find(function (t) {
        return t.id === taskId;
    });
    var prefix = isRclone
        ? "/api/rclone"
        : isRemote
          ? "/api/remote"
          : "/api/tasks";

    // 切换任务时清空日志
    if (
        window.currentTaskId !== taskId ||
        window.currentIsRemote !== isRemote ||
        window.currentIsRclone !== isRclone
    ) {
        logModalBody.textContent = "";
        btnStopLog.style.display = "none";
    }

    window.currentTaskId = taskId;
    window.currentIsRemote = !!isRemote;
    window.currentIsRclone = !!isRclone;

    // 获取任务状态；未运行时加载上次执行日志（内存优先，磁盘兜底）
    try {
        var resp = await fetch(prefix + "/" + taskId + "/status");
        var status = await resp.json();

        var titleText = "执行日志 - " + (task ? task.name : "");
        if (status.running) {
            logModalTitle.textContent = titleText + "（执行中...）";
            if (!logModalBody.textContent) {
                logModalBody.textContent = "等待日志输出...\n";
            }
        } else {
            var lastLog = await loadLastLog(prefix, taskId);
            var when = lastLog && lastLog.started_at ? " " + lastLog.started_at : "";
            if (status.exit_code !== null) {
                var statusStr =
                    status.exit_code === 0 ? "成功" : "失败(" + status.exit_code + ")";
                logModalTitle.textContent = titleText + "（" + statusStr + when + "）";
            } else {
                logModalTitle.textContent =
                    titleText + (when ? "（上次执行" + when + "）" : "");
            }
            if (!logModalBody.textContent) {
                logModalBody.textContent = "暂无执行日志";
            }
        }
    } catch (e) {
        logModalTitle.textContent = "执行日志 - " + (task ? task.name : "");
    }

    btnStopLog.style.display = task && task.running ? "inline-block" : "none";
    logModalOverlay.style.display = "flex";
}

function closeLogModal() {
    logModalOverlay.style.display = "none";
    window.currentTaskId = null;
    window.currentIsRemote = false;
    window.currentIsRclone = false;
}

// 加载上次执行日志：接口优先返回内存日志，服务重启后从磁盘日志兜底
async function loadLastLog(prefix, taskId) {
    try {
        var resp = await fetch(prefix + "/" + taskId + "/last_log");
        if (!resp.ok) return null;
        var data = await resp.json();
        if (data && data.output) {
            logModalBody.textContent = data.output;
            logModalBody.scrollTop = logModalBody.scrollHeight;
        }
        return data;
    } catch (e) {
        return null;
    }
}

function appendLogLine(line) {
    logModalBody.textContent += line;
    // 只保留最后50行显示，避免刷屏
    var text = logModalBody.textContent;
    var lines = text.split("\n");
    if (lines.length > 50) {
        logModalBody.textContent = lines.slice(-50).join("\n");
    }
    logModalBody.scrollTop = logModalBody.scrollHeight;
}

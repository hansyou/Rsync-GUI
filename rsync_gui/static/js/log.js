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

    // 获取任务状态和开始时间
    try {
        var resp = await fetch(prefix + "/" + taskId + "/status");
        var status = await resp.json();

        var titleText = "执行日志 - " + (task ? task.name : "");
        if (status.running) {
            logModalTitle.textContent = titleText + "（执行中...）";
            if (!logModalBody.textContent) {
                logModalBody.textContent = "等待日志输出...\n";
            }
        } else if (status.exit_code !== null) {
            var statusStr = status.exit_code === 0 ? "成功" : "失败(" + status.exit_code + ")";
            logModalTitle.textContent = titleText + "（" + statusStr + "）";
            if (!logModalBody.textContent) {
                logModalBody.textContent = "任务未在运行";
            }
        } else {
            logModalTitle.textContent = titleText;
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

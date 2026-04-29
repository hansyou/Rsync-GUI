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

    if (
        window.currentTaskId !== taskId ||
        window.currentIsRemote !== isRemote ||
        window.currentIsRclone !== isRclone
    ) {
        logModalBody.textContent = "加载中...";
        btnStopLog.style.display = "none";
    }

    window.currentTaskId = taskId;
    window.currentIsRemote = !!isRemote;
    window.currentIsRclone = !!isRclone;

    try {
        var resp = await fetch(prefix + "/" + taskId + "/last_log");
        var data = await resp.json();
        logModalBody.textContent = data.output || "暂无执行日志";

        if (data.started_at) {
            var d = new Date(data.started_at);
            var pad = function (n) {
                return String(n).padStart(2, "0");
            };
            var timeStr =
                d.getFullYear() +
                "-" +
                pad(d.getMonth() + 1) +
                "-" +
                pad(d.getDate()) +
                " " +
                pad(d.getHours()) +
                ":" +
                pad(d.getMinutes()) +
                ":" +
                pad(d.getSeconds());
            logModalTitle.textContent =
                "执行日志 - " + (task ? task.name : "") + "（" + timeStr + "）";
        } else {
            logModalTitle.textContent = "执行日志 - " + (task ? task.name : "");
        }
    } catch (e) {
        logModalBody.textContent = "加载日志失败";
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
    logModalBody.scrollTop = logModalBody.scrollHeight;
}

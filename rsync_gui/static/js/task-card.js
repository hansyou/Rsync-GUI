/* Rsync-GUI 任务卡片渲染 */

function renderTaskCard(t, isRemote, isRclone) {
    var targets = t.targets_list || [];
    var source = t.source || "";
    var statusClass = t.running
        ? "running"
        : t.exit_code === 0
          ? "success"
          : t.exit_code
            ? "failed"
            : "idle";
    var statusLabel = t.running
        ? "执行中"
        : t.exit_code === 0
          ? "成功"
          : t.exit_code
            ? "失败"
            : "待执行";
    var hasCron = t.cron_expr ? "cron" : "";

    var editFn, cloneFn, delFn, runFn, logFn, logArgs, badgeTag;

    if (isRclone) {
        editFn = "editRcloneTask(" + t.id + ")";
        cloneFn = "cloneRcloneTask(" + t.id + ")";
        delFn = "deleteRcloneTask(" + t.id + ")";
        runFn = "runRcloneTask(" + t.id + ")";
        logFn = "showLogModal";
        logArgs = t.id + ",false,true";
        badgeTag = "";
    } else if (isRemote) {
        editFn = "editRemoteTask(" + t.id + ")";
        cloneFn = "cloneRemoteTask(" + t.id + ")";
        delFn = "deleteRemoteTask(" + t.id + ")";
        runFn = "runRemoteTask(" + t.id + ")";
        logFn = "showLogModal";
        logArgs = t.id + ",true,false";
        badgeTag =
            '<span class="task-badge cron">' +
            escHtml(t.ssh_host || "") +
            "</span>";
    } else {
        editFn = "editTask(" + t.id + ")";
        cloneFn = "cloneTask(" + t.id + ")";
        delFn = "deleteTask(" + t.id + ")";
        runFn = "runTask(" + t.id + ")";
        logFn = "showLogModal";
        logArgs = t.id + ",false,false";
        badgeTag = "";
    }

    return (
        '<div class="task-card">' +
        '<div class="task-card-header">' +
        '<div class="task-card-left">' +
        '<span class="task-name">' +
        escHtml(t.name) +
        "</span>" +
        '<span class="task-badge ' +
        statusClass +
        '">' +
        statusLabel +
        "</span>" +
        (hasCron ? '<span class="task-badge cron">定时</span>' : "") +
        badgeTag +
        "</div>" +
        '<div class="task-card-right">' +
        '<button class="btn-secondary" onclick="' +
        runFn +
        '" ' +
        (t.running ? "disabled" : "") +
        ">" +
        (t.running ? '<span class="spinner"></span>' : "▶ 执行") +
        "</button>" +
        '<button class="btn-secondary" onclick="' +
        logFn +
        "(" +
        logArgs +
        ')\">日志</button>' +
        '<button class="btn-secondary" onclick="' +
        editFn +
        '">编辑</button>' +
        '<button class="btn-secondary" onclick="' +
        cloneFn +
        '">克隆</button>' +
        '<button class="btn-danger" onclick="' +
        delFn +
        '">删除</button>' +
        "</div>" +
        "</div>" +
        '<div class="task-card-meta">' +
        "<span>📁 " +
        escHtml(source) +
        "</span>" +
        "<span>" +
        targets
            .map(function (p) {
                return escHtml(p);
            })
            .join(", ") +
        "</span>" +
        "</div>" +
        "</div>"
    );
}

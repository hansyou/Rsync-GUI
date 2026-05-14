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

    var rows = "";
    for (var i = 0; i < targets.length; i++) {
        rows +=
            '<div class="task-path-row">' +
            '<span class="task-path-src">' +
            escHtml(source) +
            "</span>" +
            '<span class="task-path-arrow">→</span>' +
            '<span class="task-path-dst">' +
            escHtml(targets[i]) +
            "</span>" +
            "</div>";
    }

    return (
        '<div class="task-card" data-task-id="' +
        t.id +
        '" onclick="toggleTaskCard(this)">' +
        '<div class="task-card-header">' +
        '<div class="task-card-left">' +
        '<span class="task-drag-handle" onclick="event.stopPropagation()" title="拖动排序">⋮⋮</span>' +
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
        '<button class="btn-secondary" onclick="event.stopPropagation();' +
        runFn +
        '" ' +
        (t.running ? "disabled" : "") +
        ">" +
        (t.running ? '<span class="spinner"></span>' : "▶ 执行") +
        "</button>" +
        '<div class="task-more-wrap">' +
        '<button class="btn-secondary task-more-btn" onclick="event.stopPropagation();toggleMoreMenu(event)">其他 ▾</button>' +
        '<div class="task-more-menu" style="display:none">' +
        '<button class="task-more-item" onclick="event.stopPropagation();' +
        logFn +
        "(" +
        logArgs +
        ')">日志</button>' +
        '<button class="task-more-item" onclick="event.stopPropagation();' +
        editFn +
        '">编辑</button>' +
        '<button class="task-more-item" onclick="event.stopPropagation();' +
        cloneFn +
        '">克隆</button>' +
        '<button class="task-more-item task-more-item-danger" onclick="event.stopPropagation();' +
        delFn +
        '">删除</button>' +
        "</div>" +
        "</div>" +
        "</div>" +
        "</div>" +
        '<div class="task-card-meta" style="display:none">' +
        rows +
        "</div>" +
        "</div>"
    );
}

function toggleTaskCard(el) {
    var meta = el.querySelector(".task-card-meta");
    if (meta) {
        meta.style.display = meta.style.display === "none" ? "block" : "none";
        if (meta.style.display !== "none") {
            el.classList.add("task-card-expanded");
        } else {
            el.classList.remove("task-card-expanded");
        }
    }
}

function toggleMoreMenu(event) {
    // Close any other open menus first
    var allMenus = document.querySelectorAll(".task-more-menu");
    var currentMenu = event.currentTarget.nextElementSibling;
    var isCurrentlyOpen = currentMenu.style.display === "block";

    for (var i = 0; i < allMenus.length; i++) {
        allMenus[i].style.display = "none";
    }

    if (!isCurrentlyOpen) {
        currentMenu.style.display = "block";
    }
}

// Close dropdown when clicking anywhere else
document.addEventListener("click", function (event) {
    if (!event.target.closest(".task-more-wrap")) {
        var allMenus = document.querySelectorAll(".task-more-menu");
        for (var i = 0; i < allMenus.length; i++) {
            allMenus[i].style.display = "none";
        }
    }
});

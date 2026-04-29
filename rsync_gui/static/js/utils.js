/* Rsync-GUI 工具函数 */

function formatTargets(targetsStr) {
    try {
        var arr = JSON.parse(targetsStr);
        return Array.isArray(arr) ? arr.join("\n") : targetsStr;
    } catch (e) {
        return targetsStr;
    }
}

function formatTargetsForSubmit(value) {
    var lines = value
        .split("\n")
        .map(function (s) { return s.trim(); })
        .filter(Boolean);
    return JSON.stringify(lines);
}

function escHtml(str) {
    if (!str) return "";
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

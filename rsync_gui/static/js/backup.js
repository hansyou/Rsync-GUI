/* Rsync-GUI 备份与还原 */

function exportAllTasks() {
    doDownload("/api/tasks/export");
}

function importAllTasks() {
    var input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.multiple = true;
    input.onchange = async function () {
        var files = input.files;
        if (!files.length) return;
        var total = 0;
        var totalSkipped = 0;
        for (var i = 0; i < files.length; i++) {
            var file = files[i];
            var formData = new FormData();
            formData.append("file", file);
            try {
                var resp = await fetch("/api/tasks/import", {
                    method: "POST",
                    body: formData,
                });
                var result = await resp.json();
                if (resp.ok) {
                    total += result.imported;
                    totalSkipped += result.skipped;
                }
            } catch (e) {
                /* skip */
            }
        }
        if (total || totalSkipped) {
            alert(
                "导入完成：导入 " +
                    total +
                    " 个，跳过 " +
                    totalSkipped +
                    " 个（同名）",
            );
            window.loadTasks();
        } else {
            alert("未识别到有效的备份文件");
        }
    };
    input.click();
}

function doDownload(url) {
    var a = document.createElement("a");
    a.href = url;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

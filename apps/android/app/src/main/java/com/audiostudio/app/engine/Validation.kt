package com.audiostudio.app.engine

/** 安全校验：文件名清洗、路径安全检查（与 packages/shared/src/validation.ts 一致） */

private val WINDOWS_RESERVED = setOf(
    "con", "prn", "aux", "nul",
    "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
    "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
)

private val ILLEGAL_CHARS = Regex("[<>:\"/\\\\|?*\\u0000-\\u001f]")

const val MAX_FILE_NAME_LEN = 160

/**
 * 清洗文件名（不含目录部分）：
 * - 移除非法字符与控制字符
 * - 去除首尾空白与结尾的点/空格
 * - 处理 Windows 保留名
 * - 截断超长
 */
fun sanitizeFileName(name: String): String {
    var s = name
        .replace(ILLEGAL_CHARS, "_")
        .replace(Regex("\\s+"), " ")
        .trim()
        .replace(Regex("[. ]+$"), "")
    if (s.isEmpty()) return ""
    val stem = s.substringBefore('.').lowercase()
    if (stem in WINDOWS_RESERVED) s = "_$s"
    if (s.length > MAX_FILE_NAME_LEN) {
        val dot = s.lastIndexOf('.')
        val keepExt = if (dot > 0 && s.length - dot <= 12) s.substring(dot) else ""
        s = s.substring(0, MAX_FILE_NAME_LEN - keepExt.length) + keepExt
    }
    return s
}

/** 判断路径是否包含遍历 / 非法内容 */
fun isPathUnsafe(p: String): Boolean {
    if (p.isEmpty() || p.contains('\u0000')) return true
    val norm = p.replace('\\', '/')
    if (norm.contains("../") || norm.contains("/..") || norm == "..") return true
    if (p.length > 4096) return true
    return false
}

/** 输出文件名安全校验：必须已清洗、不含路径分隔符 */
fun isOutputNameSafe(name: String): Boolean {
    if (name.isEmpty() || name.length > 300) return false
    if (name.contains('\\') || name.contains('/') || name.contains('\u0000')) return false
    if (name == "." || name == "..") return false
    return !isPathUnsafe(name)
}

/**
 * FFmpeg 参数向量安全校验：所有参数以数组传递（不经 shell），
 * 此处再拦截恶意构造（以 '-' 开头的路径、控制字符）。
 */
fun assertSafeArg(arg: String, index: Int, role: String) {
    if (role == "path") {
        require(!arg.startsWith("-")) {
            "参数 #$index 非法：路径不能以 \"-\" 开头: ${arg.take(60)}"
        }
        require(!arg.contains('\u0000') && !arg.contains('\r') && !arg.contains('\n')) {
            "参数 #$index 非法：路径包含控制字符"
        }
    }
}

/** 校验模板是否安全（防止模板导致路径逃逸） */
fun validateFilenameTemplate(template: String): String? {
    if (template.isBlank()) return "文件名模板不能为空"
    val withoutTokens = template.replace(Regex("\\{[a-z_]+\\}", RegexOption.IGNORE_CASE), "")
    if (withoutTokens.contains('\\') || withoutTokens.contains('/') || withoutTokens.contains('\u0000')) {
        return "文件名模板不能包含路径分隔符"
    }
    if (template.length > 200) return "文件名模板过长"
    return null
}

const val LARGE_FILE_WARN_BYTES = 500L * 1024 * 1024

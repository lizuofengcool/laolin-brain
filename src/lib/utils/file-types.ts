/**
 * 文件格式工具模块
 * 支持更多文件格式的检测、分类、预览等功能
 */

// 文件类型分类
export type FileCategory =
  | "document" // 文档
  | "image" // 图片
  | "video" // 视频
  | "audio" // 音频
  | "archive" // 压缩包
  | "code" // 代码
  | "data" // 数据文件
  | "ebook" // 电子书
  | "font" // 字体
  | "presentation" // 演示文稿
  | "spreadsheet" // 电子表格
  | "other"; // 其他

// 文件类型信息
export interface FileTypeInfo {
  extension: string;
  mimeType: string;
  category: FileCategory;
  name: string;
  icon: string;
  color: string;
  previewable: boolean; // 是否支持预览
  previewType?: "image" | "text" | "code" | "video" | "audio" | "pdf" | "markdown" | "json" | "csv";
  searchable?: boolean; // 是否可全文搜索
  aiProcessable?: boolean; // 是否可AI处理
}

/**
 * 文件类型映射表
 */
export const FILE_TYPES: Record<string, FileTypeInfo> = {
  // ========== 文档格式 ==========
  ".txt": {
    extension: ".txt",
    mimeType: "text/plain",
    category: "document",
    name: "文本文档",
    icon: "file-text",
    color: "#6b7280",
    previewable: true,
    previewType: "text",
    searchable: true,
    aiProcessable: true,
  },
  ".md": {
    extension: ".md",
    mimeType: "text/markdown",
    category: "document",
    name: "Markdown文档",
    icon: "file-markdown",
    color: "#0891b2",
    previewable: true,
    previewType: "markdown",
    searchable: true,
    aiProcessable: true,
  },
  ".markdown": {
    extension: ".markdown",
    mimeType: "text/markdown",
    category: "document",
    name: "Markdown文档",
    icon: "file-markdown",
    color: "#0891b2",
    previewable: true,
    previewType: "markdown",
    searchable: true,
    aiProcessable: true,
  },
  ".pdf": {
    extension: ".pdf",
    mimeType: "application/pdf",
    category: "document",
    name: "PDF文档",
    icon: "file-pdf",
    color: "#ef4444",
    previewable: true,
    previewType: "pdf",
    searchable: true,
    aiProcessable: true,
  },
  ".doc": {
    extension: ".doc",
    mimeType: "application/msword",
    category: "document",
    name: "Word文档",
    icon: "file-word",
    color: "#2563eb",
    previewable: false,
    aiProcessable: true,
  },
  ".docx": {
    extension: ".docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    category: "document",
    name: "Word文档",
    icon: "file-word",
    color: "#2563eb",
    previewable: false,
    aiProcessable: true,
  },
  ".rtf": {
    extension: ".rtf",
    mimeType: "application/rtf",
    category: "document",
    name: "RTF文档",
    icon: "file-text",
    color: "#6b7280",
    previewable: false,
    aiProcessable: true,
  },
  ".odt": {
    extension: ".odt",
    mimeType: "application/vnd.oasis.opendocument.text",
    category: "document",
    name: "OpenDocument文本文档",
    icon: "file-text",
    color: "#22c55e",
    previewable: false,
    aiProcessable: true,
  },

  // ========== 电子表格 ==========
  ".xls": {
    extension: ".xls",
    mimeType: "application/vnd.ms-excel",
    category: "spreadsheet",
    name: "Excel表格",
    icon: "file-spreadsheet",
    color: "#16a34a",
    previewable: false,
    aiProcessable: true,
  },
  ".xlsx": {
    extension: ".xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    category: "spreadsheet",
    name: "Excel表格",
    icon: "file-spreadsheet",
    color: "#16a34a",
    previewable: false,
    aiProcessable: true,
  },
  ".csv": {
    extension: ".csv",
    mimeType: "text/csv",
    category: "spreadsheet",
    name: "CSV表格",
    icon: "file-spreadsheet",
    color: "#16a34a",
    previewable: true,
    previewType: "csv",
    searchable: true,
    aiProcessable: true,
  },
  ".tsv": {
    extension: ".tsv",
    mimeType: "text/tab-separated-values",
    category: "spreadsheet",
    name: "TSV表格",
    icon: "file-spreadsheet",
    color: "#16a34a",
    previewable: true,
    previewType: "csv",
    searchable: true,
    aiProcessable: true,
  },
  ".ods": {
    extension: ".ods",
    mimeType: "application/vnd.oasis.opendocument.spreadsheet",
    category: "spreadsheet",
    name: "OpenDocument电子表格",
    icon: "file-spreadsheet",
    color: "#22c55e",
    previewable: false,
    aiProcessable: true,
  },

  // ========== 演示文稿 ==========
  ".ppt": {
    extension: ".ppt",
    mimeType: "application/vnd.ms-powerpoint",
    category: "presentation",
    name: "PowerPoint演示文稿",
    icon: "file-presentation",
    color: "#ea580c",
    previewable: false,
    aiProcessable: true,
  },
  ".pptx": {
    extension: ".pptx",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    category: "presentation",
    name: "PowerPoint演示文稿",
    icon: "file-presentation",
    color: "#ea580c",
    previewable: false,
    aiProcessable: true,
  },
  ".odp": {
    extension: ".odp",
    mimeType: "application/vnd.oasis.opendocument.presentation",
    category: "presentation",
    name: "OpenDocument演示文稿",
    icon: "file-presentation",
    color: "#22c55e",
    previewable: false,
    aiProcessable: true,
  },

  // ========== 图片格式 ==========
  ".jpg": {
    extension: ".jpg",
    mimeType: "image/jpeg",
    category: "image",
    name: "JPEG图片",
    icon: "image",
    color: "#f97316",
    previewable: true,
    previewType: "image",
    aiProcessable: true,
  },
  ".jpeg": {
    extension: ".jpeg",
    mimeType: "image/jpeg",
    category: "image",
    name: "JPEG图片",
    icon: "image",
    color: "#f97316",
    previewable: true,
    previewType: "image",
    aiProcessable: true,
  },
  ".png": {
    extension: ".png",
    mimeType: "image/png",
    category: "image",
    name: "PNG图片",
    icon: "image",
    color: "#3b82f6",
    previewable: true,
    previewType: "image",
    aiProcessable: true,
  },
  ".gif": {
    extension: ".gif",
    mimeType: "image/gif",
    category: "image",
    name: "GIF动图",
    icon: "image",
    color: "#a855f7",
    previewable: true,
    previewType: "image",
  },
  ".webp": {
    extension: ".webp",
    mimeType: "image/webp",
    category: "image",
    name: "WebP图片",
    icon: "image",
    color: "#14b8a6",
    previewable: true,
    previewType: "image",
    aiProcessable: true,
  },
  ".svg": {
    extension: ".svg",
    mimeType: "image/svg+xml",
    category: "image",
    name: "SVG矢量图",
    icon: "image",
    color: "#8b5cf6",
    previewable: true,
    previewType: "image",
    searchable: true,
  },
  ".bmp": {
    extension: ".bmp",
    mimeType: "image/bmp",
    category: "image",
    name: "BMP位图",
    icon: "image",
    color: "#64748b",
    previewable: true,
    previewType: "image",
  },
  ".ico": {
    extension: ".ico",
    mimeType: "image/x-icon",
    category: "image",
    name: "图标文件",
    icon: "image",
    color: "#64748b",
    previewable: true,
    previewType: "image",
  },
  ".avif": {
    extension: ".avif",
    mimeType: "image/avif",
    category: "image",
    name: "AVIF图片",
    icon: "image",
    color: "#0d9488",
    previewable: true,
    previewType: "image",
  },
  ".heic": {
    extension: ".heic",
    mimeType: "image/heic",
    category: "image",
    name: "HEIC图片",
    icon: "image",
    color: "#0d9488",
    previewable: false,
  },
  ".heif": {
    extension: ".heif",
    mimeType: "image/heif",
    category: "image",
    name: "HEIF图片",
    icon: "image",
    color: "#0d9488",
    previewable: false,
  },
  ".tiff": {
    extension: ".tiff",
    mimeType: "image/tiff",
    category: "image",
    name: "TIFF图片",
    icon: "image",
    color: "#64748b",
    previewable: false,
  },
  ".tif": {
    extension: ".tif",
    mimeType: "image/tiff",
    category: "image",
    name: "TIFF图片",
    icon: "image",
    color: "#64748b",
    previewable: false,
  },
  ".raw": {
    extension: ".raw",
    mimeType: "image/raw",
    category: "image",
    name: "RAW图片",
    icon: "image",
    color: "#64748b",
    previewable: false,
  },

  // ========== 视频格式 ==========
  ".mp4": {
    extension: ".mp4",
    mimeType: "video/mp4",
    category: "video",
    name: "MP4视频",
    icon: "video",
    color: "#ef4444",
    previewable: true,
    previewType: "video",
  },
  ".webm": {
    extension: ".webm",
    mimeType: "video/webm",
    category: "video",
    name: "WebM视频",
    icon: "video",
    color: "#14b8a6",
    previewable: true,
    previewType: "video",
  },
  ".mov": {
    extension: ".mov",
    mimeType: "video/quicktime",
    category: "video",
    name: "QuickTime视频",
    icon: "video",
    color: "#6366f1",
    previewable: false,
  },
  ".avi": {
    extension: ".avi",
    mimeType: "video/x-msvideo",
    category: "video",
    name: "AVI视频",
    icon: "video",
    color: "#64748b",
    previewable: false,
  },
  ".mkv": {
    extension: ".mkv",
    mimeType: "video/x-matroska",
    category: "video",
    name: "MKV视频",
    icon: "video",
    color: "#8b5cf6",
    previewable: false,
  },
  ".flv": {
    extension: ".flv",
    mimeType: "video/x-flv",
    category: "video",
    name: "FLV视频",
    icon: "video",
    color: "#f97316",
    previewable: false,
  },
  ".wmv": {
    extension: ".wmv",
    mimeType: "video/x-ms-wmv",
    category: "video",
    name: "WMV视频",
    icon: "video",
    color: "#64748b",
    previewable: false,
  },
  ".m4v": {
    extension: ".m4v",
    mimeType: "video/x-m4v",
    category: "video",
    name: "M4V视频",
    icon: "video",
    color: "#64748b",
    previewable: false,
  },
  ".ogv": {
    extension: ".ogv",
    mimeType: "video/ogg",
    category: "video",
    name: "OGG视频",
    icon: "video",
    color: "#22c55e",
    previewable: false,
  },
  ".3gp": {
    extension: ".3gp",
    mimeType: "video/3gpp",
    category: "video",
    name: "3GP视频",
    icon: "video",
    color: "#64748b",
    previewable: false,
  },

  // ========== 音频格式 ==========
  ".mp3": {
    extension: ".mp3",
    mimeType: "audio/mpeg",
    category: "audio",
    name: "MP3音频",
    icon: "music",
    color: "#f97316",
    previewable: true,
    previewType: "audio",
  },
  ".wav": {
    extension: ".wav",
    mimeType: "audio/wav",
    category: "audio",
    name: "WAV音频",
    icon: "music",
    color: "#3b82f6",
    previewable: true,
    previewType: "audio",
  },
  ".ogg": {
    extension: ".ogg",
    mimeType: "audio/ogg",
    category: "audio",
    name: "OGG音频",
    icon: "music",
    color: "#22c55e",
    previewable: true,
    previewType: "audio",
  },
  ".flac": {
    extension: ".flac",
    mimeType: "audio/flac",
    category: "audio",
    name: "FLAC无损音频",
    icon: "music",
    color: "#14b8a6",
    previewable: false,
  },
  ".aac": {
    extension: ".aac",
    mimeType: "audio/aac",
    category: "audio",
    name: "AAC音频",
    icon: "music",
    color: "#64748b",
    previewable: false,
  },
  ".m4a": {
    extension: ".m4a",
    mimeType: "audio/mp4",
    category: "audio",
    name: "M4A音频",
    icon: "music",
    color: "#64748b",
    previewable: false,
  },
  ".wma": {
    extension: ".wma",
    mimeType: "audio/x-ms-wma",
    category: "audio",
    name: "WMA音频",
    icon: "music",
    color: "#64748b",
    previewable: false,
  },
  ".ape": {
    extension: ".ape",
    mimeType: "audio/ape",
    category: "audio",
    name: "APE无损音频",
    icon: "music",
    color: "#8b5cf6",
    previewable: false,
  },
  ".opus": {
    extension: ".opus",
    mimeType: "audio/opus",
    category: "audio",
    name: "Opus音频",
    icon: "music",
    color: "#22c55e",
    previewable: false,
  },
  ".mid": {
    extension: ".mid",
    mimeType: "audio/midi",
    category: "audio",
    name: "MIDI音乐",
    icon: "music",
    color: "#64748b",
    previewable: false,
  },

  // ========== 压缩包格式 ==========
  ".zip": {
    extension: ".zip",
    mimeType: "application/zip",
    category: "archive",
    name: "ZIP压缩包",
    icon: "file-archive",
    color: "#f59e0b",
    previewable: false,
  },
  ".rar": {
    extension: ".rar",
    mimeType: "application/vnd.rar",
    category: "archive",
    name: "RAR压缩包",
    icon: "file-archive",
    color: "#dc2626",
    previewable: false,
  },
  ".7z": {
    extension: ".7z",
    mimeType: "application/x-7z-compressed",
    category: "archive",
    name: "7z压缩包",
    icon: "file-archive",
    color: "#059669",
    previewable: false,
  },
  ".tar": {
    extension: ".tar",
    mimeType: "application/x-tar",
    category: "archive",
    name: "TAR归档",
    icon: "file-archive",
    color: "#64748b",
    previewable: false,
  },
  ".gz": {
    extension: ".gz",
    mimeType: "application/gzip",
    category: "archive",
    name: "GZIP压缩",
    icon: "file-archive",
    color: "#64748b",
    previewable: false,
  },
  ".tar.gz": {
    extension: ".tar.gz",
    mimeType: "application/gzip",
    category: "archive",
    name: "TAR.GZ压缩包",
    icon: "file-archive",
    color: "#64748b",
    previewable: false,
  },
  ".bz2": {
    extension: ".bz2",
    mimeType: "application/x-bzip2",
    category: "archive",
    name: "BZIP2压缩",
    icon: "file-archive",
    color: "#64748b",
    previewable: false,
  },
  ".xz": {
    extension: ".xz",
    mimeType: "application/x-xz",
    category: "archive",
    name: "XZ压缩",
    icon: "file-archive",
    color: "#64748b",
    previewable: false,
  },

  // ========== 代码格式 ==========
  ".js": {
    extension: ".js",
    mimeType: "application/javascript",
    category: "code",
    name: "JavaScript代码",
    icon: "file-code",
    color: "#f7df1e",
    previewable: true,
    previewType: "code",
    searchable: true,
    aiProcessable: true,
  },
  ".jsx": {
    extension: ".jsx",
    mimeType: "text/jsx",
    category: "code",
    name: "JSX代码",
    icon: "file-code",
    color: "#61dafb",
    previewable: true,
    previewType: "code",
    searchable: true,
    aiProcessable: true,
  },
  ".ts": {
    extension: ".ts",
    mimeType: "application/typescript",
    category: "code",
    name: "TypeScript代码",
    icon: "file-code",
    color: "#3178c6",
    previewable: true,
    previewType: "code",
    searchable: true,
    aiProcessable: true,
  },
  ".tsx": {
    extension: ".tsx",
    mimeType: "text/tsx",
    category: "code",
    name: "TSX代码",
    icon: "file-code",
    color: "#3178c6",
    previewable: true,
    previewType: "code",
    searchable: true,
    aiProcessable: true,
  },
  ".html": {
    extension: ".html",
    mimeType: "text/html",
    category: "code",
    name: "HTML网页",
    icon: "file-code",
    color: "#e34f26",
    previewable: true,
    previewType: "code",
    searchable: true,
    aiProcessable: true,
  },
  ".htm": {
    extension: ".htm",
    mimeType: "text/html",
    category: "code",
    name: "HTML网页",
    icon: "file-code",
    color: "#e34f26",
    previewable: true,
    previewType: "code",
    searchable: true,
    aiProcessable: true,
  },
  ".css": {
    extension: ".css",
    mimeType: "text/css",
    category: "code",
    name: "CSS样式",
    icon: "file-code",
    color: "#264de4",
    previewable: true,
    previewType: "code",
    searchable: true,
    aiProcessable: true,
  },
  ".scss": {
    extension: ".scss",
    mimeType: "text/x-scss",
    category: "code",
    name: "SCSS样式",
    icon: "file-code",
    color: "#cd6799",
    previewable: true,
    previewType: "code",
    searchable: true,
    aiProcessable: true,
  },
  ".less": {
    extension: ".less",
    mimeType: "text/less",
    category: "code",
    name: "Less样式",
    icon: "file-code",
    color: "#1d365d",
    previewable: true,
    previewType: "code",
    searchable: true,
    aiProcessable: true,
  },
  ".json": {
    extension: ".json",
    mimeType: "application/json",
    category: "data",
    name: "JSON数据",
    icon: "file-json",
    color: "#f59e0b",
    previewable: true,
    previewType: "json",
    searchable: true,
    aiProcessable: true,
  },
  ".xml": {
    extension: ".xml",
    mimeType: "application/xml",
    category: "data",
    name: "XML数据",
    icon: "file-code",
    color: "#0060ac",
    previewable: true,
    previewType: "code",
    searchable: true,
    aiProcessable: true,
  },
  ".yaml": {
    extension: ".yaml",
    mimeType: "text/yaml",
    category: "data",
    name: "YAML配置",
    icon: "file-code",
    color: "#cb171e",
    previewable: true,
    previewType: "code",
    searchable: true,
    aiProcessable: true,
  },
  ".yml": {
    extension: ".yml",
    mimeType: "text/yaml",
    category: "data",
    name: "YAML配置",
    icon: "file-code",
    color: "#cb171e",
    previewable: true,
    previewType: "code",
    searchable: true,
    aiProcessable: true,
  },
  ".py": {
    extension: ".py",
    mimeType: "text/x-python",
    category: "code",
    name: "Python代码",
    icon: "file-code",
    color: "#3776ab",
    previewable: true,
    previewType: "code",
    searchable: true,
    aiProcessable: true,
  },
  ".java": {
    extension: ".java",
    mimeType: "text/x-java",
    category: "code",
    name: "Java代码",
    icon: "file-code",
    color: "#ed8b00",
    previewable: true,
    previewType: "code",
    searchable: true,
    aiProcessable: true,
  },
  ".c": {
    extension: ".c",
    mimeType: "text/x-c",
    category: "code",
    name: "C语言代码",
    icon: "file-code",
    color: "#00599c",
    previewable: true,
    previewType: "code",
    searchable: true,
    aiProcessable: true,
  },
  ".cpp": {
    extension: ".cpp",
    mimeType: "text/x-c++",
    category: "code",
    name: "C++代码",
    icon: "file-code",
    color: "#00599c",
    previewable: true,
    previewType: "code",
    searchable: true,
    aiProcessable: true,
  },
  ".go": {
    extension: ".go",
    mimeType: "text/x-go",
    category: "code",
    name: "Go代码",
    icon: "file-code",
    color: "#00add8",
    previewable: true,
    previewType: "code",
    searchable: true,
    aiProcessable: true,
  },
  ".rs": {
    extension: ".rs",
    mimeType: "text/x-rust",
    category: "code",
    name: "Rust代码",
    icon: "file-code",
    color: "#dea584",
    previewable: true,
    previewType: "code",
    searchable: true,
    aiProcessable: true,
  },
  ".rb": {
    extension: ".rb",
    mimeType: "text/x-ruby",
    category: "code",
    name: "Ruby代码",
    icon: "file-code",
    color: "#cc342d",
    previewable: true,
    previewType: "code",
    searchable: true,
    aiProcessable: true,
  },
  ".php": {
    extension: ".php",
    mimeType: "text/x-php",
    category: "code",
    name: "PHP代码",
    icon: "file-code",
    color: "#777bb4",
    previewable: true,
    previewType: "code",
    searchable: true,
    aiProcessable: true,
  },
  ".sql": {
    extension: ".sql",
    mimeType: "text/x-sql",
    category: "code",
    name: "SQL脚本",
    icon: "database",
    color: "#00758f",
    previewable: true,
    previewType: "code",
    searchable: true,
    aiProcessable: true,
  },
  ".sh": {
    extension: ".sh",
    mimeType: "text/x-shellscript",
    category: "code",
    name: "Shell脚本",
    icon: "terminal",
    color: "#4eaa25",
    previewable: true,
    previewType: "code",
    searchable: true,
    aiProcessable: true,
  },
  ".bash": {
    extension: ".bash",
    mimeType: "text/x-shellscript",
    category: "code",
    name: "Bash脚本",
    icon: "terminal",
    color: "#4eaa25",
    previewable: true,
    previewType: "code",
    searchable: true,
    aiProcessable: true,
  },

  // ========== 电子书格式 ==========
  ".epub": {
    extension: ".epub",
    mimeType: "application/epub+zip",
    category: "ebook",
    name: "EPUB电子书",
    icon: "book-open",
    color: "#8b5cf6",
    previewable: false,
    aiProcessable: true,
  },
  ".mobi": {
    extension: ".mobi",
    mimeType: "application/x-mobipocket-ebook",
    category: "ebook",
    name: "MOBI电子书",
    icon: "book-open",
    color: "#f59e0b",
    previewable: false,
  },
  ".azw": {
    extension: ".azw",
    mimeType: "application/vnd.amazon.ebook",
    category: "ebook",
    name: "Kindle电子书",
    icon: "book-open",
    color: "#ef4444",
    previewable: false,
  },
  ".azw3": {
    extension: ".azw3",
    mimeType: "application/vnd.amazon.ebook",
    category: "ebook",
    name: "Kindle电子书",
    icon: "book-open",
    color: "#ef4444",
    previewable: false,
  },
  ".djvu": {
    extension: ".djvu",
    mimeType: "image/vnd.djvu",
    category: "ebook",
    name: "DjVu电子书",
    icon: "book-open",
    color: "#64748b",
    previewable: false,
  },

  // ========== 字体格式 ==========
  ".ttf": {
    extension: ".ttf",
    mimeType: "font/ttf",
    category: "font",
    name: "TrueType字体",
    icon: "type",
    color: "#8b5cf6",
    previewable: false,
  },
  ".otf": {
    extension: ".otf",
    mimeType: "font/otf",
    category: "font",
    name: "OpenType字体",
    icon: "type",
    color: "#8b5cf6",
    previewable: false,
  },
  ".woff": {
    extension: ".woff",
    mimeType: "font/woff",
    category: "font",
    name: "WOFF字体",
    icon: "type",
    color: "#8b5cf6",
    previewable: false,
  },
  ".woff2": {
    extension: ".woff2",
    mimeType: "font/woff2",
    category: "font",
    name: "WOFF2字体",
    icon: "type",
    color: "#8b5cf6",
    previewable: false,
  },
  ".eot": {
    extension: ".eot",
    mimeType: "application/vnd.ms-fontobject",
    category: "font",
    name: "EOT字体",
    icon: "type",
    color: "#64748b",
    previewable: false,
  },
};

/**
 * 根据文件名获取文件类型信息
 */
export function getFileTypeInfo(filename: string): FileTypeInfo {
  const ext = getFileExtension(filename).toLowerCase();

  // 先检查双扩展名（如 .tar.gz）
  const doubleExt = getDoubleExtension(filename).toLowerCase();
  if (FILE_TYPES[doubleExt]) {
    return FILE_TYPES[doubleExt];
  }

  if (FILE_TYPES[ext]) {
    return FILE_TYPES[ext];
  }

  // 默认类型
  return {
    extension: ext,
    mimeType: "application/octet-stream",
    category: "other",
    name: "未知文件",
    icon: "file",
    color: "#6b7280",
    previewable: false,
  };
}

/**
 * 获取文件扩展名
 */
export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1 || lastDot === 0) return "";
  return filename.slice(lastDot);
}

/**
 * 获取双扩展名（如 .tar.gz）
 */
export function getDoubleExtension(filename: string): string {
  const parts = filename.split(".");
  if (parts.length >= 3) {
    return "." + parts.slice(-2).join(".");
  }
  return "";
}

/**
 * 获取文件分类
 */
export function getFileCategory(filename: string): FileCategory {
  return getFileTypeInfo(filename).category;
}

/**
 * 检查文件是否可预览
 */
export function isPreviewable(filename: string): boolean {
  return getFileTypeInfo(filename).previewable;
}

/**
 * 检查文件是否可搜索
 */
export function isSearchable(filename: string): boolean {
  return getFileTypeInfo(filename).searchable ?? false;
}

/**
 * 检查文件是否可AI处理
 */
export function isAiProcessable(filename: string): boolean {
  return getFileTypeInfo(filename).aiProcessable ?? false;
}

/**
 * 获取文件分类列表
 */
export function getFileCategories(): { id: FileCategory; name: string; icon: string }[] {
  return [
    { id: "document", name: "文档", icon: "file-text" },
    { id: "spreadsheet", name: "表格", icon: "file-spreadsheet" },
    { id: "presentation", name: "演示", icon: "file-presentation" },
    { id: "image", name: "图片", icon: "image" },
    { id: "video", name: "视频", icon: "video" },
    { id: "audio", name: "音频", icon: "music" },
    { id: "archive", name: "压缩包", icon: "file-archive" },
    { id: "code", name: "代码", icon: "file-code" },
    { id: "data", name: "数据", icon: "database" },
    { id: "ebook", name: "电子书", icon: "book-open" },
    { id: "font", name: "字体", icon: "type" },
    { id: "other", name: "其他", icon: "file" },
  ];
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * 获取MIME类型
 */
export function getMimeType(filename: string): string {
  return getFileTypeInfo(filename).mimeType;
}

/**
 * 检查是否是图片文件
 */
export function isImage(filename: string): boolean {
  return getFileCategory(filename) === "image";
}

/**
 * 检查是否是视频文件
 */
export function isVideo(filename: string): boolean {
  return getFileCategory(filename) === "video";
}

/**
 * 检查是否是音频文件
 */
export function isAudio(filename: string): boolean {
  return getFileCategory(filename) === "audio";
}

/**
 * 检查是否是文档文件
 */
export function isDocument(filename: string): boolean {
  return getFileCategory(filename) === "document";
}

/**
 * 检查是否是代码文件
 */
export function isCode(filename: string): boolean {
  return getFileCategory(filename) === "code";
}

/**
 * 获取支持的图片格式列表
 */
export function getSupportedImageFormats(): string[] {
  return Object.values(FILE_TYPES)
    .filter((f) => f.category === "image" && f.previewable)
    .map((f) => f.extension);
}

/**
 * 获取支持的视频格式列表
 */
export function getSupportedVideoFormats(): string[] {
  return Object.values(FILE_TYPES)
    .filter((f) => f.category === "video" && f.previewable)
    .map((f) => f.extension);
}

/**
 * 获取支持的音频格式列表
 */
export function getSupportedAudioFormats(): string[] {
  return Object.values(FILE_TYPES)
    .filter((f) => f.category === "audio" && f.previewable)
    .map((f) => f.extension);
}

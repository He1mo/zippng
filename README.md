# ZipPNG - 简单的图片批量压缩工具

ZipPNG 是一个基于 Node.js 开发的本地图片压缩小工具。它提供了一个简单的网页界面，方便你批量处理本地图片，在减小文件体积的同时尽量保持清晰度。

[English](#english) | [中文](#chinese)

---

<a name="chinese"></a>
## 中文说明

### 🛠 主要功能

- **界面简单**: 采用类 iOS 的简约设计，支持暗黑/明亮模式。
- **列表浏览**: 支持图片缩略图显示，方便查看文件夹内容。
- **图片压缩**: 
  - 使用 Sharp 引擎进行处理。
  - 针对 PNG 做了优化，尝试在保持质量的前提下减小体积。
  - 默认尝试将图片控制在 300KB 以内。
- **备份选项**: 提供备份开关，压缩前可以自动把原图存到备份文件夹里。
- **本地处理**: 所有操作都在你电脑上完成，不上传文件，安全放心。
- **实时进度**: 可以看到处理日志和简单的进度条。

### 📦 快速开始

1. **安装依赖**:
   ```bash
   npm install
   ```
2. **启动**:
   ```bash
   node server.js
   ```
3. **使用**: 浏览器打开 `http://localhost:3000` 即可。

---

<a name="english"></a>
## English Description

### 🛠 Features

- **Simple UI**: A clean, iOS-inspired interface with Dark/Light mode support.
- **File Browser**: View your folders with image thumbnails.
- **Image Compression**:
  - Powered by the Sharp library.
  - Includes specific optimizations for PNG files.
  - Targets a file size of under 300KB by default.
- **Backup Support**: Optional backup feature to keep your original files safe.
- **Local Only**: Everything runs on your own machine. No files are uploaded anywhere.
- **Live Progress**: Simple progress tracking and activity logs.

### 📦 How to Use

1. **Install**: `npm install`
2. **Run**: `node server.js`
3. **Open**: Go to `http://localhost:3000` in your browser.

---

### 📄 License

Distributed under the ISC License.

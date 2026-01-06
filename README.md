# Zipper - 智能图片批量压缩工具

[English](#english) | [中文](#chinese)

---

<a name="english"></a>
## English

Zipper is a powerful, local-first image optimization tool built with Node.js. It allows you to scan, manage, and batch-compress images with a modern, real-time UI.

### 🚀 Features

- **Recursive Scanning**: Deeply scan folders to find all images (JPG, JPEG, PNG).
- **Intelligent Compression**: Powered by [Sharp](https://github.com/lovell/sharp), automatically balancing quality and file size (target < 300KB).
- **Real-time Feedback**: Live progress bars and activity logs using Server-Sent Events (SSE).
- **Concurrency Control**: Multi-worker processing for high-performance optimization.
- **Job Management**: Pause, resume, or cancel tasks at any time.
- **Modern UI**: Clean, Gemini-inspired dark mode interface with bilingual support (EN/ZH).
- **Local First**: All processing happens on your machine. No images are uploaded to any server.

### 🛠 Tech Stack

- **Backend**: Node.js, Express
- **Image Processing**: Sharp
- **Frontend**: Vanilla JS, CSS Grid/Flexbox (Modern UI)
- **Communication**: SSE (Server-Sent Events)

### 📦 Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/zipper.git
   cd zipper
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the server**
   ```bash
   npm start
   ```
   Open your browser and navigate to `http://localhost:3000`.

---

<a name="chinese"></a>
## 中文

Zipper 是一款基于 Node.js 开发的高性能本地图片批量压缩工具。它提供现代化的实时交互界面，帮助你快速扫描并优化大量图片。

### 🚀 功能特性

- **递归扫描**: 深度遍历文件夹，支持查找所有图片格式（JPG, JPEG, PNG）。
- **智能压缩**: 基于 [Sharp](https://github.com/lovell/sharp) 引擎，自动平衡画质与体积（默认目标 < 300KB）。
- **实时反馈**: 使用 SSE 技术实现秒级同步的进度条和处理日志。
- **并发处理**: 支持多线程并发优化，充分利用 CPU 性能。
- **任务控制**: 处理过程中支持随时暂停、继续或取消任务。
- **现代化 UI**: 极简的 Gemini 风格暗黑模式界面，支持中英文双语切换。
- **隐私安全**: 所有操作均在本地完成，图片不会上传到任何服务器。

### 🛠 技术栈

- **后端**: Node.js, Express
- **图像处理**: Sharp
- **前端**: 原生 JavaScript, CSS Grid/Flexbox
- **实时通信**: SSE (Server-Sent Events)

### 📦 安装与使用

1. **克隆仓库**
   ```bash
   git clone https://github.com/your-username/zipper.git
   cd zipper
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **启动应用**
   ```bash
   npm start
   ```
   在浏览器中访问 `http://localhost:3000` 即可开始使用。

---

### 📄 License

Distributed under the ISC License. See `LICENSE` for more information.

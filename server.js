const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const sharp = require('sharp');

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static('public'));

/**
 * 任务管理器 - 封装状态与核心逻辑
 */
class JobManager {
    constructor() {
        this.reset();
        this.clients = new Set();
        this.concurrency = 4;
    }

    reset() {
        this.files = [];
        this.results = [];
        this.total = 0;
        this.processedCount = 0;
        this.completedCount = 0;
        this.status = 'idle'; // idle, running, paused, cancelled, completed
        this.startTime = null;
        this.selectedPaths = [];
        this.doBackup = false;
        this.rootPath = null;
        this.folderMap = {};
        this.folderCompletedMap = {};
    }

    // SSE 广播
    broadcast(data) {
        const message = `data: ${JSON.stringify(data)}\n\n`;
        for (const client of this.clients) {
            if (!client.writableEnded) {
                client.write(message);
            } else {
                this.clients.delete(client);
            }
        }
    }

    addClient(res) {
        this.clients.add(res);
        // 发送初始状态
        const initData = {
            type: 'init',
            status: this.status,
            current: this.completedCount,
            total: this.total
        };
        res.write(`data: ${JSON.stringify(initData)}\n\n`);
    }

    removeClient(res) {
        this.clients.delete(res);
    }

    async start(files, options) {
        this.reset();
        this.files = files;
        this.total = files.length;
        this.selectedPaths = options.selectedPaths;
        this.doBackup = options.doBackup;
        this.rootPath = options.rootPath;
        this.status = 'running';
        this.startTime = new Date();

        this.broadcast({
            type: 'status',
            status: 'running',
            message: '任务开始',
            total: this.total,
            current: 0
        });

        const workers = Array(this.concurrency).fill(null).map(() => this.worker());
        await Promise.all(workers);
    }

    async worker() {
        while (this.status === 'running' && this.processedCount < this.total) {
            const index = this.processedCount++;
            if (index >= this.total) break;

            const filePath = this.files[index];
            const fileName = path.basename(filePath);
            const folderPath = path.dirname(filePath);
            const folderName = path.basename(folderPath);

            // 1. 备份逻辑
            if (this.doBackup && this.rootPath) {
                try {
                    // 将备份文件夹放在根目录的同级，命名为 "原文件夹名_backup"
                    const backupRoot = `${this.rootPath}_backup`;
                    const relativePath = path.relative(this.rootPath, filePath);
                    const backupPath = path.join(backupRoot, relativePath);
                    const backupDir = path.dirname(backupPath);
                    
                    // 确保备份子目录存在
                    if (!fs.existsSync(backupDir)) {
                        await fs.mkdir(backupDir, { recursive: true });
                    }
                    
                    // 如果备份文件不存在，则复制
                    if (!fs.existsSync(backupPath)) {
                        await fs.copyFile(filePath, backupPath);
                    }
                } catch (err) {
                    this.broadcast({ type: 'log', message: `[警告] 备份失败: ${fileName} - ${err.message}` });
                }
            }

            // 2. 压缩逻辑
            this.broadcast({ type: 'log', message: `正在处理 (${index + 1}/${this.total}): ${folderName}/${fileName}` });
            const result = await compressImageCore(filePath, this.selectedPaths);
            
            this.results.push(result);
            this.completedCount++;

            // 3. 进度广播
            const percent = Math.round((this.completedCount / this.total) * 100);
            this.broadcast({
                type: 'progress',
                current: this.completedCount,
                total: this.total,
                percent: percent,
                result: result
            });

            if (this.completedCount === this.total) {
                this.status = 'completed';
                this.broadcast({
                    type: 'status',
                    status: 'completed',
                    message: '所有任务已完成',
                    total: this.total,
                    current: this.completedCount,
                    results: this.results
                });
            }
        }
    }

    pause() {
        if (this.status === 'running') {
            this.status = 'paused';
            this.broadcast({ type: 'status', status: 'paused', message: '任务已暂停' });
            return true;
        }
        return false;
    }

    resume() {
        if (this.status === 'paused') {
            this.status = 'running';
            this.broadcast({ 
                type: 'status', 
                status: 'running', 
                message: '任务已恢复',
                total: this.total,
                current: this.completedCount 
            });
            Array(this.concurrency).fill(null).forEach(() => this.worker());
            return true;
        }
        return false;
    }

    cancel() {
        this.status = 'cancelled';
        this.broadcast({ type: 'status', status: 'cancelled', message: '任务已取消' });
        this.reset();
    }
}

const jobManager = new JobManager();

/**
 * 核心压缩函数
 */
async function compressImageCore(filePath, selectedPaths) {
    const stats = await fs.stat(filePath);
    const originalSizeKB = stats.size / 1024;
    const originalSizeStr = originalSizeKB > 1024 
        ? `${(originalSizeKB / 1024).toFixed(2)}MB` 
        : `${originalSizeKB.toFixed(2)}KB`;

    const TARGET_MAX_SIZE = 300 * 1024;
    const QUALITY_FLOOR = 60;

    try {
        const buffer = await fs.readFile(filePath);
        const metadata = await sharp(buffer).metadata();
        
        let quality = 85;
        let maxWidth = metadata.width > 2560 ? 2560 : metadata.width;
        let compressedBuffer = buffer;
        let attempts = 0;

        while (attempts < 8) {
            let pipeline = sharp(buffer).rotate().resize({ width: Math.round(maxWidth), withoutEnlargement: true, fit: 'inside' });
            const ext = path.extname(filePath).toLowerCase();
            
            if (ext === '.png') {
                compressedBuffer = await pipeline.png({ quality, compressionLevel: 9 }).toBuffer();
                if (compressedBuffer.length > 500 * 1024 && attempts > 2) {
                    compressedBuffer = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
                }
            } else {
                compressedBuffer = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
            }

            if (compressedBuffer.length <= TARGET_MAX_SIZE) break;
            if (quality > QUALITY_FLOOR) quality -= 10; else { maxWidth *= 0.8; quality = 75; }
            attempts++;
        }

        await fs.writeFile(filePath, compressedBuffer);
        return {
            file: path.relative(path.dirname(selectedPaths[0]), filePath),
            fullPath: filePath,
            originalSize: originalSizeStr,
            newSize: `${(compressedBuffer.length / 1024).toFixed(2)}KB`,
            status: 'success'
        };
    } catch (err) {
        return { file: filePath, fullPath: filePath, error: err.message, status: 'error' };
    }
}

// --- 路由接口 ---

app.get('/image', async (req, res) => {
    const filePath = req.query.path;
    if (filePath && fs.existsSync(filePath)) res.sendFile(filePath);
    else res.status(404).send('Not found');
});

app.get('/progress', (req, res) => {
    req.socket.setKeepAlive(true);
    req.socket.setNoDelay(true);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.write(': ok\n\n');

    jobManager.addClient(res);

    const heartbeat = setInterval(() => {
        if (!res.writableEnded) res.write(': heartbeat\n\n');
        else clearInterval(heartbeat);
    }, 10000);

    req.on('close', () => {
        clearInterval(heartbeat);
        jobManager.removeClient(res);
    });
});

app.post('/scan', async (req, res) => {
    const { folderPath } = req.body;
    if (!folderPath || !fs.existsSync(folderPath)) return res.status(400).json({ error: '路径无效' });

    try {
        const absPath = path.resolve(folderPath);
        const stats = await fs.stat(absPath);
        
        if (stats.isFile()) {
            const isImg = ['.jpg', '.jpeg', '.png'].includes(path.extname(absPath).toLowerCase());
            return res.json({
                root: { name: path.dirname(absPath), path: path.dirname(absPath), hasImages: isImg },
                folders: [],
                files: isImg ? [{ name: path.basename(absPath), path: absPath, size: stats.size }] : []
            });
        }

        const subfolders = await getSubfolders(absPath);
        const files = await fs.readdir(absPath, { withFileTypes: true });
        const imageFiles = [];
        for (const f of files) {
            if (!f.isDirectory() && ['.jpg', '.jpeg', '.png'].includes(path.extname(f.name).toLowerCase())) {
                const fPath = path.join(absPath, f.name);
                const fStats = await fs.stat(fPath);
                imageFiles.push({ name: f.name, path: fPath, size: fStats.size });
            }
        }
        res.json({ root: { name: path.basename(absPath), path: absPath, hasImages: imageFiles.length > 0 }, folders: subfolders, files: imageFiles });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/compress', async (req, res) => {
    const { selectedPaths, doBackup, rootPath } = req.body;
    if (!selectedPaths?.length) return res.status(400).json({ error: '未选择路径' });
    if (jobManager.status === 'running') return res.status(400).json({ error: '任务运行中' });

    try {
        const fileSet = new Set();
        for (const p of selectedPaths) {
            const files = await getAllImageFiles(p);
            files.forEach(f => fileSet.add(f));
        }
        const uniqueFiles = Array.from(fileSet);
        if (!uniqueFiles.length) return res.json({ message: '无图片', count: 0 });

        jobManager.start(uniqueFiles, { selectedPaths, doBackup, rootPath });
        res.json({ message: '已启动', count: uniqueFiles.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/job/pause', (req, res) => res.json({ success: jobManager.pause() }));
app.post('/job/resume', (req, res) => res.json({ success: jobManager.resume() }));
app.post('/job/cancel', (req, res) => { jobManager.cancel(); res.json({ success: true }); });

// --- 工具函数 ---

async function getSubfolders(dir, depth = 0, maxDepth = 3) {
    if (depth > maxDepth) return [];
    let folders = [];
    try {
        const items = await fs.readdir(dir, { withFileTypes: true });
        for (const item of items) {
            if (item.isDirectory() && !item.name.startsWith('.') && item.name !== 'node_modules') {
                const full = path.join(dir, item.name);
                folders.push({ name: item.name, path: full, depth });
                folders = folders.concat(await getSubfolders(full, depth + 1, maxDepth));
            }
        }
    } catch (e) {}
    return folders;
}

async function getAllImageFiles(target) {
    let res = [];
    try {
        const s = await fs.stat(target);
        if (s.isFile()) return ['.jpg', '.jpeg', '.png'].includes(path.extname(target).toLowerCase()) ? [target] : [];
        const list = await fs.readdir(target, { withFileTypes: true });
        for (const f of list) {
            const full = path.join(target, f.name);
            if (f.isDirectory()) res = res.concat(await getAllImageFiles(full));
            else if (['.jpg', '.jpeg', '.png'].includes(path.extname(f.name).toLowerCase())) res.push(full);
        }
    } catch (e) {}
    return res;
}

process.on('uncaughtException', (err) => console.error('Uncaught Exception:', err));
process.on('unhandledRejection', (reason) => console.error('Unhandled Rejection:', reason));

app.listen(port, () => console.log(`Server running at http://localhost:${port}`));

const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const sharp = require('sharp');

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static('public'));

// 任务管理状态
let currentJob = {
    files: [],
    results: [],
    total: 0,
    processedCount: 0, // 已领取的任务数
    completedCount: 0, // 已完成的任务数
    status: 'idle', 
    clients: [], 
    concurrency: 4,
    startTime: null
};

// 推送消息到所有 SSE 客户端
function broadcast(data) {
    currentJob.clients.forEach(client => {
        client.write(`data: ${JSON.stringify(data)}\n\n`);
    });
}

// 图片压缩核心逻辑 (抽取为独立函数)
async function compressImage(filePath, selectedPaths) {
    const file = path.basename(filePath);
    const stats = await fs.stat(filePath);
    const originalSizeKB = stats.size / 1024;
    const originalSizeStr = originalSizeKB > 1024 
        ? `${(originalSizeKB / 1024).toFixed(2)}MB` 
        : `${originalSizeKB.toFixed(2)}KB`;

    const TARGET_MAX_SIZE = 300 * 1024; // 300KB
    const QUALITY_FLOOR = 60;

    try {
        const buffer = await fs.readFile(filePath);
        const metadata = await sharp(buffer).metadata();
        
        let quality = 85;
        let maxWidth = metadata.width;
        if (metadata.width > 2560) maxWidth = 2560;

        let compressedBuffer = buffer;
        let attempts = 0;
        const maxAttempts = 8;

        while (attempts < maxAttempts) {
            let pipeline = sharp(buffer).rotate();
            pipeline = pipeline.resize({ 
                width: Math.round(maxWidth),
                withoutEnlargement: true,
                fit: 'inside'
            });

            const ext = path.extname(file).toLowerCase();
            if (ext === '.png') {
                compressedBuffer = await pipeline.png({ quality, compressionLevel: 9 }).toBuffer();
                if (compressedBuffer.length > 500 * 1024 && attempts > 2) {
                    compressedBuffer = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
                }
            } else {
                compressedBuffer = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
            }

            if (compressedBuffer.length <= TARGET_MAX_SIZE) break;

            if (quality > QUALITY_FLOOR) {
                quality -= 10;
            } else {
                maxWidth *= 0.8;
                quality = 75;
            }
            attempts++;
        }

        await fs.writeFile(filePath, compressedBuffer);
        const newSizeStr = `${(compressedBuffer.length / 1024).toFixed(2)}KB`;

        return {
            file: path.relative(path.dirname(selectedPaths[0]), filePath),
            originalSize: originalSizeStr,
            newSize: newSizeStr,
            status: 'success'
        };
    } catch (err) {
        return { 
            file: path.relative(path.dirname(selectedPaths[0]), filePath), 
            error: err.message, 
            status: 'error' 
        };
    }
}

// 并发执行器
async function startWorker() {
    if (currentJob.status !== 'running') return;

    while (currentJob.processedCount < currentJob.total) {
        if (currentJob.status === 'paused' || currentJob.status === 'cancelled') return;

        const index = currentJob.processedCount;
        currentJob.processedCount++; 

        if (index >= currentJob.total) break;

        const filePath = currentJob.files[index];
        broadcast({ 
            type: 'log', 
            message: `正在处理 (${index + 1}/${currentJob.total}): ${path.basename(filePath)}`
        });

        const result = await compressImage(filePath, currentJob.selectedPaths);
        currentJob.results.push(result);
        currentJob.completedCount++;

        const percent = Math.round((currentJob.completedCount / currentJob.total) * 100);
        broadcast({ 
            type: 'progress', 
            current: currentJob.completedCount, 
            total: currentJob.total,
            percent: percent,
            result: result 
        });

        if (currentJob.completedCount === currentJob.total) {
            currentJob.status = 'completed';
            broadcast({ 
                type: 'status', 
                status: 'completed', 
                message: '所有任务已完成',
                results: currentJob.results 
            });
        }
    }
}

// SSE 接口
app.get('/progress', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    currentJob.clients.push(res);

    req.on('close', () => {
        currentJob.clients = currentJob.clients.filter(c => c !== res);
    });

    // 发送当前状态
    res.write(`data: ${JSON.stringify({ 
        type: 'init', 
        status: currentJob.status, 
        current: currentJob.processedCount, 
        total: currentJob.total 
    })}\n\n`);
});

// 暂停/恢复/取消接口
app.post('/job/pause', (req, res) => {
    if (currentJob.status === 'running') {
        currentJob.status = 'paused';
        res.json({ success: true });
    } else {
        res.status(400).json({ error: '当前没有运行中的任务' });
    }
});

app.post('/job/resume', (req, res) => {
    if (currentJob.status === 'paused') {
        currentJob.status = 'running';
        broadcast({ type: 'status', status: 'running', message: '任务已恢复' });
        // 重启 worker
        for (let i = 0; i < currentJob.concurrency; i++) {
            startWorker();
        }
        res.json({ success: true });
    } else {
        res.status(400).json({ error: '任务不处于暂停状态' });
    }
});

app.post('/job/cancel', (req, res) => {
    currentJob.status = 'cancelled';
    currentJob.files = [];
    currentJob.results = [];
    currentJob.processedCount = 0;
    currentJob.total = 0;
    res.json({ success: true });
});

// 递归获取所有子文件夹
async function getSubfolders(dir, depth = 0, maxDepth = 3) {
    if (depth > maxDepth) return [];
    
    let subfolders = [];
    try {
        const items = await fs.readdir(dir, { withFileTypes: true });
        for (const item of items) {
            if (item.isDirectory() && !item.name.startsWith('.') && item.name !== 'node_modules') {
                const fullPath = path.join(dir, item.name);
                subfolders.push({
                    name: item.name,
                    path: fullPath,
                    depth: depth
                });
                // 递归获取更深层
                const nested = await getSubfolders(fullPath, depth + 1, maxDepth);
                subfolders = subfolders.concat(nested);
            }
        }
    } catch (err) {
        console.error(`读取目录 ${dir} 失败:`, err);
    }
    return subfolders;
}

// 递归获取文件夹下所有图片文件
async function getAllImageFiles(dir) {
    let results = [];
    const list = await fs.readdir(dir, { withFileTypes: true });
    for (const file of list) {
        const fullPath = path.join(dir, file.name);
        if (file.isDirectory()) {
            results = results.concat(await getAllImageFiles(fullPath));
        } else {
            const ext = path.extname(file.name).toLowerCase();
            if (ext === '.jpg' || ext === '.jpeg' || ext === '.png') {
                results.push(fullPath);
            }
        }
    }
    return results;
}

// 扫描目录接口
app.post('/scan', async (req, res) => {
    const { folderPath } = req.body;
    if (!folderPath || !fs.existsSync(folderPath)) {
        return res.status(400).json({ error: '无效的文件夹路径' });
    }

    try {
        const folders = await getSubfolders(folderPath);
        // 加上根目录本身
        const allFolders = [
            { name: '(当前根目录)', path: folderPath, depth: -1 },
            ...folders
        ];
        res.json({ folders: allFolders });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/compress', async (req, res) => {
    const { selectedPaths } = req.body;

    if (!selectedPaths || !Array.isArray(selectedPaths) || selectedPaths.length === 0) {
        return res.status(400).json({ error: '未选择任何文件夹' });
    }

    if (currentJob.status === 'running') {
        return res.status(400).json({ error: '当前已有任务在运行中' });
    }

    try {
        let allImageFiles = [];
        for (const folderPath of selectedPaths) {
            if (fs.existsSync(folderPath)) {
                const files = await fs.readdir(folderPath, { withFileTypes: true });
                for (const file of files) {
                    if (!file.isDirectory()) {
                        const ext = path.extname(file.name).toLowerCase();
                        if (ext === '.jpg' || ext === '.jpeg' || ext === '.png') {
                            allImageFiles.push(path.join(folderPath, file.name));
                        }
                    }
                }
            }
        }

        if (allImageFiles.length === 0) {
            return res.json({ message: '所选文件夹下没有发现图片', count: 0 });
        }

        // 初始化任务
        currentJob.files = allImageFiles;
        currentJob.selectedPaths = selectedPaths;
        currentJob.total = allImageFiles.length;
        currentJob.processedCount = 0;
        currentJob.results = [];
        currentJob.status = 'running';
        currentJob.startTime = new Date();

        // 异步启动处理
        broadcast({ type: 'status', status: 'running', message: '任务开始', total: currentJob.total });
        
        // 启动多个 worker 并发处理
        for (let i = 0; i < currentJob.concurrency; i++) {
            startWorker();
        }

        res.json({ message: '任务已启动', count: allImageFiles.length });
    } catch (error) {
        console.error('启动任务失败:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

app.listen(port, () => {
    console.log(`服务器运行在 http://localhost:${port}`);
});

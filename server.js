const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const sharp = require('sharp');

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static('public'));

// 获取图片接口 (用于预览)
app.get('/image', async (req, res) => {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).send('Path is required');
    try {
        if (fs.existsSync(filePath)) {
            res.sendFile(filePath);
        } else {
            res.status(404).send('File not found');
        }
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// 任务管理状态
let currentJob = {
    files: [],
    folderMap: {}, // 存储每个文件夹下的文件总数
    folderCompletedMap: {}, // 存储每个文件夹已完成的数量
    results: [],
    total: 0,
    processedCount: 0,
    completedCount: 0,
    status: 'idle', 
    clients: [], 
    concurrency: 4,
    startTime: null,
    selectedPaths: []
};

// 推送消息到所有 SSE 客户端
function broadcast(data) {
    const deadClients = [];
    currentJob.clients.forEach(client => {
        try {
            if (!client.writableEnded) {
                client.write(`data: ${JSON.stringify(data)}\n\n`);
            } else {
                deadClients.push(client);
            }
        } catch (err) {
            deadClients.push(client);
        }
    });
    
    if (deadClients.length > 0) {
        currentJob.clients = currentJob.clients.filter(c => !deadClients.includes(c));
    }
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
            fullPath: filePath,
            originalSize: originalSizeStr,
            newSize: newSizeStr,
            status: 'success'
        };
    } catch (err) {
        return { 
            file: path.relative(path.dirname(selectedPaths[0]), filePath), 
            fullPath: filePath,
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

        const index = currentJob.processedCount++; 

        if (index >= currentJob.total) break;

        const filePath = currentJob.files[index];
        const fileName = path.basename(filePath);
        const folderPath = path.dirname(filePath);
        const folderName = path.basename(folderPath);
        
        broadcast({ 
            type: 'log', 
            message: `正在处理 (${index + 1}/${currentJob.total}): ${folderName}/${fileName}`
        });

        if (currentJob.status !== 'running') break;
        const result = await compressImage(filePath, currentJob.selectedPaths);
        currentJob.results.push(result);
        currentJob.completedCount++;

        // 更新文件夹进度
        if (!currentJob.folderCompletedMap[folderPath]) {
            currentJob.folderCompletedMap[folderPath] = 0;
        }
        currentJob.folderCompletedMap[folderPath]++;

        const percent = Math.round((currentJob.completedCount / currentJob.total) * 100);
        broadcast({ 
            type: 'progress', 
            current: currentJob.completedCount, 
            total: currentJob.total,
            percent: percent,
            result: result
        });

        if (currentJob.completedCount === currentJob.total && currentJob.total > 0) {
            currentJob.status = 'completed';
            broadcast({ 
                type: 'status', 
                status: 'completed', 
                message: '所有任务已完成',
                total: currentJob.total,
                current: currentJob.completedCount,
                results: currentJob.results 
            });
        }
    }
}

// SSE 接口
app.get('/progress', (req, res) => {
    // 设置响应头，解决 ERR_ABORTED 问题
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'X-Accel-Buffering': 'no',
        'Content-Encoding': 'none'
    });
    
    // 立即发送注释行以维持连接
    res.write(': ok\n\n');

    currentJob.clients.push(res);

    // 发送当前状态
    const initData = { 
        type: 'init', 
        status: currentJob.status, 
        current: currentJob.completedCount, 
        total: currentJob.total
    };
    res.write(`data: ${JSON.stringify(initData)}\n\n`);

    // 发送心跳防止连接断开
    const heartbeat = setInterval(() => {
        if (!res.writableEnded) {
            res.write(': heartbeat\n\n');
        }
    }, 15000); // 稍微延长心跳时间

    // 监听连接断开
    req.on('close', () => {
        clearInterval(heartbeat);
        currentJob.clients = currentJob.clients.filter(c => c !== res);
    });
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
        broadcast({ 
            type: 'status', 
            status: 'running', 
            message: '任务已恢复',
            total: currentJob.total,
            current: currentJob.completedCount
        });
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
    currentJob.completedCount = 0;
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
                // 排除根目录自身（虽然 readdir 不会返回 .，但为了稳妥）
                if (path.resolve(fullPath) === path.resolve(dir)) continue;

                const stats = await fs.stat(fullPath);
                subfolders.push({
                    name: item.name,
                    path: fullPath,
                    depth: depth,
                    mtime: stats.mtimeMs
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
async function getAllImageFiles(targetPath) {
    let results = [];
    try {
        const stats = await fs.stat(targetPath);
        if (stats.isFile()) {
            const ext = path.extname(targetPath).toLowerCase();
            if (ext === '.jpg' || ext === '.jpeg' || ext === '.png') {
                return [targetPath];
            }
            return [];
        }

        const list = await fs.readdir(targetPath, { withFileTypes: true });
        for (const file of list) {
            const fullPath = path.join(targetPath, file.name);
            if (file.isDirectory()) {
                results = results.concat(await getAllImageFiles(fullPath));
            } else {
                const ext = path.extname(file.name).toLowerCase();
                if (ext === '.jpg' || ext === '.jpeg' || ext === '.png') {
                    results.push(fullPath);
                }
            }
        }
    } catch (err) {
        console.error(`读取 ${targetPath} 失败:`, err);
    }
    return results;
}

// 扫描目录接口
app.post('/scan', async (req, res) => {
    const { folderPath } = req.body;
    if (!folderPath) return res.status(400).json({ error: '路径不能为空' });

    try {
        if (!fs.existsSync(folderPath)) {
            return res.status(400).json({ error: '路径不存在' });
        }

        const absolutePath = path.resolve(folderPath);
        const stats = await fs.stat(absolutePath);

        // 如果输入的是一个文件
        if (stats.isFile()) {
            const ext = path.extname(absolutePath).toLowerCase();
            const isImage = ['.jpg', '.jpeg', '.png'].includes(ext);
            const imageFile = isImage ? [{
                name: path.basename(absolutePath),
                path: absolutePath,
                size: stats.size,
                mtime: stats.mtimeMs
            }] : [];

            return res.json({
                root: {
                    name: path.dirname(absolutePath),
                    path: path.dirname(absolutePath),
                    hasImages: isImage
                },
                folders: [],
                files: imageFile
            });
        }

        // 如果是文件夹
        const subfolders = await getSubfolders(absolutePath);
        
        // 获取当前目录下的图片文件
        const files = await fs.readdir(absolutePath, { withFileTypes: true });
        const imageFiles = [];
        
        for (const f of files) {
            if (!f.isDirectory()) {
                const ext = path.extname(f.name).toLowerCase();
                if (['.jpg', '.jpeg', '.png'].includes(ext)) {
                    const filePath = path.join(absolutePath, f.name);
                    const fileStats = await fs.stat(filePath);
                    imageFiles.push({
                        name: f.name,
                        path: filePath,
                        size: fileStats.size,
                        mtime: fileStats.mtimeMs
                    });
                }
            }
        }

        res.json({ 
            root: {
                name: path.basename(absolutePath) || absolutePath,
                path: absolutePath,
                hasImages: imageFiles.length > 0
            },
            folders: subfolders,
            files: imageFiles 
        });
    } catch (error) {
        console.error('扫描失败:', error);
        res.status(500).json({ error: '服务器内部错误' });
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
        const fileSet = new Set();
        const folderMap = {};
        const folderCompletedMap = {};

        for (const folderPath of selectedPaths) {
            if (fs.existsSync(folderPath)) {
                const files = await getAllImageFiles(folderPath);
                // 记录该文件夹下的图片数量（注意：这里依然包含可能被其他文件夹包含的图片，但在总进度中我们会去重）
                folderMap[folderPath] = files.length;
                folderCompletedMap[folderPath] = 0;
                
                files.forEach(f => fileSet.add(f));
            }
        }

        const allUniqueFiles = Array.from(fileSet);

        if (allUniqueFiles.length === 0) {
            return res.json({ message: '所选文件夹下没有发现图片', count: 0 });
        }

        // 初始化任务
        currentJob.files = allUniqueFiles;
        currentJob.folderMap = folderMap;
        currentJob.folderCompletedMap = folderCompletedMap;
        currentJob.selectedPaths = selectedPaths;
        currentJob.total = allUniqueFiles.length;
        currentJob.processedCount = 0;
        currentJob.completedCount = 0;
        currentJob.results = [];
        currentJob.status = 'running';
        currentJob.startTime = new Date();

        // 异步启动处理
        broadcast({ 
            type: 'status', 
            status: 'running', 
            message: '任务开始', 
            total: currentJob.total,
            current: 0
        });
        
        // 启动多个 worker 并行处理
        const workers = Array(currentJob.concurrency).fill(null).map(() => startWorker());
        Promise.all(workers).catch(err => console.error('Worker error:', err));

        res.json({ message: '任务已启动', count: allUniqueFiles.length });
    } catch (error) {
        console.error('启动任务失败:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

app.listen(port, () => {
    console.log(`服务器运行在 http://localhost:${port}`);
});

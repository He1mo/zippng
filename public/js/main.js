/**
 * 1. 配置与状态管理 (State & Config)
 */
const i18n = {
    zh: {
        title: 'Zipper',
        subtitle: '简单好用的本地图片压缩工具',
        pathPlaceholder: '在这里粘贴照片文件夹的地址，如 D:\\我的相册',
        scanBtn: '扫描目录',
        scanning: '正在扫描...',
        selectFolders: '选择目标文件夹',
        selectAll: '全选 / 取消',
        deselectAll: '取消全选',
        sortByName: '名称',
        sortByTime: '修改日期',
        safetyWarningTitle: '未开启备份',
        safetyWarningDesc: '压缩将直接覆盖原图，建议开启备份',
        safetySafeTitle: '备份已开启',
        safetySafeDesc: '原图将安全备份至 backup 文件夹',
        startBtn: '开始批量压缩',
        initializing: '准备处理...',
        optimizing: '正在优化图片...',
        processingComplete: '处理完成',
        pause: '暂停任务',
        resume: '继续任务',
        taskPaused: '任务已暂停',
        cancel: '取消任务',
        close: '关闭进度',
        logHeader: '处理日志',
        successTitle: '压缩任务已完成',
        processedCount: '成功处理了 {count} 个文件',
        tableFile: '文件名',
        tableOriginal: '原大小',
        tableOptimized: '压缩后',
        tableStatus: '状态',
        tableSuccess: '成功',
        tableError: '失败',
        checkLog: '更多结果请查看上方日志',
        initLog: '正在初始化 {count} 个文件夹的优化任务...',
        cancelConfirm: '确定要取消当前任务吗？',
        networkError: '网络错误',
        optimized: '已优化',
        failed: '失败',
        cancelled: '任务已手动取消'
    },
    en: {
        title: 'Zipper',
        subtitle: 'Simple local image compression tool',
        pathPlaceholder: 'Paste folder address here, e.g. D:\\My Photos',
        scanBtn: 'Scan Folders',
        scanning: 'Scanning...',
        selectFolders: 'Select Target Folders',
        selectAll: 'Select All',
        deselectAll: 'Deselect All',
        sortByName: 'Name',
        sortByTime: 'Modified',
        safetyWarningTitle: 'Backup Disabled',
        safetyWarningDesc: 'Originals will be overwritten. Backup recommended.',
        safetySafeTitle: 'Backup Enabled',
        safetySafeDesc: 'Originals will be saved to "backup" folder',
        startBtn: 'Start Compression',
        initializing: 'Initializing...',
        optimizing: 'Optimizing Images...',
        processingComplete: 'Processing Complete',
        pause: 'Pause',
        resume: 'Resume',
        taskPaused: 'Task Paused',
        cancel: 'Cancel',
        close: 'Close',
        logHeader: 'Activity Log',
        successTitle: 'Optimization Successful',
        processedCount: 'Processed {count} files successfully',
        tableFile: 'File',
        tableOriginal: 'Original',
        tableOptimized: 'Optimized',
        tableStatus: 'Result',
        tableSuccess: 'Success',
        tableError: 'Error',
        checkLog: 'Check activity log for full details',
        initLog: 'Initializing optimization for {count} folders...',
        cancelConfirm: 'Cancel current task?',
        networkError: 'Network error',
        optimized: 'Optimized',
        failed: 'Failed',
        cancelled: 'Task cancelled by user'
    }
};

const AppState = {
    lang: localStorage.getItem('lang') || 'zh',
    theme: localStorage.getItem('theme') || 'dark',
    currentRootPath: '',
    currentItems: [],
    selectedPaths: [],
    sortConfig: { key: 'name', direction: 'asc' },
    eventSource: null,
    reconnectAttempts: 0,
    maxReconnectAttempts: 5
};

document.addEventListener('DOMContentLoaded', () => {
    /**
     * 2. DOM 元素缓存
     */
    const UI = {
        folderPath: document.getElementById('folderPath'),
        scanBtn: document.getElementById('scanBtn'),
        backupCheckbox: document.getElementById('backupCheckbox'),
        folderTree: document.getElementById('folderTree'),
        folderList: document.getElementById('folderList'),
        selectAllCheckbox: document.getElementById('selectAllCheckbox'),
        compressBtn: document.getElementById('compressBtn'),
        phaseScan: document.getElementById('phase-scan'),
        phaseWork: document.getElementById('phase-work'),
        phaseResult: document.getElementById('phase-result'),
        progressBarFill: document.getElementById('progressBarFill'),
        progressStats: document.getElementById('progressStats'),
        logContainer: document.getElementById('logContainer'),
        breadcrumbNav: document.getElementById('breadcrumbNav'),
        statusText: document.getElementById('statusText'),
        pauseBtn: document.getElementById('pauseBtn'),
        resumeBtn: document.getElementById('resumeBtn'),
        cancelBtn: document.getElementById('cancelBtn'),
        safetyPanel: document.getElementById('safetyPanel'),
        safetyIcon: document.getElementById('safetyIcon'),
        safetyTitle: document.getElementById('safetyTitle'),
        safetyDesc: document.getElementById('safetyDesc'),
        selectionStats: document.getElementById('selectionStats'),
        resultTableContainer: document.getElementById('resultTableContainer'),
        resultSummary: document.getElementById('resultSummary'),
        themeToggle: document.getElementById('themeToggle'),
        sortName: document.getElementById('sortName'),
        sortSize: document.getElementById('sortSize'),
        sortTime: document.getElementById('sortTime'),
        backBtn: document.getElementById('backBtn')
    };

    /**
     * 3. 工具函数
     */
    function formatSize(bytes) {
        if (bytes === undefined || bytes === null || isNaN(bytes) || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        if (i < 0) return '0 B';
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * 4. UI 更新逻辑 (UI Components)
     */
    function updateI18n() {
        const data = i18n[AppState.lang];
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (data[key]) el.textContent = data[key];
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (data[key]) el.placeholder = data[key];
        });
        document.querySelectorAll('.lang-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-lang') === AppState.lang);
        });
        updateSafetyUI();
    }

    function updateSafetyUI() {
        const data = i18n[AppState.lang];
        
        if (UI.backupCheckbox.checked) {
            UI.safetyPanel.classList.add('is-safe');
            UI.safetyIcon.textContent = '🛡️';
            UI.safetyTitle.textContent = data.safetySafeTitle;
            UI.safetyDesc.textContent = data.safetySafeDesc;
        } else {
            UI.safetyPanel.classList.remove('is-safe');
            UI.safetyIcon.textContent = '⚠️';
            UI.safetyTitle.textContent = data.safetyWarningTitle;
            UI.safetyDesc.textContent = data.safetyWarningDesc;
        }
    }

    function switchPhase(phaseId) {
        [UI.phaseScan, UI.phaseWork, UI.phaseResult].forEach(p => p.classList.remove('phase-active'));
        document.getElementById(phaseId).classList.add('phase-active');
    }

    /**
     * 渲染项目列表（资源管理器风格）
     */
    function renderFolderList(items = AppState.currentItems) {
        UI.folderList.innerHTML = '';
        
        // 动态检测模式
        const hasFolders = items.some(item => item.type === 'folder');
        const treeContainer = document.querySelector('.tree-container');
        
        // 切换容器 Class
        if (hasFolders) {
            treeContainer.classList.add('view-folders');
            treeContainer.classList.remove('view-photos');
        } else {
            treeContainer.classList.add('view-photos');
            treeContainer.classList.remove('view-folders');
        }

        // 动态生成表头
        const headerContainer = document.querySelector('.folder-header');
        if (hasFolders) {
            headerContainer.innerHTML = `
                <div class="col-check">
                    <label class="checkbox-wrapper">
                        <input type="checkbox" id="selectAllCheckbox">
                        <span class="checkmark"></span>
                    </label>
                </div>
                <div class="col-main sortable" id="sortName">
                    <div class="header-icon-placeholder"></div>
                    <span data-i18n="sortByName">名称</span>
                    <span class="sort-icon"></span>
                </div>
                <div class="col-count">
                    <span>图片数量</span>
                </div>
                <div class="col-size sortable" id="sortSize">
                    <span data-i18n="tableOriginal">大小</span>
                    <span class="sort-icon"></span>
                </div>
                <div class="col-date sortable" id="sortTime">
                    <span data-i18n="sortByTime">修改日期</span>
                    <span class="sort-icon"></span>
                </div>
            `;
        } else {
            headerContainer.innerHTML = `
                <div class="col-check">
                    <label class="checkbox-wrapper">
                        <input type="checkbox" id="selectAllCheckbox">
                        <span class="checkmark"></span>
                    </label>
                </div>
                <div class="col-main sortable" id="sortName">
                    <div class="header-icon-placeholder"></div>
                    <span data-i18n="sortByName">名称</span>
                    <span class="sort-icon"></span>
                </div>
                <div class="col-size sortable" id="sortSize">
                    <span data-i18n="tableOriginal">大小</span>
                    <span class="sort-icon"></span>
                </div>
                <div class="col-date sortable" id="sortTime">
                    <span data-i18n="sortByTime">修改日期</span>
                    <span class="sort-icon"></span>
                </div>
            `;
        }

        // 重新绑定全选事件（因为表头是新生成的）
        const selectAll = document.getElementById('selectAllCheckbox');
        if (selectAll) {
            // 更新全选框状态
            const allSelected = items.length > 0 && items.every(item => AppState.selectedPaths.includes(item.path));
            selectAll.checked = allSelected;

            selectAll.onchange = (e) => {
                const checked = e.target.checked;
                items.forEach(item => {
                    const isSelected = AppState.selectedPaths.includes(item.path);
                    if (checked && !isSelected) {
                        toggleSelection(item.path);
                    } else if (!checked && isSelected) {
                        toggleSelection(item.path);
                    }
                });
                // 同步更新列表中的复选框 UI
                const listCheckboxes = UI.folderList.querySelectorAll('input[type="checkbox"]');
                listCheckboxes.forEach(cb => {
                    cb.checked = checked;
                    const row = cb.closest('.folder-item');
                    if (row) row.classList.toggle('selected', checked);
                });
            };
        }

        // 重新绑定排序事件
        ['sortName', 'sortSize', 'sortTime'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.onclick = () => {
                    const key = getSortKeyById(id);
                    if (AppState.sortConfig.key === key) {
                        AppState.sortConfig.direction = AppState.sortConfig.direction === 'asc' ? 'desc' : 'asc';
                    } else {
                        AppState.sortConfig.key = key;
                        AppState.sortConfig.direction = 'asc';
                    }
                    renderFolderList(AppState.currentItems);
                };
            }
        });

        if (AppState.sortConfig.key) {
            items.sort((a, b) => {
                let valA = a[AppState.sortConfig.key];
                let valB = b[AppState.sortConfig.key];
                
                // 文件夹始终排在文件前面（资源管理器习惯）
                if (a.type !== b.type) {
                    return a.type === 'folder' ? -1 : 1;
                }

                if (typeof valA === 'string') {
                    return AppState.sortConfig.direction === 'asc' 
                        ? valA.localeCompare(valB) 
                        : valB.localeCompare(valA);
                } else {
                    return AppState.sortConfig.direction === 'asc' 
                        ? valA - valB 
                        : valB - valA;
                }
            });
        }

        items.forEach(item => renderItem(item));
        updateSortIcons();
    }

    /**
     * 渲染单个项目（文件或文件夹）
     */
    function renderItem(item) {
        const div = document.createElement('div');
        div.className = `folder-item ${item.type}-item`;
        if (AppState.selectedPaths.includes(item.path)) {
            div.classList.add('selected');
        }
        
        const isFolder = item.type === 'folder';
        const thumbUrl = (!isFolder && item.thumbnail) ? `/thumbnail?imgPath=${encodeURIComponent(item.thumbnail)}` : null;
        
        const iconHtml = thumbUrl 
            ? `<img src="${thumbUrl}" class="img-thumb" onload="this.classList.add('loaded')" onerror="this.style.display='none'">` 
            : (isFolder ? '📂' : '📄');

        const displayPath = isFolder ? '' : './';

        const hasFolders = AppState.currentItems.some(item => item.type === 'folder');

        div.innerHTML = `
            <div class="col-check">
                <label class="checkbox-wrapper">
                    <input type="checkbox" value="${item.path}" ${AppState.selectedPaths.includes(item.path) ? 'checked' : ''}>
                    <span class="checkmark"></span>
                </label>
            </div>
            <div class="col-main">
                <div class="item-icon">${iconHtml}</div>
                <div class="folder-name">${item.name}</div>
            </div>
            ${hasFolders ? `<div class="col-count">${isFolder ? `${item.imageCount} 张图片` : ''}</div>` : ''}
            <div class="col-size">
                <div class="size-main">${formatSize(item.size)}</div>
            </div>
            <div class="col-date">${item.mtime ? new Date(item.mtime).toLocaleString() : '-'}</div>
        `;

        // 点击行逻辑
        div.onclick = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.closest('.checkbox-wrapper')) {
                return;
            }

            if (isFolder) {
                UI.folderPath.value = item.path;
                UI.scanBtn.click();
            } else {
                const cb = div.querySelector('input');
                cb.checked = !cb.checked;
                toggleSelection(item.path);
            }
        };

        div.querySelector('input').onchange = () => toggleSelection(item.path);
        UI.folderList.appendChild(div);
    }

    function renderBreadcrumbs() {
        if (!AppState.currentRootPath) return;
        
        UI.breadcrumbNav.innerHTML = '';
        const path = AppState.currentRootPath;
        // 兼容 Windows 和 Unix 路径
        const parts = path.split(/[\\\/]/).filter(p => p);
        const isWindows = path.includes(':');
        
        // 添加根目录（如果是 Windows 则显示盘符，否则显示根 /）
        let currentPath = isWindows ? '' : '/';
        
        // 根项
        const rootItem = document.createElement('div');
        rootItem.className = 'breadcrumb-item';
        rootItem.innerHTML = `<span class="breadcrumb-icon">🏠</span> ${isWindows ? '此电脑' : '根目录'}`;
        rootItem.onclick = () => {
            UI.folderPath.value = isWindows ? '' : '/';
            UI.scanBtn.click();
        };
        UI.breadcrumbNav.appendChild(rootItem);

        parts.forEach((part, index) => {
            // 分隔符
            const sep = document.createElement('span');
            sep.className = 'breadcrumb-separator';
            sep.textContent = '›';
            UI.breadcrumbNav.appendChild(sep);

            // 路径累加
            if (isWindows && index === 0) {
                currentPath = part + '\\';
            } else {
                currentPath += (currentPath.endsWith('\\') || currentPath.endsWith('/') ? '' : (isWindows ? '\\' : '/')) + part;
            }

            const item = document.createElement('div');
            item.className = 'breadcrumb-item';
            if (index === parts.length - 1) item.classList.add('active');
            item.textContent = part;
            
            const targetPath = currentPath;
            item.onclick = () => {
                if (index < parts.length - 1) {
                    UI.folderPath.value = targetPath;
                    UI.scanBtn.click();
                }
            };
            UI.breadcrumbNav.appendChild(item);
        });

        // 自动滚动到最右侧
        UI.breadcrumbNav.scrollLeft = UI.breadcrumbNav.scrollWidth;
    }

    function updateSortIcons() {
        [UI.sortName, UI.sortSize, UI.sortTime].forEach(el => {
            const icon = el.querySelector('.sort-icon');
            el.classList.remove('active');
            icon.className = 'sort-icon';
            
            const key = getSortKeyById(el.id);
            if (key === AppState.sortConfig.key) {
                el.classList.add('active');
                icon.classList.add(AppState.sortConfig.direction === 'asc' ? 'asc' : 'desc');
            }
        });
    }

    function getSortKeyById(id) {
        if (id === 'sortName') return 'name';
        if (id === 'sortSize') return 'size';
        if (id === 'sortTime') return 'mtime';
        return null;
    }

    function addLog(message, type = 'info') {
        const div = document.createElement('div');
        div.className = 'log-entry';
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        div.innerHTML = `<span class="log-time">${time}</span><span class="log-msg-${type}">${message}</span>`;
        UI.logContainer.appendChild(div);
        
        // 自动滚动到底部
        UI.logContainer.scrollTop = UI.logContainer.scrollHeight;
    }

    function toggleSelection(path) {
        const index = AppState.selectedPaths.indexOf(path);
        if (index > -1) {
            AppState.selectedPaths.splice(index, 1);
        } else {
            AppState.selectedPaths.push(path);
        }
        
        // 更新 UI 样式
        const items = UI.folderList.querySelectorAll('.folder-item');
        items.forEach(item => {
            const cb = item.querySelector('input');
            if (cb.value === path) {
                item.classList.toggle('selected', cb.checked);
            }
        });
        
        updateSelectionStats();
    }

    function updateSelectionStats() {
        const selectedCount = UI.folderList.querySelectorAll('input:checked').length;
        if (selectedCount > 0) {
            UI.selectionStats.classList.remove('hidden-element');
            UI.selectionStats.textContent = AppState.lang === 'zh' ? `已选择 ${selectedCount} 项` : `Selected ${selectedCount} items`;
        } else {
            UI.selectionStats.classList.add('hidden-element');
        }
    }

    /**
     * 4. 业务逻辑 (Core Services)
     */
    const ApiService = {
        async scan(folderPath) {
            const res = await fetch('/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folderPath })
            });
            if (!res.ok) throw new Error(await res.text());
            return res.json();
        },
        async startCompress(payload) {
            const res = await fetch('/compress', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            return res.json();
        },
        async jobAction(action) {
            return fetch(`/job/${action}`, { method: 'POST' }).then(r => r.json());
        }
    };

    const SSEManager = {
        connect() {
            if (AppState.eventSource) AppState.eventSource.close();
            
            AppState.eventSource = new EventSource('/progress');
            
            AppState.eventSource.onmessage = (e) => {
                const data = JSON.parse(e.data);
                this.handleMessage(data);
            };

            AppState.eventSource.onerror = () => {
                console.error('SSE Connection failed');
                if (AppState.reconnectAttempts < AppState.maxReconnectAttempts) {
                    AppState.reconnectAttempts++;
                    setTimeout(() => this.connect(), 2000 * AppState.reconnectAttempts);
                }
            };
        },
        handleMessage(data) {
            switch(data.type) {
                case 'progress':
                    UI.progressBarFill.style.width = `${data.percent}%`;
                    UI.progressStats.textContent = `${data.current} / ${data.total} (${data.percent}%)`;
                    break;
                case 'log':
                    addLog(data.message);
                    break;
                case 'status':
                    this.handleStatusChange(data);
                    break;
            }
        },
        handleStatusChange(data) {
            if (data.status === 'completed') {
                switchPhase('phase-result');
                renderResults(data.results);
            } else if (data.status === 'paused') {
                UI.statusText.textContent = i18n[AppState.lang].taskPaused;
                UI.pauseBtn.style.display = 'none';
                UI.resumeBtn.style.display = 'inline-block';
            } else if (data.status === 'running') {
                UI.statusText.textContent = i18n[AppState.lang].optimizing;
                UI.pauseBtn.style.display = 'inline-block';
                UI.resumeBtn.style.display = 'none';
            }
        }
    };

    function renderResults(results) {
        const successCount = results.filter(r => r.success).length;
        UI.resultSummary.textContent = i18n[AppState.lang].processedCount.replace('{count}', successCount);
        
        let html = `
            <div class="result-list view-photos">
                <div class="folder-header">
                    <div class="col-check"></div>
                    <div class="col-main">
                        <div class="header-icon-placeholder"></div>
                        <span>${i18n[AppState.lang].tableFile}</span>
                    </div>
                    <div class="col-size">${i18n[AppState.lang].tableOriginal}</div>
                    <div class="col-date">${i18n[AppState.lang].tableOptimized}</div>
                </div>
                <div class="result-body">
        `;
        
        results.forEach(res => {
            const isSuccess = res.success;
            const thumbUrl = `/thumbnail?imgPath=${encodeURIComponent(res.fullPath)}`;
            
            html += `
                <div class="folder-item">
                    <div class="col-check">
                        <span class="status-icon ${isSuccess ? 'success' : 'error'}">
                            ${isSuccess ? '✓' : '✗'}
                        </span>
                    </div>
                    <div class="col-main">
                        <div class="item-icon">
                            <img src="${thumbUrl}" alt="" onerror="this.innerHTML='📄'; this.src='';">
                        </div>
                        <div class="folder-name">${res.file}</div>
                    </div>
                    <div class="col-size">${res.originalSize}</div>
                    <div class="col-date">
                        <span class="size-main" style="color: ${isSuccess ? 'var(--ios-green)' : 'var(--ios-red)'}; font-size: ${isSuccess ? '14px' : '11px'}">
                            ${isSuccess ? (res.optimizedSize || '-') : (res.error || '失败')}
                        </span>
                    </div>
                </div>
            `;
        });
        
        html += `</div></div>`;
        UI.resultTableContainer.innerHTML = html;
    }

    /**
     * 5. 事件监听 (Event Listeners)
     */
    UI.scanBtn.onclick = async () => {
        const path = UI.folderPath.value.trim();
        if (!path) return;

        try {
            UI.scanBtn.disabled = true;
            UI.scanBtn.textContent = i18n[AppState.lang].scanning;
            
            const data = await ApiService.scan(path);
            AppState.currentRootPath = data.rootPath;
            AppState.currentItems = data.items;
            
            // 扫描新目录时，重置选择
            AppState.selectedPaths = [];
            UI.selectAllCheckbox.checked = false;
            updateSelectionStats();

            UI.folderTree.classList.remove('hidden-element');
            renderBreadcrumbs();
            renderFolderList();
            
            // 同步输入框
            UI.folderPath.value = data.rootPath;
        } catch (err) {
            addLog(`Scan error: ${err.message}`, 'error');
            alert(`Scan failed: ${err.message}`);
        } finally {
            UI.scanBtn.disabled = false;
            UI.scanBtn.textContent = i18n[AppState.lang].scanBtn;
        }
    };

    UI.compressBtn.onclick = async () => {
        const selected = Array.from(UI.folderList.querySelectorAll('input:checked')).map(i => i.value);
        if (!selected.length) return;
        
        switchPhase('phase-work');
        UI.logContainer.innerHTML = '';
        addLog(i18n[AppState.lang].initLog.replace('{count}', selected.length), 'info');
        SSEManager.connect();
        
        await ApiService.startCompress({
            selectedPaths: selected,
            doBackup: UI.backupCheckbox.checked,
            rootPath: AppState.currentRootPath
        });
    };

    UI.pauseBtn.onclick = () => ApiService.jobAction('pause');
    UI.resumeBtn.onclick = () => ApiService.jobAction('resume');
    UI.cancelBtn.onclick = () => {
        if (confirm(i18n[AppState.lang].cancelConfirm)) {
            ApiService.jobAction('cancel');
            location.reload();
        }
    };
    
    UI.backupCheckbox.onchange = updateSafetyUI;

    UI.backBtn.onclick = () => {
        const currentPath = UI.folderPath.value.trim();
        if (!currentPath) return;
        
        // 获取父目录
        const parts = currentPath.split(/[\\\/]/).filter(p => p);
        if (parts.length <= 1) return; // 已经是根目录（如 C:\）

        // 处理 Windows 盘符
        let parentPath = '';
        if (currentPath.includes(':')) {
            parentPath = parts.slice(0, -1).join('\\');
            if (!parentPath.includes('\\')) parentPath += '\\';
        } else {
            parentPath = '/' + parts.slice(0, -1).join('/');
        }

        UI.folderPath.value = parentPath;
        UI.scanBtn.click();
    };

    // 绑定排序点击事件
    [UI.sortName, UI.sortSize, UI.sortTime].forEach(el => {
        el.onclick = () => {
            const key = getSortKeyById(el.id);
            if (AppState.sortConfig.key === key) {
                AppState.sortConfig.direction = AppState.sortConfig.direction === 'asc' ? 'desc' : 'asc';
            } else {
                AppState.sortConfig.key = key;
                AppState.sortConfig.direction = 'asc';
            }
            renderFolderList();
        };
    });

    UI.selectAllCheckbox.onchange = (e) => {
        const isChecked = e.target.checked;
        const checkboxes = UI.folderList.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(i => {
            i.checked = isChecked;
            const path = i.value;
            const index = AppState.selectedPaths.indexOf(path);
            if (isChecked && index === -1) {
                AppState.selectedPaths.push(path);
            } else if (!isChecked && index > -1) {
                AppState.selectedPaths.splice(index, 1);
            }
            
            // 同时更新行样式
            const item = i.closest('.folder-item');
            if (item) item.classList.toggle('selected', isChecked);
        });
        updateSelectionStats();
    };

    // 排序点击处理
    const handleSort = (key) => {
        if (AppState.sortConfig.key === key) {
            AppState.sortConfig.direction = AppState.sortConfig.direction === 'asc' ? 'desc' : 'asc';
        } else {
            AppState.sortConfig.key = key;
            AppState.sortConfig.direction = 'asc';
        }
        renderFolderList();
    };

    UI.sortName.onclick = () => handleSort('name');
    UI.sortSize.onclick = () => handleSort('size');
    UI.sortTime.onclick = () => handleSort('mtime');

    UI.themeToggle.onclick = () => {
        document.documentElement.classList.toggle('light-mode');
        AppState.theme = document.documentElement.classList.contains('light-mode') ? 'light' : 'dark';
        localStorage.setItem('theme', AppState.theme);
    };

    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.onclick = () => {
            AppState.lang = btn.dataset.lang;
            localStorage.setItem('lang', AppState.lang);
            updateI18n();
        };
    });

    // 初始化
    if (AppState.theme === 'light') document.documentElement.classList.add('light-mode');
    updateI18n();
});

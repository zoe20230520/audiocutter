/**
 * 本地音频剪辑器 - 主应用逻辑
 */

class AudioCutterApp {
    constructor() {
        this.processor = new AudioProcessor();
        this.wavesurfer = null;
        this.files = [];
        this.results = [];
        this.currentFile = null;
        this.currentBuffer = null;

        this.init();
    }

    init() {
        this.initElements();
        this.initWaveform();
        this.bindEvents();
        this.bindKeyboardShortcuts();
        this.updateUI();
    }

    initElements() {
        // 获取DOM元素
        this.elements = {
            uploadArea: document.getElementById('uploadArea'),
            fileInput: document.getElementById('fileInput'),
            fileList: document.getElementById('fileList'),
            clearBtn: document.getElementById('clearBtn'),
            startTime: document.getElementById('startTime'),
            endTime: document.getElementById('endTime'),
            selectedDuration: document.getElementById('selectedDuration'),
            totalDuration: document.getElementById('totalDuration'),
            playBtn: document.getElementById('playBtn'),
            pauseBtn: document.getElementById('pauseBtn'),
            playSelectionBtn: document.getElementById('playSelectionBtn'),
            resetRegionBtn: document.getElementById('resetRegionBtn'),
            zoomIn: document.getElementById('zoomIn'),
            zoomOut: document.getElementById('zoomOut'),
            trimBtn: document.getElementById('trimBtn'),
            clearRegionBtn: document.getElementById('clearRegionBtn'),
            outputFormat: document.getElementById('outputFormat'),
            resultsList: document.getElementById('resultsList'),
            downloadAllBtn: document.getElementById('downloadAllBtn'),
            keepFormat: document.getElementById('keepFormat'),
            editorSection: document.getElementById('editorSection'),
            resultsSection: document.getElementById('resultsSection'),
            fileListSection: document.getElementById('fileListSection'),
            enableFade: document.getElementById('enableFade'),
            fadeOptions: document.getElementById('fadeOptions'),
            fadeIn: document.getElementById('fadeIn'),
            fadeOut: document.getElementById('fadeOut'),
            normalizeAudio: document.getElementById('normalizeAudio'),
            volumeSlider: document.getElementById('volumeSlider'),
            volumeValue: document.getElementById('volumeValue'),
            batchTrimBtn: document.getElementById('batchTrimBtn')
        };

        // 验证关键元素是否存在
        if (!this.elements.uploadArea || !this.elements.fileInput) {
            console.error('关键元素未找到!');
        }
    }

    initWaveform() {
        this.wavesurfer = WaveSurfer.create({
            container: '#waveform',
            waveColor: '#4361ee',
            progressColor: '#3a0ca3',
            cursorColor: '#ff0000',
            cursorWidth: 3,
            barWidth: 3,
            barGap: 2,
            barRadius: 3,
            responsive: true,
            height: 150,
            normalize: true,
            backend: 'WebAudio',
            pixelRatio: 1,
            scrollParent: false,
            minPxPerSec: 50,
            fillParent: true,
            hideScrollbar: false,
            skipLength: 2,
            forceDecode: false,
            interact: true,
            hideScrollbar: false,
            plugins: [
                WaveSurfer.regions.create({
                    regions: [],
                    dragSelection: {
                        slop: 5
                    }
                })
            ]
        });

        // 监听波形准备就绪
        this.wavesurfer.on('ready', () => {
            const duration = this.wavesurfer.getDuration();
            this.elements.totalDuration.textContent = `总时长: ${this.formatTime(duration)}`;
            // 初始选区覆盖整个音频
            this.elements.endTime.value = this.formatInputTime(duration);
            this.updateSelectionDuration();
            
            // 创建初始选区 - 从开始到结束
            this.createInitialRegion(duration);
            
            // 强制显示cursor
            this.ensureCursorVisible();
            
            // 隐藏加载提示
            this.hideLoadingMessage();
        });

        // 监听加载进度
        this.wavesurfer.on('loading', (percent) => {
            if (percent < 100) {
                this.showLoadingMessage(`加载中... ${percent}%`);
            }
        });

        // 监听选区更新
        this.wavesurfer.on('region-update-end', (region) => {
            this.elements.startTime.value = this.formatInputTime(region.start);
            this.elements.endTime.value = this.formatInputTime(region.end);
            this.updateSelectionDuration();
        });

        // 监听选区创建
        this.wavesurfer.on('region-created', (region) => {
            // 删除旧选区，只保留最新的
            const regions = Object.values(this.wavesurfer.regions.list);
            if (regions.length > 1) {
                regions.forEach((r, index) => {
                    if (index < regions.length - 1) {
                        r.remove();
                    }
                });
            }
            
            // 记录活动选区
            this.activeRegion = region;
            
            // 更新时间显示
            this.elements.startTime.value = this.formatInputTime(region.start);
            this.elements.endTime.value = this.formatInputTime(region.end);
            this.updateSelectionDuration();
        });

        // 监听波形点击 - 移动播放指针
        this.wavesurfer.on('seek', (progress) => {
            const time = progress * this.wavesurfer.getDuration();
            this.updateCursorPosition(time);
            console.log('跳转到:', time);
        });

        // 监听播放进度
        this.wavesurfer.on('audioprocess', (time) => {
            if (this.wavesurfer.isPlaying()) {
                // 更新cursor位置
                this.updateCursorPosition(time);
            }
        });

        // 监听播放结束
        this.wavesurfer.on('finish', () => {
            console.log('播放完成');
        });

        // 监听错误
        this.wavesurfer.on('error', (error) => {
            console.error('WaveSurfer 错误:', error);
        });
    }

    bindEvents() {
        // 文件上传 - 点击上传区域
        this.elements.uploadArea.addEventListener('click', () => {
            this.elements.fileInput.click();
        });

        // 拖拽上传
        this.elements.uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.elements.uploadArea.style.background = 'rgba(67, 97, 238, 0.15)';
        });

        this.elements.uploadArea.addEventListener('dragleave', () => {
            this.elements.uploadArea.style.background = '';
        });

        this.elements.uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            this.elements.uploadArea.style.background = '';
            this.handleFiles(e.dataTransfer.files);
        });

        // 文件选择
        this.elements.fileInput.addEventListener('change', (e) => {
            this.handleFiles(e.target.files);
            // 重置 input 以允许选择相同文件
            e.target.value = '';
        });

        // 清空列表
        this.elements.clearBtn.addEventListener('click', () => {
            this.files = [];
            this.currentFile = null;
            this.currentBuffer = null;
            this.wavesurfer.empty();
            this.updateUI();
        });

        // 播放控制
        this.elements.playBtn.addEventListener('click', () => {
            if (this.wavesurfer) {
                // 如果有选区，从选区开始位置播放
                if (this.activeRegion) {
                    const start = this.activeRegion.start;
                    const end = this.activeRegion.end;
                    // 先跳转到选区开始位置
                    this.wavesurfer.seekTo(start / this.wavesurfer.getDuration());
                    // 播放选区
                    this.wavesurfer.play(start, end);
                } else {
                    // 从当前位置播放到结束
                    this.wavesurfer.play();
                }
            }
        });

        this.elements.pauseBtn.addEventListener('click', () => {
            if (this.wavesurfer) {
                this.wavesurfer.pause();
            }
        });

        this.elements.playSelectionBtn.addEventListener('click', () => {
            this.playSelection();
        });

        // 重置选区
        this.elements.resetRegionBtn.addEventListener('click', () => {
            this.resetRegion();
        });

        // 清除选区
        this.elements.clearRegionBtn.addEventListener('click', () => {
            this.clearRegion();
        });

        // 缩放控制
        this.elements.zoomIn.addEventListener('click', () => {
            if (this.wavesurfer) {
                const currentZoom = this.wavesurfer.params.minPxPerSec || 50;
                this.wavesurfer.zoom(currentZoom * 1.5);
            }
        });

        this.elements.zoomOut.addEventListener('click', () => {
            if (this.wavesurfer) {
                const currentZoom = this.wavesurfer.params.minPxPerSec || 50;
                this.wavesurfer.zoom(Math.max(10, currentZoom / 1.5));
            }
        });

        // 时间输入
        this.elements.startTime.addEventListener('change', () => {
            this.updateSelectionFromInput();
        });

        this.elements.endTime.addEventListener('change', () => {
            this.updateSelectionFromInput();
        });

        // 裁剪按钮
        this.elements.trimBtn.addEventListener('click', () => {
            this.trimAudio();
        });

        // 打包下载
        this.elements.downloadAllBtn.addEventListener('click', () => {
            this.downloadAll();
        });

        // 淡入淡出选项
        this.elements.enableFade.addEventListener('change', () => {
            this.elements.fadeOptions.style.display = 
                this.elements.enableFade.checked ? 'block' : 'none';
        });

        // 音量滑块控制
        this.elements.volumeSlider.addEventListener('input', (e) => {
            const volume = e.target.value;
            this.elements.volumeValue.textContent = volume + '%';
            
            // 实时调节播放音量
            if (this.wavesurfer) {
                this.wavesurfer.setVolume(volume / 100);
            }
        });

        // 批量裁剪
        this.elements.batchTrimBtn.addEventListener('click', () => {
            this.batchTrim();
        });

        // 选区拖拽
        this.setupSelectionHandles();
    }

    bindKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // 避免在输入框中触发快捷键
            if (e.target.tagName === 'INPUT' && e.key !== 'Enter') return;

            switch(e.key) {
                case ' ': // 空格 - 播放/暂停
                    e.preventDefault();
                    if (this.wavesurfer && this.currentBuffer) {
                        if (this.wavesurfer.isPlaying()) {
                            this.wavesurfer.pause();
                        } else {
                            this.wavesurfer.play();
                        }
                    }
                    break;

                case 's': // Ctrl+S - 开始裁剪
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        if (this.currentBuffer && !this.elements.trimBtn.disabled) {
                            this.trimAudio();
                        }
                    }
                    break;
            }
        });
    }

    async handleFiles(fileList) {
        if (!fileList || fileList.length === 0) {
            return;
        }

        const newFiles = Array.from(fileList);

        for (const file of newFiles) {
            
            // 检查文件类型
            if (!file.type.startsWith('audio/') && !file.name.match(/\.(mp3|wav|ogg|flac|aac|m4a)$/i)) {
                alert(`文件 "${file.name}" 不是支持的音频格式`);
                continue;
            }

            // 检查文件大小（限制为100MB）
            if (file.size > 100 * 1024 * 1024) {
                alert(`文件 "${file.name}" 过大，请选择小于100MB的文件`);
                continue;
            }

            this.files.push({
                file,
                id: Date.now() + Math.random(),
                name: file.name,
                size: this.formatFileSize(file.size),
                url: URL.createObjectURL(file)
            });
        }

        // 加载第一个文件
        if (this.files.length > 0 && !this.currentFile) {
            await this.loadFile(this.files[0]);
        }

        this.updateUI();
    }

    async loadFile(fileObj) {
        try {
            this.currentFile = fileObj;

            // 显示加载提示
            this.showLoadingMessage('正在加载音频...');
            
            // 先清空之前的波形
            if (this.wavesurfer) {
                this.wavesurfer.empty();
            }

            // 加载音频
            this.currentBuffer = await this.processor.loadAudioFile(fileObj.file);

            // 加载波形
            this.wavesurfer.load(fileObj.url);

            this.updateUI();
        } catch (error) {
            console.error('加载文件失败:', error);
            this.hideLoadingMessage();
            alert(`加载文件失败: ${error.message}`);
        }
    }

    showLoadingMessage(message) {
        // 创建加载提示
        let loadingDiv = document.getElementById('loadingMessage');
        if (!loadingDiv) {
            loadingDiv = document.createElement('div');
            loadingDiv.id = 'loadingMessage';
            loadingDiv.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0, 0, 0, 0.85);
                color: white;
                padding: 2rem 3rem;
                border-radius: 12px;
                z-index: 10000;
                text-align: center;
                font-size: 1.2rem;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                min-width: 200px;
            `;
            document.body.appendChild(loadingDiv);
        }
        loadingDiv.innerHTML = `
            <i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 1rem; display: block;"></i>
            <div>${message}</div>
        `;
        loadingDiv.style.display = 'block';
    }

    hideLoadingMessage() {
        const loadingDiv = document.getElementById('loadingMessage');
        if (loadingDiv) {
            loadingDiv.style.display = 'none';
        }
    }

    updateUI() {
        // 更新文件列表
        this.elements.fileList.innerHTML = '';

        this.files.forEach((fileObj, index) => {
            const fileItem = this.createFileItem(fileObj, index);
            this.elements.fileList.appendChild(fileItem);
        });

        // 显示/隐藏编辑器
        if (this.currentFile) {
            this.elements.editorSection.style.display = 'block';
        } else {
            this.elements.editorSection.style.display = 'none';
        }

        // 显示/隐藏文件列表区域
        if (this.files.length > 0) {
            this.elements.fileListSection.style.display = 'block';
            // 显示批量裁剪按钮(如果有多个文件)
            this.elements.batchTrimBtn.style.display = 
                this.files.length > 1 ? 'inline-flex' : 'none';
        } else {
            this.elements.fileListSection.style.display = 'none';
            this.elements.batchTrimBtn.style.display = 'none';
        }

        // 显示/隐藏结果区域
        if (this.results.length > 0) {
            this.elements.resultsSection.style.display = 'block';
        } else {
            this.elements.resultsSection.style.display = 'none';
        }
    }

    createFileItem(fileObj, index) {
        const div = document.createElement('div');
        div.className = 'file-item';
        
        // 判断是否是当前文件
        const isActive = this.currentFile === fileObj;

        div.innerHTML = `
            <div class="file-info">
                <i class="fas fa-file-audio file-icon" style="${isActive ? 'color: var(--primary-color);' : ''}"></i>
                <div class="file-details">
                    <h4 style="${isActive ? 'color: var(--primary-color); font-weight: bold;' : ''}">
                        ${fileObj.name} ${isActive ? '<i class="fas fa-play-circle" style="font-size: 0.9rem;"></i>' : ''}
                    </h4>
                    <div class="file-size">${fileObj.size}</div>
                </div>
            </div>
            <div class="file-actions">
                <button class="btn btn-small ${isActive ? 'btn-primary' : ''}" data-action="load" data-index="${index}" title="加载到编辑器">
                    <i class="fas ${isActive ? 'fa-check' : 'fa-edit'}"></i>
                </button>
                <button class="btn btn-small btn-secondary" data-action="remove" data-index="${index}" title="从列表中移除">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

        // 添加事件监听
        div.querySelector('[data-action="load"]').addEventListener('click', () => {
            this.loadFile(fileObj);
        });

        div.querySelector('[data-action="remove"]').addEventListener('click', () => {
            this.files.splice(index, 1);
            URL.revokeObjectURL(fileObj.url);

            if (this.currentFile === fileObj) {
                this.currentFile = this.files[0] || null;
                if (this.currentFile) {
                    this.loadFile(this.currentFile);
                } else {
                    this.wavesurfer.empty();
                    this.currentBuffer = null;
                }
            }

            this.updateUI();
        });

        return div;
    }

    createInitialRegion(endTime) {
        // 创建默认选区
        if (this.wavesurfer && this.wavesurfer.regions) {
            this.activeRegion = this.wavesurfer.addRegion({
                start: 0,
                end: endTime,
                color: 'rgba(67, 97, 238, 0.15)',
                drag: true,
                resize: true,
                loop: false
            });
            console.log('创建初始选区:', 0, '-', endTime);
        }
    }

    ensureCursorVisible() {
        // 强制创建和显示cursor元素
        setTimeout(() => {
            const waveElement = document.querySelector('wave');
            if (waveElement) {
                // 检查是否已有cursor
                let cursor = waveElement.querySelector('cursor');
                if (!cursor) {
                    // 手动创建cursor
                    cursor = document.createElement('cursor');
                    cursor.style.position = 'absolute';
                    cursor.style.zIndex = '999';
                    cursor.style.backgroundColor = '#ff0000';
                    cursor.style.width = '3px';
                    cursor.style.height = '100%';
                    cursor.style.top = '0';
                    cursor.style.left = '0';
                    cursor.style.pointerEvents = 'none';
                    waveElement.appendChild(cursor);
                    console.log('手动创建cursor');
                } else {
                    // 确保cursor可见
                    cursor.style.backgroundColor = '#ff0000';
                    cursor.style.width = '3px';
                    cursor.style.zIndex = '999';
                    cursor.style.opacity = '1';
                    console.log('cursor已存在,强制样式');
                }
            }
        }, 100);
    }

    updateCursorPosition(time) {
        // 更新自定义cursor的位置
        const cursor = document.querySelector('wave cursor');
        if (cursor && this.wavesurfer) {
            const duration = this.wavesurfer.getDuration();
            const progress = time / duration;
            const waveElement = document.querySelector('wave');
            if (waveElement) {
                const width = waveElement.offsetWidth;
                const left = progress * width;
                cursor.style.left = left + 'px';
            }
        }
    }
    
    setupSelectionHandles() {
        // 选区功能通过 WaveSurfer Regions 插件实现
    }

    updateSelectionFromInput() {
        const start = this.processor.timeToSeconds(this.elements.startTime.value);
        const end = this.processor.timeToSeconds(this.elements.endTime.value);
        const duration = this.wavesurfer ? this.wavesurfer.getDuration() : 0;

        if (start >= 0 && end > start && end <= duration) {
            // 更新选区
            if (this.activeRegion) {
                this.activeRegion.update({
                    start: start,
                    end: end
                });
            } else if (this.wavesurfer && this.wavesurfer.regions) {
                // 如果没有选区，创建一个
                this.activeRegion = this.wavesurfer.addRegion({
                    start: start,
                    end: end,
                    color: 'rgba(67, 97, 238, 0.15)',
                    drag: true,
                    resize: true,
                    loop: false
                });
            }
            
            // 更新显示
            this.updateSelectionDuration();
        }
    }

    updateSelectionDuration() {
        const start = this.processor.timeToSeconds(this.elements.startTime.value);
        const end = this.processor.timeToSeconds(this.elements.endTime.value);
        const duration = end - start;

        if (duration > 0) {
            this.elements.selectedDuration.textContent = `选中: ${this.formatTime(duration)}`;
        }
    }

    resetRegion() {
        if (!this.wavesurfer) return;
        
        const duration = this.wavesurfer.getDuration();
        
        // 更新时间输入框 - 重置到整个音频
        this.elements.startTime.value = this.formatInputTime(0);
        this.elements.endTime.value = this.formatInputTime(duration);
        
        // 更新选区
        if (this.activeRegion) {
            this.activeRegion.update({
                start: 0,
                end: duration
            });
        } else {
            this.createInitialRegion(duration);
        }
        
        this.updateSelectionDuration();
    }

    clearRegion() {
        if (!this.wavesurfer || !this.wavesurfer.regions) return;
        
        // 清除所有选区
        this.wavesurfer.clearRegions();
        this.activeRegion = null;
        
        // 重置时间显示
        this.elements.startTime.value = '00:00.000';
        this.elements.endTime.value = '00:00.000';
        this.elements.selectedDuration.textContent = '选中: 0:00.000';
    }

    async playSelection() {
        if (!this.wavesurfer) return;

        const start = this.processor.timeToSeconds(this.elements.startTime.value);
        const end = this.processor.timeToSeconds(this.elements.endTime.value);

        if (start >= 0 && end > start) {
            // 先跳转到选区开始位置，让指针可见
            this.wavesurfer.seekTo(start / this.wavesurfer.getDuration());
            // 延迟一下确保指针已经移动
            setTimeout(() => {
                // 使用 WaveSurfer 的播放区间功能
                this.wavesurfer.play(start, end);
            }, 100);
        }
    }

    async trimAudio() {
        if (!this.currentBuffer || !this.currentFile) {
            alert('请先加载音频文件');
            return;
        }

        try {
            const start = this.processor.timeToSeconds(this.elements.startTime.value);
            const end = this.processor.timeToSeconds(this.elements.endTime.value);
            const totalDuration = this.currentBuffer.duration;

            // 验证时间
            if (start < 0 || end > totalDuration || start >= end) {
                alert('请选择有效的时间范围');
                return;
            }

            // 显示加载状态
            this.elements.trimBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 裁剪中...';
            this.elements.trimBtn.disabled = true;

            // 裁剪音频
            let trimmedBuffer = await this.processor.trimAudio(
                this.currentBuffer,
                start,
                end
            );

            // 应用淡入淡出效果
            if (this.elements.enableFade.checked) {
                const fadeIn = parseFloat(this.elements.fadeIn.value) || 0;
                const fadeOut = parseFloat(this.elements.fadeOut.value) || 0;
                trimmedBuffer = this.processor.applyFade(trimmedBuffer, fadeIn, fadeOut);
            }

            // 应用音量调节
            const volumePercent = parseInt(this.elements.volumeSlider.value);
            if (volumePercent !== 100) {
                const gain = volumePercent / 100;
                trimmedBuffer = this.processor.applyGain(trimmedBuffer, gain);
            }

            // 应用音量标准化
            if (this.elements.normalizeAudio.checked) {
                trimmedBuffer = this.processor.normalize(trimmedBuffer);
            }

            // 生成文件名
            const originalName = this.currentFile.name.replace(/\.[^/.]+$/, '');
            const format = this.elements.keepFormat.checked ?
                this.currentFile.file.type.split('/')[1] || 'wav' :
                this.elements.outputFormat.value;

            const fileName = `trim_${originalName}_${this.formatTime(start)}-${this.formatTime(end)}.${format}`;

            // 转换为WAV Blob（注意：这里只生成WAV，其他格式需要更复杂的编码）
            const audioBlob = this.processor.bufferToWav(trimmedBuffer);

            // 添加到结果列表
            const result = {
                id: Date.now() + Math.random(),
                name: fileName,
                blob: audioBlob,
                size: this.formatFileSize(audioBlob.size),
                duration: this.formatTime(end - start),
                format: format
            };

            this.results.push(result);
            this.addResultToUI(result);

            // 更新UI
            this.elements.trimBtn.innerHTML = '<i class="fas fa-cut"></i> 开始裁剪';
            this.elements.trimBtn.disabled = false;

            this.updateUI();

            // 自动下载
            this.downloadResult(result);

        } catch (error) {
            console.error('裁剪失败:', error);
            alert(`裁剪失败: ${error.message}`);

            this.elements.trimBtn.innerHTML = '<i class="fas fa-cut"></i> 开始裁剪';
            this.elements.trimBtn.disabled = false;
        }
    }

    addResultToUI(result) {
        const div = document.createElement('div');
        div.className = 'result-item';
        div.id = `result-${result.id}`;

        div.innerHTML = `
            <div class="result-info">
                <i class="fas fa-music"></i>
                <div class="result-details">
                    <h4>${result.name}</h4>
                    <div>${result.size} · ${result.duration} · ${result.format.toUpperCase()}</div>
                </div>
            </div>
            <div class="result-actions">
                <button class="btn btn-small" data-action="download" data-id="${result.id}">
                    <i class="fas fa-download"></i> 下载
                </button>
                <button class="btn btn-small btn-secondary" data-action="remove" data-id="${result.id}">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;

        // 添加事件监听
        div.querySelector('[data-action="download"]').addEventListener('click', () => {
            this.downloadResult(result);
        });

        div.querySelector('[data-action="remove"]').addEventListener('click', () => {
            this.removeResult(result.id);
        });

        this.elements.resultsList.appendChild(div);
    }

    downloadResult(result) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(result.blob);
        link.download = result.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // 清理URL对象
        setTimeout(() => URL.revokeObjectURL(link.href), 100);
    }

    async downloadAll() {
        if (this.results.length === 0) {
            alert('没有可下载的文件');
            return;
        }

        try {
            this.elements.downloadAllBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 打包中...';
            this.elements.downloadAllBtn.disabled = true;

            const zip = new JSZip();

            // 添加所有结果文件到ZIP
            for (const result of this.results) {
                zip.file(result.name, result.blob);
            }

            // 生成ZIP文件
            const content = await zip.generateAsync({ type: 'blob' });

            // 下载ZIP文件
            saveAs(content, `audio_cutter_results_${Date.now()}.zip`);

        } catch (error) {
            console.error('打包失败:', error);
            alert('打包下载失败');
        } finally {
            this.elements.downloadAllBtn.innerHTML = '<i class="fas fa-file-archive"></i> 打包下载 (ZIP)';
            this.elements.downloadAllBtn.disabled = false;
        }
    }

    removeResult(resultId) {
        const index = this.results.findIndex(r => r.id === resultId);
        if (index !== -1) {
            this.results.splice(index, 1);

            const element = document.getElementById(`result-${resultId}`);
            if (element) {
                element.remove();
            }

            this.updateUI();
        }
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = (seconds % 60).toFixed(2);
        return `${mins}:${secs.padStart(5, '0')}`;
    }

    formatInputTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = (seconds % 60).toFixed(3);
        return `${mins.toString().padStart(2, '0')}:${secs.padStart(6, '0')}`;
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';

        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * 批量裁剪所有文件
     */
    async batchTrim() {
        if (this.files.length === 0) {
            alert('没有可裁剪的文件');
            return;
        }

        const start = this.processor.timeToSeconds(this.elements.startTime.value);
        const end = this.processor.timeToSeconds(this.elements.endTime.value);

        if (start < 0 || start >= end) {
            alert('请设置有效的裁剪时间');
            return;
        }

        const confirmed = confirm(`将对 ${this.files.length} 个文件执行批量裁剪

开始时间: ${this.elements.startTime.value}
结束时间: ${this.elements.endTime.value}

是否继续?`);
        
        if (!confirmed) return;

        // 禁用按钮
        this.elements.batchTrimBtn.disabled = true;
        this.elements.batchTrimBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 批量裁剪中...';

        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < this.files.length; i++) {
            try {
                const fileObj = this.files[i];
                
                // 更新进度
                this.elements.batchTrimBtn.innerHTML = 
                    `<i class="fas fa-spinner fa-spin"></i> 批量裁剪中 (${i + 1}/${this.files.length})...`;

                // 加载音频
                const buffer = await this.processor.loadAudioFile(fileObj.file);

                // 验证时间范围
                if (end > buffer.duration) {
                    console.warn(`文件 ${fileObj.name} 时长不足,跳过`);
                    failCount++;
                    continue;
                }

                // 裁剪音频
                let trimmedBuffer = await this.processor.trimAudio(buffer, start, end);

                // 应用效果
                if (this.elements.enableFade.checked) {
                    const fadeIn = parseFloat(this.elements.fadeIn.value) || 0;
                    const fadeOut = parseFloat(this.elements.fadeOut.value) || 0;
                    trimmedBuffer = this.processor.applyFade(trimmedBuffer, fadeIn, fadeOut);
                }

                if (this.elements.normalizeAudio.checked) {
                    trimmedBuffer = this.processor.normalize(trimmedBuffer);
                }

                // 生成文件
                const originalName = fileObj.name.replace(/\.[^/.]+$/, '');
                const format = this.elements.keepFormat.checked ?
                    fileObj.file.type.split('/')[1] || 'wav' :
                    this.elements.outputFormat.value;

                const fileName = `trim_${originalName}_${this.formatTime(start)}-${this.formatTime(end)}.${format}`;
                const audioBlob = this.processor.bufferToWav(trimmedBuffer);

                // 添加到结果
                const result = {
                    id: Date.now() + Math.random(),
                    name: fileName,
                    blob: audioBlob,
                    size: this.formatFileSize(audioBlob.size),
                    duration: this.formatTime(end - start),
                    format: format
                };

                this.results.push(result);
                this.addResultToUI(result);
                successCount++;

            } catch (error) {
                console.error(`裁剪文件 ${this.files[i].name} 失败:`, error);
                failCount++;
            }
        }

        // 恢复按钮状态
        this.elements.batchTrimBtn.disabled = false;
        this.elements.batchTrimBtn.innerHTML = '<i class="fas fa-cut"></i> 批量裁剪';

        // 显示结果
        alert(`批量裁剪完成!\n\n成功: ${successCount} 个\n失败: ${failCount} 个`);
        
        this.updateUI();
    }
}

// 初始化应用
window.addEventListener('DOMContentLoaded', () => {
    new AudioCutterApp();
});
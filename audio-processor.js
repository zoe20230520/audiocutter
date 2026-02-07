/**
 * 音频处理器 - 纯前端音频处理工具
 * 使用Web Audio API进行音频处理
 */

class AudioProcessor {
    constructor() {
        this.audioContext = null;
        this.offlineContext = null;
        this.currentBuffer = null;
        this.sourceNode = null;
        this.gainNode = null;
    }

    /**
     * 初始化音频上下文
     */
    init() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            // 创建增益节点用于音量控制
            this.gainNode = this.audioContext.createGain();
            this.gainNode.connect(this.audioContext.destination);
        }
    }

    /**
     * 加载音频文件
     * @param {File} file - 音频文件
     * @returns {Promise<AudioBuffer>} 音频缓冲区
     */
    async loadAudioFile(file) {
        this.init();

        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = async (e) => {
                try {
                    const audioData = e.target.result;
                    const buffer = await this.audioContext.decodeAudioData(audioData);
                    this.currentBuffer = buffer;
                    resolve(buffer);
                } catch (error) {
                    reject(new Error(`音频解码失败: ${error.message}`));
                }
            };

            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * 裁剪音频
     * @param {AudioBuffer} buffer - 音频缓冲区
     * @param {number} startTime - 开始时间(秒)
     * @param {number} endTime - 结束时间(秒)
     * @returns {Promise<AudioBuffer>} 裁剪后的音频缓冲区
     */
    async trimAudio(buffer, startTime, endTime) {
        const duration = endTime - startTime;
        const sampleRate = buffer.sampleRate;

        const startSample = Math.floor(startTime * sampleRate);
        const endSample = Math.floor(endTime * sampleRate);
        const frameCount = endSample - startSample;

        // 创建新的AudioBuffer
        const newBuffer = this.audioContext.createBuffer(
            buffer.numberOfChannels,
            frameCount,
            sampleRate
        );

        // 复制数据
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            const channelData = buffer.getChannelData(channel);
            const newChannelData = newBuffer.getChannelData(channel);

            for (let i = 0; i < frameCount; i++) {
                newChannelData[i] = channelData[startSample + i];
            }
        }

        return newBuffer;
    }

    /**
     * 音频缓冲区转换为WAV文件
     * @param {AudioBuffer} buffer - 音频缓冲区
     * @returns {Blob} WAV文件Blob
     */
    bufferToWav(buffer) {
        const numChannels = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const length = buffer.length;

        // 创建WAV文件头
        const wavHeader = this.createWavHeader(numChannels, sampleRate, length);

        // 合并声道数据
        const interleaved = this.interleave(buffer);

        // 转换为16位PCM
        const pcmData = this.floatTo16BitPCM(interleaved);

        // 合并WAV数据
        const wavData = new Uint8Array(wavHeader.length + pcmData.length);
        wavData.set(wavHeader, 0);
        wavData.set(pcmData, wavHeader.length);

        return new Blob([wavData], { type: 'audio/wav' });
    }

    /**
     * 创建WAV文件头
     */
    createWavHeader(numChannels, sampleRate, length) {
        const bitsPerSample = 16;
        const byteRate = sampleRate * numChannels * bitsPerSample / 8;
        const blockAlign = numChannels * bitsPerSample / 8;
        const dataSize = length * numChannels * bitsPerSample / 8;

        const buffer = new ArrayBuffer(44);
        const view = new DataView(buffer);

        // RIFF标识
        this.writeString(view, 0, 'RIFF');
        // 文件大小
        view.setUint32(4, 36 + dataSize, true);
        // WAVE标识
        this.writeString(view, 8, 'WAVE');
        // fmt子块
        this.writeString(view, 12, 'fmt ');
        // fmt子块大小
        view.setUint32(16, 16, true);
        // 音频格式（1表示PCM）
        view.setUint16(20, 1, true);
        // 声道数
        view.setUint16(22, numChannels, true);
        // 采样率
        view.setUint32(24, sampleRate, true);
        // 字节率
        view.setUint32(28, byteRate, true);
        // 块对齐
        view.setUint16(32, blockAlign, true);
        // 位深度
        view.setUint16(34, bitsPerSample, true);
        // data子块
        this.writeString(view, 36, 'data');
        // data子块大小
        view.setUint32(40, dataSize, true);

        return new Uint8Array(buffer);
    }

    /**
     * 写入字符串到DataView
     */
    writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    /**
     * 交错声道数据
     */
    interleave(buffer) {
        const numChannels = buffer.numberOfChannels;
        const length = buffer.length;
        const result = new Float32Array(length * numChannels);

        for (let channel = 0; channel < numChannels; channel++) {
            const channelData = buffer.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                result[i * numChannels + channel] = channelData[i];
            }
        }

        return result;
    }

    /**
     * 浮点数组转换为16位PCM
     */
    floatTo16BitPCM(floatArray) {
        const length = floatArray.length;
        const int16Array = new Int16Array(length);

        for (let i = 0; i < length; i++) {
            const s = Math.max(-1, Math.min(1, floatArray[i]));
            int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        return new Uint8Array(int16Array.buffer);
    }

    /**
     * 淡入淡出效果
     * @param {AudioBuffer} buffer - 音频缓冲区
     * @param {number} fadeInDuration - 淡入时长(秒)
     * @param {number} fadeOutDuration - 淡出时长(秒)
     * @returns {AudioBuffer} 处理后的音频缓冲区
     */
    applyFade(buffer, fadeInDuration = 0, fadeOutDuration = 0) {
        const sampleRate = buffer.sampleRate;
        const fadeInSamples = Math.floor(fadeInDuration * sampleRate);
        const fadeOutSamples = Math.floor(fadeOutDuration * sampleRate);
        
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            const channelData = buffer.getChannelData(channel);
            
            // 淡入
            for (let i = 0; i < fadeInSamples; i++) {
                channelData[i] *= i / fadeInSamples;
            }
            
            // 淡出
            const startFadeOut = buffer.length - fadeOutSamples;
            for (let i = 0; i < fadeOutSamples; i++) {
                const index = startFadeOut + i;
                channelData[index] *= 1 - (i / fadeOutSamples);
            }
        }
        
        return buffer;
    }

    /**
     * 音量调整
     * @param {AudioBuffer} buffer - 音频缓冲区
     * @param {number} gain - 增益值 (0-2, 1为原音量)
     * @returns {AudioBuffer} 处理后的音频缓冲区
     */
    applyGain(buffer, gain) {
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            const channelData = buffer.getChannelData(channel);
            for (let i = 0; i < buffer.length; i++) {
                channelData[i] *= gain;
            }
        }
        return buffer;
    }

    /**
     * 音频标准化(归一化)
     * @param {AudioBuffer} buffer - 音频缓冲区
     * @returns {AudioBuffer} 处理后的音频缓冲区
     */
    normalize(buffer) {
        let maxAmplitude = 0;
        
        // 找到最大振幅
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            const channelData = buffer.getChannelData(channel);
            for (let i = 0; i < buffer.length; i++) {
                maxAmplitude = Math.max(maxAmplitude, Math.abs(channelData[i]));
            }
        }
        
        // 如果最大振幅不为0,进行归一化
        if (maxAmplitude > 0 && maxAmplitude < 1) {
            const gain = 0.95 / maxAmplitude; // 留出5%余量避免削波
            return this.applyGain(buffer, gain);
        }
        
        return buffer;
    }

    /**
     * 时间字符串转换为秒数
     * @param {string} timeStr - 时间字符串 (HH:MM:SS.mmm 或 MM:SS.mmm)
     * @returns {number} 秒数
     */
    timeToSeconds(timeStr) {
        const parts = timeStr.split(':');
        let seconds = 0;

        if (parts.length === 3) {
            // HH:MM:SS.mmm
            seconds += parseFloat(parts[0]) * 3600;
            seconds += parseFloat(parts[1]) * 60;
            seconds += parseFloat(parts[2]);
        } else if (parts.length === 2) {
            // MM:SS.mmm
            seconds += parseFloat(parts[0]) * 60;
            seconds += parseFloat(parts[1]);
        } else if (parts.length === 1) {
            // SS.mmm
            seconds += parseFloat(parts[0]);
        }

        return isNaN(seconds) ? 0 : seconds;
    }

    /**
     * 秒数转换为时间字符串
     * @param {number} seconds - 秒数
     * @returns {string} 时间字符串 (MM:SS.mmm)
     */
    secondsToTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toFixed(3).padStart(6, '0')}`;
    }
}

// 导出为全局变量
window.AudioProcessor = AudioProcessor;
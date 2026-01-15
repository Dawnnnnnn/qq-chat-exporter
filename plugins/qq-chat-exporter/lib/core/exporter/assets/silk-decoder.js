/**
 * Silk V3 Audio Decoder for Browser
 * 用于在浏览器中解码 QQ 语音消息的 Silk V3 格式音频
 */

class SilkDecoder {
    constructor() {
        this.wasmModule = null;
        this.isInitialized = false;
        this.initPromise = null;
    }

    /**
     * 初始化 silk-wasm 模块
     */
    async init() {
        if (this.isInitialized) {
            return;
        }

        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = (async () => {
            try {
                // 使用 ES Module 动态导入 silk-wasm
                const silkModule = await import('https://cdn.jsdelivr.net/npm/silk-wasm@3.7.1/lib/index.mjs');

                this.wasmModule = silkModule;
                this.isInitialized = true;
                console.log('[SilkDecoder] Initialized successfully');
            } catch (error) {
                console.error('[SilkDecoder] Initialization failed:', error);
                throw error;
            }
        })();

        return this.initPromise;
    }

    /**
     * 检测文件是否为 Silk V3 格式
     * @param {ArrayBuffer} buffer - 音频文件数据
     * @returns {boolean}
     */
    isSilkV3(buffer) {
        const uint8Array = new Uint8Array(buffer);
        // Silk V3 文件头标识：#!SILK_V3
        const silkHeader = [0x23, 0x21, 0x53, 0x49, 0x4c, 0x4b, 0x5f, 0x56, 0x33];

        if (uint8Array.length < silkHeader.length) {
            return false;
        }

        for (let i = 0; i < silkHeader.length; i++) {
            if (uint8Array[i] !== silkHeader[i]) {
                return false;
            }
        }

        return true;
    }

    /**
     * 解码 Silk V3 音频为 PCM
     * @param {ArrayBuffer} silkData - Silk V3 音频数据
     * @returns {Promise<{pcm: ArrayBuffer, sampleRate: number}>}
     */
    async decode(silkData) {
        await this.init();

        if (!this.isSilkV3(silkData)) {
            throw new Error('Not a valid Silk V3 file');
        }

        try {
            // silk-wasm@3.7.1 API: decode(input, sampleRate)
            // input: Uint8Array, sampleRate: 目标采样率(可选)
            const uint8Data = new Uint8Array(silkData);
            const pcmData = await this.wasmModule.decode(uint8Data, 24000);

            return {
                pcm: pcmData.buffer,
                sampleRate: 24000
            };
        } catch (error) {
            console.error('[SilkDecoder] Decode failed:', error);
            throw error;
        }
    }

    /**
     * 将 PCM 数据转换为 WAV 格式
     * @param {ArrayBuffer} pcmData - PCM 音频数据
     * @param {number} sampleRate - 采样率
     * @returns {Blob}
     */
    pcmToWav(pcmData, sampleRate = 24000) {
        const pcm16 = new Int16Array(pcmData);
        const wavBuffer = new ArrayBuffer(44 + pcm16.length * 2);
        const view = new DataView(wavBuffer);

        // WAV 文件头
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };

        writeString(0, 'RIFF');
        view.setUint32(4, 36 + pcm16.length * 2, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true); // fmt chunk size
        view.setUint16(20, 1, true); // PCM format
        view.setUint16(22, 1, true); // mono
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true); // byte rate
        view.setUint16(32, 2, true); // block align
        view.setUint16(34, 16, true); // bits per sample
        writeString(36, 'data');
        view.setUint32(40, pcm16.length * 2, true);

        // PCM 数据
        const pcmView = new Int16Array(wavBuffer, 44);
        pcmView.set(pcm16);

        return new Blob([wavBuffer], { type: 'audio/wav' });
    }

    /**
     * 解码并转换为可播放的 WAV 格式
     * @param {ArrayBuffer} silkData - Silk V3 音频数据
     * @returns {Promise<Blob>}
     */
    async decodeToWav(silkData) {
        const { pcm, sampleRate } = await this.decode(silkData);
        return this.pcmToWav(pcm, sampleRate);
    }

    /**
     * 从 URL 加载并解码音频
     * @param {string} url - 音频文件 URL
     * @returns {Promise<Blob>}
     */
    async decodeFromUrl(url) {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        return this.decodeToWav(arrayBuffer);
    }
}

// 全局实例
window.silkDecoder = new SilkDecoder();

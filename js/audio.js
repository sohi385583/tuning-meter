/**
 * Web Audio API コンテキストとノード管理モジュール
 */

class AudioManager {
    constructor() {
        this.audioCtx = null;
        this.analyser = null;
        this.mediaStream = null;
        this.sourceNode = null;
        this.biquadFilter = null;
        this.masterGain = null;
        this.isMuted = false;
        this.isListening = false;
    }

    /**
     * AudioContext の初期化（ユーザー操作トリガー時）
     */
    async init() {
        if (!this.audioCtx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioCtx = new AudioContext({ latencyHint: 'interactive' });
            
            // マスターゲイン
            this.masterGain = this.audioCtx.createGain();
            this.masterGain.gain.setValueAtTime(1.0, this.audioCtx.currentTime);
            this.masterGain.connect(this.audioCtx.destination);
        }

        if (this.audioCtx.state === 'suspended') {
            await this.audioCtx.resume();
        }
    }

    /**
     * マイク入力の開始
     */
    async startMicrophone() {
        await this.init();

        if (this.isListening) return true;

        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    autoGainControl: false,
                    noiseSuppression: false,
                    latency: 0
                }
            });

            this.sourceNode = this.audioCtx.createMediaStreamSource(this.mediaStream);

            // フルート・ピッコロ用バンドパスフィルター (息の超低域ノイズをカット)
            this.biquadFilter = this.audioCtx.createBiquadFilter();
            this.biquadFilter.type = 'highpass';
            this.biquadFilter.frequency.setValueAtTime(150, this.audioCtx.currentTime); // 150Hz以下をカット

            // AnalyserNode
            this.analyser = this.audioCtx.createAnalyser();
            this.analyser.fftSize = 2048; // 高分解能
            this.analyser.smoothingTimeConstant = 0.8;

            // 接続
            this.sourceNode.connect(this.biquadFilter);
            this.biquadFilter.connect(this.analyser);
            // ※マイク音声はスピーカーには出力しない（ハウリング防止）

            this.isListening = true;
            return true;
        } catch (err) {
            console.error("Microphone access failed:", err);
            throw err;
        }
    }

    /**
     * マイク入力の停止
     */
    stopMicrophone() {
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
        if (this.sourceNode) {
            this.sourceNode.disconnect();
            this.sourceNode = null;
        }
        this.isListening = false;
    }

    /**
     * 時間領域データ（波形）の取得
     */
    getTimeDomainData(buffer) {
        if (this.analyser) {
            this.analyser.getFloatTimeDomainData(buffer);
        }
    }

    /**
     * マスターミュート切り替え
     */
    toggleMute() {
        if (!this.masterGain || !this.audioCtx) return false;
        this.isMuted = !this.isMuted;
        const now = this.audioCtx.currentTime;
        this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 1.0, now);
        return this.isMuted;
    }
}

export const audioManager = new AudioManager();


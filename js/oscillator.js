/**
 * オシレーター（基準音ジェネレーター）＆サウンドバック（追従発音）モジュール
 */
import { audioManager } from './audio.js';

class OscillatorController {
    constructor() {
        this.osc = null;
        this.gainNode = null;
        this.isPlaying = false;
        this.waveType = 'sine';
        this.frequency = 442.0;
        this.volume = 0.3;

        // サウンドバック専用プロパティ
        this.sbOsc = null;
        this.sbGain = null;
        this.isSoundBackActive = false;
        this.sbVolume = 0.4;
        this.sbWaveType = 'sine';
        this.sbReleaseTime = 0.3;
        this.sbMuteTimer = null;
        this.lastFollowedFreq = null;
    }

    /**
     * 通常オシレーターの開始
     */
    async startTone(freq = this.frequency, wave = this.waveType) {
        await audioManager.init();
        const ctx = audioManager.audioCtx;

        if (this.isPlaying) {
            this.setFrequency(freq);
            this.setWaveType(wave);
            return;
        }

        this.osc = ctx.createOscillator();
        this.gainNode = ctx.createGain();

        this.osc.type = wave;
        this.osc.frequency.setValueAtTime(freq, ctx.currentTime);

        // クリックノイズ防止: 0からスムーズに立ち上げ
        const now = ctx.currentTime;
        this.gainNode.gain.setValueAtTime(0, now);
        this.gainNode.gain.linearRampToValueAtTime(this.volume, now + 0.05);

        this.osc.connect(this.gainNode);
        this.gainNode.connect(audioManager.masterGain);

        this.osc.start();
        this.isPlaying = true;
        this.frequency = freq;
        this.waveType = wave;
    }

    /**
     * 通常オシレーターの停止
     */
    stopTone() {
        if (!this.isPlaying || !this.osc) return;

        const ctx = audioManager.audioCtx;
        const now = ctx.currentTime;

        // フェードアウト
        this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
        this.gainNode.gain.linearRampToValueAtTime(0, now + 0.05);

        setTimeout(() => {
            if (this.osc) {
                try {
                    this.osc.stop();
                    this.osc.disconnect();
                } catch (e) {}
                this.osc = null;
            }
            this.isPlaying = false;
        }, 60);
    }

    /**
     * 通常オシレーターの周波数変更（ポルタメント遷移）
     */
    setFrequency(freq) {
        this.frequency = freq;
        if (this.isPlaying && this.osc && audioManager.audioCtx) {
            const ctx = audioManager.audioCtx;
            this.osc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.02);
        }
    }

    setWaveType(wave) {
        this.waveType = wave;
        if (this.isPlaying && this.osc) {
            this.osc.type = wave;
        }
    }

    setVolume(vol) {
        this.volume = vol;
        if (this.isPlaying && this.gainNode && audioManager.audioCtx) {
            const ctx = audioManager.audioCtx;
            this.gainNode.gain.setTargetAtTime(vol, ctx.currentTime, 0.02);
        }
    }

    // ==========================================
    // サウンドバック（Sound-Back / 自動追従発音）機能
    // ==========================================

    /**
     * サウンドバック用の常駐ノード準備
     */
    async initSoundBack() {
        await audioManager.init();
        const ctx = audioManager.audioCtx;

        if (!this.sbOsc) {
            this.sbOsc = ctx.createOscillator();
            this.sbGain = ctx.createGain();

            this.sbOsc.type = this.sbWaveType;
            this.sbOsc.frequency.setValueAtTime(442.0, ctx.currentTime);

            // 初期音量は0
            this.sbGain.gain.setValueAtTime(0, ctx.currentTime);

            this.sbOsc.connect(this.sbGain);
            this.sbGain.connect(audioManager.masterGain);

            this.sbOsc.start();
        }
    }

    /**
     * 検出ピッチにリアルタイム追従発音
     * @param {number} targetFreq - 追従させる周波数（平均律目標または実測周波数）
     */
    followPitch(targetFreq) {
        if (!this.isSoundBackActive || !targetFreq || targetFreq <= 0) return;

        const ctx = audioManager.audioCtx;
        if (!ctx || !this.sbOsc) return;

        // ミュートタイマー解除
        if (this.sbMuteTimer) {
            clearTimeout(this.sbMuteTimer);
            this.sbMuteTimer = null;
        }

        const now = ctx.currentTime;

        // 周波数をスムーズに追従（ポルタメント遷移 0.03s）
        this.sbOsc.frequency.setTargetAtTime(targetFreq, now, 0.03);
        this.lastFollowedFreq = targetFreq;

        // 音量をターゲット値へフェードイン
        this.sbGain.gain.setTargetAtTime(this.sbVolume, now, 0.04);
    }

    /**
     * 演奏が止まったときの自動消音（リリースタイマー）
     */
    releaseSoundBack() {
        if (!this.isSoundBackActive || !this.sbGain || !audioManager.audioCtx) return;

        if (this.sbMuteTimer) return; // 既にタイマー設定中

        this.sbMuteTimer = setTimeout(() => {
            if (audioManager.audioCtx && this.sbGain) {
                const now = audioManager.audioCtx.currentTime;
                // 滑らかにフェードアウト
                this.sbGain.gain.setTargetAtTime(0, now, 0.06);
            }
            this.sbMuteTimer = null;
            this.lastFollowedFreq = null;
        }, this.sbReleaseTime * 1000);
    }

    /**
     * サウンドバックのON/OFF切り替え
     */
    async toggleSoundBack(enable) {
        this.isSoundBackActive = enable;
        if (enable) {
            await this.initSoundBack();
        } else {
            if (this.sbGain && audioManager.audioCtx) {
                this.sbGain.gain.setValueAtTime(0, audioManager.audioCtx.currentTime);
            }
            if (this.sbMuteTimer) {
                clearTimeout(this.sbMuteTimer);
                this.sbMuteTimer = null;
            }
        }
    }

    setSoundBackVolume(vol) {
        this.sbVolume = vol;
    }

    setSoundBackWaveType(wave) {
        this.sbWaveType = wave;
        if (this.sbOsc) {
            this.sbOsc.type = wave;
        }
    }

    setSoundBackRelease(timeSec) {
        this.sbReleaseTime = timeSec;
    }
}

export const oscController = new OscillatorController();


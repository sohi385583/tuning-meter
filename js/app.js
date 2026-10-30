/**
 * メインアプリケーションコントローラー
 */
import { audioManager } from './audio.js';
import { autoCorrelate, getNoteDetails, midiNoteToFreq } from './pitch.js';
import { oscController } from './oscillator.js';
import { MeterRenderer } from './meter.js';

// DOM要素の取得
const micToggleBtn = document.getElementById('micToggleBtn');
const micIcon = document.getElementById('micIcon');
const audioMuteBtn = document.getElementById('audioMuteBtn');

const instrumentPreset = document.getElementById('instrumentPreset');
const basePitchInput = document.getElementById('basePitchInput');
const set442Btn = document.getElementById('set442Btn');
const set440Btn = document.getElementById('set440Btn');
const noiseGateSlider = document.getElementById('noiseGateSlider');
const noiseGateValue = document.getElementById('noiseGateValue');

const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

const soundBackBanner = document.getElementById('soundBackBanner');
const soundBackStatusDot = document.getElementById('soundBackStatusDot');
const soundBackStatusText = document.getElementById('soundBackStatusText');
const soundBackModeSelect = document.getElementById('soundBackModeSelect');
const soundBackGainSlider = document.getElementById('soundBackGainSlider');
const sbVolText = document.getElementById('sbVolText');
const soundBackWaveType = document.getElementById('soundBackWaveType');
const soundBackReleaseSlider = document.getElementById('soundBackReleaseSlider');
const sbReleaseText = document.getElementById('sbReleaseText');

const mainDisplayCard = document.getElementById('mainDisplayCard');
const noteLetter = document.getElementById('noteLetter');
const noteAccidental = document.getElementById('noteAccidental');
const noteOctave = document.getElementById('noteOctave');
const detectedFreqEl = document.getElementById('detectedFreq');
const targetFreqEl = document.getElementById('targetFreq');
const centDiffEl = document.getElementById('centDiff');
const centReadout = document.getElementById('centReadout');

// オシレーター要素
const oscPlayBtn = document.getElementById('oscPlayBtn');
const oscWaveType = document.getElementById('oscWaveType');
const oscGainSlider = document.getElementById('oscGainSlider');
const oscVolText = document.getElementById('oscVolText');
const oscFreqDirect = document.getElementById('oscFreqDirect');
const keyOctaveSelect = document.getElementById('keyOctaveSelect');
const pianoKeys = document.querySelectorAll('.key-btn');
const presetPills = document.querySelectorAll('.pill-btn');

// レンダラー
const renderer = new MeterRenderer('meterCanvas', 'oscilloscopeCanvas');

// 内部状態
let currentTab = 'tabTuner';
let basePitch = 442.0;
let noiseThreshold = 0.01;
let currentPreset = 'flute';

// 楽器プリセット別周波数レンジ (MinHz, MaxHz)
const PRESET_RANGES = {
    flute: { min: 230, max: 2500 },       // B3 (246.9Hz) 〜 D7 (2349Hz)
    piccolo: { min: 550, max: 4500 },     // D5 (587Hz) 〜 C8 (4186Hz)
    chromatic: { min: 30, max: 4500 },    // C1 〜 C8
    guitar: { min: 70, max: 400 },        // E2 〜 E4
    bass: { min: 35, max: 250 }           // E1 〜 G2
};

let audioBuffer = new Float32Array(2048);
let animationFrameId = null;

/**
 * 初期化処理
 */
function init() {
    setupEventListeners();
    setupKeyboard();
    startRenderLoop();
}

/**
 * イベントリスナー登録
 */
function setupEventListeners() {
    // マイク開始/停止
    micToggleBtn.addEventListener('click', async () => {
        if (!audioManager.isListening) {
            try {
                await audioManager.startMicrophone();
                micToggleBtn.classList.remove('btn-primary');
                micToggleBtn.classList.add('btn-danger');
                micToggleBtn.innerHTML = '<span>⏹</span> マイク停止';
            } catch (err) {
                alert('マイクへのアクセスが拒否されたか、デバイスが見つかりません。');
            }
        } else {
            audioManager.stopMicrophone();
            micToggleBtn.classList.remove('btn-danger');
            micToggleBtn.classList.add('btn-primary');
            micToggleBtn.innerHTML = '<span id="micIcon">🎤</span> マイク開始';
            resetPitchDisplay();
        }
    });

    // ミュートボタン
    audioMuteBtn.addEventListener('click', () => {
        const isMuted = audioManager.toggleMute();
        audioMuteBtn.innerHTML = isMuted ? '<span>🔇</span> ミュート中' : '<span>🔊</span> 音量ミュート';
        audioMuteBtn.classList.toggle('active', isMuted);
    });

    // 基準ピッチ設定
    basePitchInput.addEventListener('change', (e) => {
        basePitch = parseFloat(e.target.value) || 442;
    });
    set442Btn.addEventListener('click', () => {
        basePitch = 442;
        basePitchInput.value = 442;
    });
    set440Btn.addEventListener('click', () => {
        basePitch = 440;
        basePitchInput.value = 440;
    });

    // 楽器プリセット変更
    instrumentPreset.addEventListener('change', (e) => {
        currentPreset = e.target.value;
    });

    // ノイズゲート
    noiseGateSlider.addEventListener('input', (e) => {
        noiseThreshold = parseFloat(e.target.value);
        noiseGateValue.textContent = (noiseThreshold * 100).toFixed(1) + '%';
    });

    // タブ切り替え
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            currentTab = targetTab;

            tabButtons.forEach(b => b.classList.remove('active'));
            tabPanels.forEach(p => p.classList.remove('active'));

            btn.classList.add('active');
            document.getElementById(targetTab).classList.add('active');

            // サウンドバックモードの連動設定
            const isSoundBack = targetTab === 'tabSoundBack';
            soundBackBanner.style.display = isSoundBack ? 'flex' : 'none';
            oscController.toggleSoundBack(isSoundBack);
        });
    });

    // サウンドバック設定
    soundBackGainSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        oscController.setSoundBackVolume(val);
        sbVolText.textContent = Math.round(val * 100) + '%';
    });
    soundBackWaveType.addEventListener('change', (e) => {
        oscController.setSoundBackWaveType(e.target.value);
    });
    soundBackReleaseSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        oscController.setSoundBackRelease(val);
        sbReleaseText.textContent = val.toFixed(1) + ' 秒';
    });

    // オシレーター制御
    oscPlayBtn.addEventListener('click', () => {
        if (!oscController.isPlaying) {
            const freq = parseFloat(oscFreqDirect.value) || basePitch;
            oscController.startTone(freq, oscWaveType.value);
            oscPlayBtn.textContent = '⏹ 停止';
            oscPlayBtn.classList.remove('btn-primary');
            oscPlayBtn.classList.add('btn-danger');
        } else {
            oscController.stopTone();
            oscPlayBtn.textContent = '▶ 基準音を発振';
            oscPlayBtn.classList.remove('btn-danger');
            oscPlayBtn.classList.add('btn-primary');
        }
    });

    oscWaveType.addEventListener('change', (e) => {
        oscController.setWaveType(e.target.value);
    });

    oscGainSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        oscController.setVolume(val);
        oscVolText.textContent = Math.round(val * 100) + '%';
    });

    oscFreqDirect.addEventListener('input', (e) => {
        const freq = parseFloat(e.target.value);
        if (freq > 0) {
            oscController.setFrequency(freq);
        }
    });

    // プリセットピル
    presetPills.forEach(pill => {
        pill.addEventListener('click', () => {
            const freq = parseFloat(pill.getAttribute('data-freq'));
            oscFreqDirect.value = freq.toFixed(1);
            if (oscController.isPlaying) {
                oscController.setFrequency(freq);
            }
        });
    });
}

/**
 * ピアノキーボードのセットアップ
 */
function setupKeyboard() {
    pianoKeys.forEach(key => {
        key.addEventListener('click', () => {
            const semitone = parseInt(key.getAttribute('data-semitone'));
            const octave = parseInt(keyOctaveSelect.value);
            const midiNote = (octave + 1) * 12 + semitone;
            const freq = midiNoteToFreq(midiNote, basePitch);

            oscFreqDirect.value = freq.toFixed(2);
            oscController.startTone(freq, oscWaveType.value);

            oscPlayBtn.textContent = '⏹ 停止';
            oscPlayBtn.classList.remove('btn-primary');
            oscPlayBtn.classList.add('btn-danger');

            pianoKeys.forEach(k => k.classList.remove('active'));
            key.classList.add('active');
        });
    });
}

/**
 * ピッチ検出＆メイン描画ループ
 */
function startRenderLoop() {
    function loop() {
        if (audioManager.isListening && audioManager.analyser) {
            audioManager.getTimeDomainData(audioBuffer);

            // 楽器プリセットレンジ取得
            const range = PRESET_RANGES[currentPreset] || PRESET_RANGES.chromatic;
            const detectedPitch = autoCorrelate(
                audioBuffer,
                audioManager.audioCtx.sampleRate,
                range.min,
                range.max,
                noiseThreshold
            );

            if (detectedPitch) {
                const noteInfo = getNoteDetails(detectedPitch, basePitch);
                updatePitchDisplay(noteInfo);

                // サウンドバックモード動作中なら自動追従
                if (currentTab === 'tabSoundBack') {
                    const sbMode = soundBackModeSelect.value;
                    const followTarget = (sbMode === 'nearest') ? noteInfo.targetFreq : detectedPitch;
                    oscController.followPitch(followTarget);

                    soundBackStatusDot.classList.add('active');
                    soundBackStatusText.textContent = `追従中: ${noteInfo.fullName} (${followTarget.toFixed(1)} Hz)`;
                }
            } else {
                // 入力なし
                if (currentTab === 'tabSoundBack') {
                    oscController.releaseSoundBack();
                    soundBackStatusDot.classList.remove('active');
                    soundBackStatusText.textContent = 'サウンドバック待機中 (音を吹いてください)';
                }
                renderer.drawMeter(null, false);
            }

            // オシロスコープ波形描画
            renderer.drawOscilloscope(audioBuffer);
        } else {
            renderer.drawMeter(null, false);
            renderer.drawOscilloscope(null);
        }

        animationFrameId = requestAnimationFrame(loop);
    }

    loop();
}

/**
 * UIディスプレイの更新
 */
function updatePitchDisplay(info) {
    if (!info) return;

    noteLetter.textContent = info.letter;
    noteAccidental.textContent = info.accidental;
    noteOctave.textContent = info.octave;

    detectedFreqEl.textContent = info.detectedFreq.toFixed(1);
    targetFreqEl.textContent = info.targetFreq.toFixed(1);

    const sign = info.cent > 0 ? '+' : '';
    centDiffEl.textContent = `${sign}${info.cent}`;

    // セント読み上げ
    centReadout.textContent = `${sign}${info.cent} cent`;
    centReadout.className = 'cent-display ' + (info.inTune ? 'in-tune' : (info.cent < 0 ? 'flat' : 'sharp'));

    // In Tune カード発光エフェクト
    mainDisplayCard.classList.toggle('in-tune-glow', info.inTune);

    // メーター針描画
    renderer.drawMeter(info.cent, info.inTune);
}

function resetPitchDisplay() {
    noteLetter.textContent = '-';
    noteAccidental.textContent = '';
    noteOctave.textContent = '';
    detectedFreqEl.textContent = '--.-';
    targetFreqEl.textContent = '--.-';
    centDiffEl.textContent = '0';
    centReadout.textContent = '--';
    centReadout.className = 'cent-display';
    mainDisplayCard.classList.remove('in-tune-glow');
    renderer.drawMeter(null, false);
}

// 起動
init();


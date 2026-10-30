/**
 * ピッチ検出および音楽理論計算モジュール
 * YIN法および改良自己相関法（Autocorrelation）
 */

export const NOTE_STRINGS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/**
 * 周波数からMIDIノート番号を算出
 * @param {number} frequency - 周波数 (Hz)
 * @param {number} basePitch - A4の基準ピッチ (例: 442)
 * @returns {number}
 */
export function freqToMidiNote(frequency, basePitch = 442) {
    return 69 + 12 * Math.log2(frequency / basePitch);
}

/**
 * MIDIノート番号から周波数を算出
 * @param {number} note - MIDIノート番号
 * @param {number} basePitch - A4の基準ピッチ (例: 442)
 * @returns {number}
 */
export function midiNoteToFreq(note, basePitch = 442) {
    return basePitch * Math.pow(2, (note - 69) / 12);
}

/**
 * 周波数から音名・オクターブ・目標周波数・セントズレを算出
 * @param {number} frequency - 検出周波数
 * @param {number} basePitch - A4基準周波数
 */
export function getNoteDetails(frequency, basePitch = 442) {
    if (!frequency || frequency <= 0) return null;

    const midiNoteExact = freqToMidiNote(frequency, basePitch);
    const midiNote = Math.round(midiNoteExact);
    const targetFreq = midiNoteToFreq(midiNote, basePitch);

    // セントズレ計算: 1200 * log2(f / f_target)
    const cent = Math.round(1200 * Math.log2(frequency / targetFreq));

    const noteIndex = ((midiNote % 12) + 12) % 12;
    const noteNameWithAccidental = NOTE_STRINGS[noteIndex];
    const letter = noteNameWithAccidental.charAt(0);
    const accidental = noteNameWithAccidental.length > 1 ? noteNameWithAccidental.substring(1) : "";
    const octave = Math.floor(midiNote / 12) - 1;

    return {
        letter,
        accidental,
        octave,
        fullName: `${noteNameWithAccidental}${octave}`,
        midiNote,
        detectedFreq: frequency,
        targetFreq,
        cent,
        inTune: Math.abs(cent) <= 3
    };
}

/**
 * 自乗差関数（Square Difference Function）を用いた自己相関ピッチ検出
 * フルート（B3〜D7）・ピッコロ（D5〜C8）に対応した最適化
 * 
 * @param {Float32Array} buffer - 時間領域オーディオバッファ
 * @param {number} sampleRate - サンプルレート
 * @param {number} minFreq - 最小検出周波数 (例: 220Hz)
 * @param {number} maxFreq - 最大検出周波数 (例: 4500Hz)
 * @param {number} noiseThreshold - RMSノイズゲート閾値
 * @returns {number|null} 検出周波数(Hz) または null
 */
export function autoCorrelate(buffer, sampleRate, minFreq = 180, maxFreq = 4500, noiseThreshold = 0.01) {
    const bufferSize = buffer.length;

    // 1. RMS (音量エネルギー) の計算
    let sumSquare = 0;
    for (let i = 0; i < bufferSize; i++) {
        sumSquare += buffer[i] * buffer[i];
    }
    const rms = Math.sqrt(sumSquare / bufferSize);

    // ノイズ閾値以下の場合は無音と判定
    if (rms < noiseThreshold) {
        return null;
    }

    // 2. 探索範囲のラグ（遅延サンプル数）
    const minLag = Math.floor(sampleRate / maxFreq);
    const maxLag = Math.floor(sampleRate / minFreq);

    // 自己相関（Autocorrelation）
    let bestLag = -1;
    let bestCorrelation = 0;

    // 自己相関の基本形
    const correlations = new Float32Array(maxLag + 1);

    for (let lag = minLag; lag <= maxLag; lag++) {
        let sum = 0;
        for (let i = 0; i < bufferSize - lag; i++) {
            sum += buffer[i] * buffer[i + lag];
        }
        correlations[lag] = sum;
    }

    // ピーク検出 (極大値かつ十分な相関比率を持つ最初の明確なピークを探す)
    let foundFirstDip = false;
    let thresholdPeak = 0.65; // 相関閾値

    for (let lag = minLag; lag < maxLag - 1; lag++) {
        if (!foundFirstDip && correlations[lag] < correlations[lag - 1]) {
            foundFirstDip = true;
        }

        if (foundFirstDip) {
            if (correlations[lag] > correlations[lag - 1] && correlations[lag] > correlations[lag + 1]) {
                const normVal = correlations[lag] / (sumSquare || 1);
                if (normVal > thresholdPeak && correlations[lag] > bestCorrelation) {
                    bestCorrelation = correlations[lag];
                    bestLag = lag;
                    break; // 最も基本波（周期）に近い最初の大きなピークを採用
                }
            }
        }
    }

    if (bestLag === -1) {
        // フォールバック: 全探索から最大値を探す
        let maxVal = -1;
        for (let lag = minLag; lag <= maxLag; lag++) {
            if (correlations[lag] > maxVal) {
                maxVal = correlations[lag];
                bestLag = lag;
            }
        }
        if ((maxVal / (sumSquare || 1)) < 0.5) {
            return null;
        }
    }

    // 放物線補間（Parabolic Interpolation）でサブサンプルの精度を向上
    let refinedLag = bestLag;
    if (bestLag > 0 && bestLag < maxLag) {
        const alpha = correlations[bestLag - 1];
        const beta = correlations[bestLag];
        const gamma = correlations[bestLag + 1];
        const delta = (alpha - gamma) / (2 * (alpha - 2 * beta + gamma));
        if (isFinite(delta)) {
            refinedLag = bestLag + delta;
        }
    }

    const detectedFreq = sampleRate / refinedLag;

    // 範囲チェック
    if (detectedFreq < minFreq || detectedFreq > maxFreq) {
        return null;
    }

    return detectedFreq;
}


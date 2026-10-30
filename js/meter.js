/**
 * Canvas アナログメーターおよびオシロスコープ描画モジュール
 */

export class MeterRenderer {
    constructor(meterCanvasId, oscCanvasId) {
        this.meterCanvas = document.getElementById(meterCanvasId);
        this.meterCtx = this.meterCanvas.getContext('2d');

        this.oscCanvas = document.getElementById(oscCanvasId);
        this.oscCtx = this.oscCanvas.getContext('2d');

        // スムージング用現在セント値
        this.currentCent = 0;
        this.targetCent = 0;
    }

    /**
     * アナログセントメーターの描画
     * @param {number|null} cent - -50 ~ +50 のセントズレ
     * @param {boolean} inTune - ジャスト判定
     */
    drawMeter(cent, inTune = false) {
        const ctx = this.meterCtx;
        const width = this.meterCanvas.width;
        const height = this.meterCanvas.height;

        // 目標セントのスムーズ補間 (Lerp)
        if (cent !== null) {
            this.targetCent = Math.max(-50, Math.min(50, cent));
        } else {
            // 入力がない時は徐々に中央へ戻る
            this.targetCent = 0;
        }
        this.currentCent += (this.targetCent - this.currentCent) * 0.25;

        ctx.clearRect(0, 0, width, height);

        const centerX = width / 2;
        const centerY = height + 40; // 針の回転支点（画面下側）
        const radius = height + 10;

        // 1. 円弧ゲージの背景
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius - 20, Math.PI * 1.25, Math.PI * 1.75);
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 14;
        ctx.stroke();

        // 2. イン・チューン（中央 ±3セント）の許容グリーンゾーン
        ctx.beginPath();
        const centerAngle = Math.PI * 1.5;
        const greenSpan = 0.035; // 約 ±3セント幅
        ctx.arc(centerX, centerY, radius - 20, centerAngle - greenSpan, centerAngle + greenSpan);
        ctx.strokeStyle = inTune ? '#16a34a' : '#86efac';
        ctx.lineWidth = inTune ? 18 : 14;
        ctx.stroke();

        // 3. 目盛り線とラベルの描画
        const centMarks = [-50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50];
        centMarks.forEach(mark => {
            // -50 = 1.30 * PI, 0 = 1.5 * PI, +50 = 1.70 * PI
            const angle = Math.PI * 1.5 + (mark / 50) * (Math.PI * 0.22);
            const isMajor = mark % 10 === 0;
            const isCenter = mark === 0;

            const outerR = radius - 8;
            const innerR = isCenter ? radius - 38 : (isMajor ? radius - 30 : radius - 24);

            const x1 = centerX + Math.cos(angle) * innerR;
            const y1 = centerY + Math.sin(angle) * innerR;
            const x2 = centerX + Math.cos(angle) * outerR;
            const y2 = centerY + Math.sin(angle) * outerR;

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.lineWidth = isCenter ? 3 : (isMajor ? 2 : 1);
            ctx.strokeStyle = isCenter ? (inTune ? '#16a34a' : '#b0253c') : '#cbd5e1';
            ctx.stroke();

            // ラベル
            if (isMajor) {
                const textR = innerR - 14;
                const tx = centerX + Math.cos(angle) * textR;
                const ty = centerY + Math.sin(angle) * textR;

                ctx.font = isCenter ? 'bold 13px -apple-system, BlinkMacSystemFont, sans-serif' : '11px -apple-system, BlinkMacSystemFont, sans-serif';
                ctx.fillStyle = isCenter ? (inTune ? '#16a34a' : '#1c2333') : '#64748b';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(mark === 0 ? '0' : (mark > 0 ? `+${mark}` : `${mark}`), tx, ty);
            }
        });

        // 4. アナログ針の描画
        const needleAngle = Math.PI * 1.5 + (this.currentCent / 50) * (Math.PI * 0.22);
        const needleLen = radius - 15;
        const nx = centerX + Math.cos(needleAngle) * needleLen;
        const ny = centerY + Math.sin(needleAngle) * needleLen;

        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(nx, ny);
        ctx.lineWidth = inTune ? 4 : 3;
        ctx.strokeStyle = inTune ? '#16a34a' : (cent === null ? '#94a3b8' : (this.currentCent > 0 ? '#dc2626' : '#2563eb'));
        ctx.stroke();

        // 針の光彩エフェクト (In Tune時)
        if (inTune) {
            ctx.shadowColor = '#16a34a';
            ctx.shadowBlur = 12;
            ctx.stroke();
            ctx.shadowBlur = 0; // reset
        }

        // 支点の丸ボッチ
        ctx.beginPath();
        ctx.arc(centerX, centerY, 8, 0, Math.PI * 2);
        ctx.fillStyle = inTune ? '#16a34a' : '#1c2333';
        ctx.fill();
    }

    /**
     * オシロスコープ波形の描画
     * @param {Float32Array} buffer - 音声時間領域バッファ
     */
    drawOscilloscope(buffer) {
        const ctx = this.oscCtx;
        const width = this.oscCanvas.width;
        const height = this.oscCanvas.height;

        ctx.clearRect(0, 0, width, height);

        // グリッド線（中央ゼロクロス線）
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.strokeStyle = 'rgba(48, 54, 61, 0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();

        if (!buffer || buffer.length === 0) return;

        ctx.beginPath();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#58a6ff'; // 波形カラー

        const sliceWidth = width / buffer.length;
        let x = 0;

        for (let i = 0; i < buffer.length; i++) {
            const v = buffer[i]; // -1.0 ~ 1.0
            const y = (v * 0.9 * (height / 2)) + (height / 2);

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
            x += sliceWidth;
        }

        ctx.stroke();
    }
}


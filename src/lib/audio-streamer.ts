const GEMINI_INPUT_SAMPLE_RATE = 16000;
const GEMINI_OUTPUT_SAMPLE_RATE = 24000;
const INPUT_CHUNK_DURATION_MS = 100;
const INPUT_CHUNK_SAMPLES = (GEMINI_INPUT_SAMPLE_RATE * INPUT_CHUNK_DURATION_MS) / 1000; // 1600 samples
const SILENCE_RMS_THRESHOLD = 0.004;
const DEFAULT_SILENCE_HOLD_MS = 500;
const DEFAULT_MAX_TURN_MS = 20_000;

function resolveSilenceHoldMs() {
    const raw = process.env.NEXT_PUBLIC_GEMINI_SILENCE_HOLD_MS;
    if (!raw) return DEFAULT_SILENCE_HOLD_MS;

    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return DEFAULT_SILENCE_HOLD_MS;

    // Keep bounds safe for conversational turn-taking.
    return Math.min(2000, Math.max(150, parsed));
}

const SILENCE_HOLD_MS = resolveSilenceHoldMs();

function resolveMaxTurnMs() {
    const raw = process.env.NEXT_PUBLIC_GEMINI_MAX_TURN_MS;
    if (!raw) return DEFAULT_MAX_TURN_MS;

    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return DEFAULT_MAX_TURN_MS;

    // 不自然な長話で turn が閉じないケースを防ぐため、上限を強制する。
    return Math.min(120_000, Math.max(5_000, parsed));
}

const MAX_TURN_MS = resolveMaxTurnMs();

type WindowWithWebkitAudioContext = Window & {
    webkitAudioContext?: typeof AudioContext;
};

export class AudioStreamer {
    public audioContext: AudioContext | null = null;
    public isRecording: boolean = false;
    public isPlaying: boolean = false;
    private workletNode: AudioWorkletNode | null = null;
    private keepAliveNode: GainNode | null = null;
    private stream: MediaStream | null = null;
    private audioQueue: Float32Array[] = [];
    private isProcessingQueue: boolean = false;
    private scheduledTime: number = 0;
    private activeSources: Set<AudioBufferSourceNode> = new Set();
    private queueGeneration: number = 0;
    private inputRemainder: Float32Array = new Float32Array(0);
    private pendingInputPcm: number[] = [];
    private lastVoiceAtMs: number = 0;
    private sentAudioSinceTurnStart: boolean = false;
    private turnStartedAtMs: number = 0;
    private onAudioData: (data: string) => void;

    constructor(onAudioData: (data: string) => void) {
        this.onAudioData = onAudioData;
    }

    async initialize() {
        const audioContextClass =
            window.AudioContext || (window as WindowWithWebkitAudioContext).webkitAudioContext;
        if (!audioContextClass) {
            throw new Error("AudioContext is not supported in this environment");
        }

        this.audioContext = new audioContextClass({
            sampleRate: GEMINI_OUTPUT_SAMPLE_RATE,
        });

        // Keep worklet inline for now (can be externalized later).
        const workletCode = `
      class RecorderProcessor extends AudioWorkletProcessor {
        process(inputs, outputs, parameters) {
          const input = inputs[0];
          if (input && input.length > 0) {
            const channelData = input[0];
            this.port.postMessage(channelData);
          }
          return true;
        }
      }
      registerProcessor('recorder-processor', RecorderProcessor);
    `;
        const blob = new Blob([workletCode], { type: 'application/javascript' });
        await this.audioContext.audioWorklet.addModule(URL.createObjectURL(blob));
    }

    async primeAudioContext() {
        if (!this.audioContext) {
            await this.initialize();
        }
        if (this.audioContext && this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
    }

    async startRecording() {
        if (this.isRecording) {
            return;
        }

        await this.primeAudioContext();
        if (!this.audioContext) {
            throw new Error("AudioContext initialization failed");
        }

        this.stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            },
        });

        const source = this.audioContext.createMediaStreamSource(this.stream);

        this.workletNode = new AudioWorkletNode(this.audioContext, 'recorder-processor');
        this.workletNode.port.onmessage = (event) => {
            this.processInputAudio(event.data as Float32Array);
        };

        // Keep processor alive without routing audible mic input to speakers.
        this.keepAliveNode = this.audioContext.createGain();
        this.keepAliveNode.gain.value = 0;

        source.connect(this.workletNode);
        this.workletNode.connect(this.keepAliveNode);
        this.keepAliveNode.connect(this.audioContext.destination);

        this.lastVoiceAtMs = Date.now();
        this.inputRemainder = new Float32Array(0);
        this.pendingInputPcm = [];
        this.sentAudioSinceTurnStart = false;
        this.turnStartedAtMs = 0;
        this.isRecording = true;
    }

    stopRecording() {
        this.flushInputChunkQueue(true);
        this.sendAudioStreamEnd(true);

        if (this.workletNode) {
            this.workletNode.disconnect();
            this.workletNode = null;
        }
        if (this.keepAliveNode) {
            this.keepAliveNode.disconnect();
            this.keepAliveNode = null;
        }
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        this.inputRemainder = new Float32Array(0);
        this.pendingInputPcm = [];
        this.sentAudioSinceTurnStart = false;
        this.turnStartedAtMs = 0;
        this.isRecording = false;
    }

    private processInputAudio(float32Array: Float32Array) {
        if (!this.audioContext || !this.isRecording) return;
        if (!float32Array || float32Array.length === 0) return;

        const nowMs = Date.now();

        if (
            this.sentAudioSinceTurnStart
            && this.turnStartedAtMs > 0
            && nowMs - this.turnStartedAtMs >= MAX_TURN_MS
        ) {
            this.flushInputChunkQueue(true);
            this.sendAudioStreamEnd(true);
            return;
        }

        const rms = this.computeRms(float32Array);
        if (rms >= SILENCE_RMS_THRESHOLD) {
            this.lastVoiceAtMs = nowMs;
        }

        const hasRecentVoice = nowMs - this.lastVoiceAtMs <= SILENCE_HOLD_MS;
        if (!hasRecentVoice) {
            this.flushInputChunkQueue(true);
            this.sendAudioStreamEnd(false);
            return;
        }

        const resampled = this.resampleToInputRate(float32Array, this.audioContext.sampleRate);
        if (resampled.length === 0) return;

        const pcm16 = this.floatTo16BitPCM(resampled);
        for (let i = 0; i < pcm16.length; i++) {
            this.pendingInputPcm.push(pcm16[i]);
        }

        this.flushInputChunkQueue(false);
    }

    private computeRms(input: Float32Array) {
        let sum = 0;
        for (let i = 0; i < input.length; i++) {
            sum += input[i] * input[i];
        }
        return Math.sqrt(sum / input.length);
    }

    private concatFloat32Arrays(a: Float32Array, b: Float32Array) {
        if (a.length === 0) return b;
        if (b.length === 0) return a;
        const merged = new Float32Array(a.length + b.length);
        merged.set(a, 0);
        merged.set(b, a.length);
        return merged;
    }

    private resampleToInputRate(input: Float32Array, sourceRate: number) {
        if (sourceRate === GEMINI_INPUT_SAMPLE_RATE) {
            return input;
        }

        const merged = this.concatFloat32Arrays(this.inputRemainder, input);
        if (merged.length === 0) {
            return new Float32Array(0);
        }

        const ratio = sourceRate / GEMINI_INPUT_SAMPLE_RATE;
        if (!Number.isFinite(ratio) || ratio <= 0) {
            this.inputRemainder = new Float32Array(0);
            return new Float32Array(0);
        }

        const outputLength = Math.floor(merged.length / ratio);
        if (outputLength <= 0) {
            this.inputRemainder = merged;
            return new Float32Array(0);
        }

        const output = new Float32Array(outputLength);
        for (let i = 0; i < outputLength; i++) {
            const sourceIndex = i * ratio;
            const low = Math.floor(sourceIndex);
            const high = Math.min(low + 1, merged.length - 1);
            const t = sourceIndex - low;
            output[i] = merged[low] * (1 - t) + merged[high] * t;
        }

        const consumedInput = Math.min(merged.length, Math.floor(outputLength * ratio));
        this.inputRemainder = merged.slice(consumedInput);
        return output;
    }

    private flushInputChunkQueue(forceFlushPartial: boolean) {
        while (this.pendingInputPcm.length >= INPUT_CHUNK_SAMPLES) {
            const chunk = Int16Array.from(this.pendingInputPcm.splice(0, INPUT_CHUNK_SAMPLES));
            this.sendRealtimeAudioChunk(chunk);
        }

        if (forceFlushPartial && this.pendingInputPcm.length > 0) {
            const chunk = Int16Array.from(this.pendingInputPcm.splice(0, this.pendingInputPcm.length));
            this.sendRealtimeAudioChunk(chunk);
        }
    }

    private sendRealtimeAudioChunk(samples: Int16Array) {
        if (samples.length === 0) return;

        if (!this.sentAudioSinceTurnStart) {
            this.turnStartedAtMs = Date.now();
        }

        const base64 = this.arrayBufferToBase64(samples.buffer);
        this.onAudioData(JSON.stringify({
            realtimeInput: {
                audio: {
                    mimeType: `audio/pcm;rate=${GEMINI_INPUT_SAMPLE_RATE}`,
                    data: base64,
                }
            },
        }));
        this.sentAudioSinceTurnStart = true;
    }

    private sendAudioStreamEnd(force: boolean) {
        if (!force && !this.sentAudioSinceTurnStart) return;

        this.onAudioData(JSON.stringify({
            realtimeInput: {
                audioStreamEnd: true,
            },
        }));
        this.sentAudioSinceTurnStart = false;
        this.turnStartedAtMs = 0;
    }

    public forceAudioStreamEnd() {
        this.flushInputChunkQueue(true);
        this.sendAudioStreamEnd(true);
    }

    // Helper to convert Float32 to Int16 PCM
    private floatTo16BitPCM(input: Float32Array) {
        const output = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) {
            const s = Math.max(-1, Math.min(1, input[i]));
            output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return output;
    }

    private arrayBufferToBase64(buffer: ArrayBufferLike) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }

    // Playback Logic
    playAudioChunk(base64Data: string) {
        if (this.audioContext?.state === 'suspended') {
            void this.audioContext.resume().catch(() => {});
        }

        // Decode base64 to PCM
        const binaryString = window.atob(base64Data);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        const int16 = new Int16Array(bytes.buffer);
        const float32 = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) {
            float32[i] = int16[i] / 32768.0;
        }

        this.audioQueue.push(float32);
        if (!this.isProcessingQueue) {
            this.processQueue();
        }
    }

    async processQueue() {
        this.isProcessingQueue = true;
        const currentGeneration = this.queueGeneration;
        try {
            while (this.audioQueue.length > 0) {
                if (currentGeneration !== this.queueGeneration) {
                    break;
                }

                const data = this.audioQueue.shift();
                if (currentGeneration !== this.queueGeneration) {
                    break;
                }

                if (data && this.audioContext) {
                    const buffer = this.audioContext.createBuffer(1, data.length, GEMINI_OUTPUT_SAMPLE_RATE);
                    buffer.getChannelData(0).set(data);

                    const source = this.audioContext.createBufferSource();
                    source.buffer = buffer;
                    source.connect(this.audioContext.destination);
                    this.activeSources.add(source);
                    source.onended = () => {
                        source.disconnect();
                        this.activeSources.delete(source);
                    };

                    // Simple scheduling to avoid gaps or overlaps
                    const currentTime = this.audioContext.currentTime;
                    if (this.scheduledTime < currentTime) {
                        this.scheduledTime = currentTime;
                    }

                    source.start(this.scheduledTime);
                    this.scheduledTime += buffer.duration;
                }
            }
        } finally {
            this.isProcessingQueue = false;
        }
    }

    clearPlaybackQueue() {
        this.queueGeneration += 1;
        this.audioQueue = [];

        for (const source of this.activeSources) {
            try {
                source.stop();
            } catch {
                // stop済みsourceは例外を投げることがあるため握りつぶす
            }
            source.disconnect();
        }
        this.activeSources.clear();

        if (this.audioContext) {
            this.scheduledTime = this.audioContext.currentTime;
        } else {
            this.scheduledTime = 0;
        }

        this.isProcessingQueue = false;
    }

    async close() {
        this.stopRecording();
        this.clearPlaybackQueue();
        if (this.audioContext) {
            await this.audioContext.close();
            this.audioContext = null;
        }
    }
}

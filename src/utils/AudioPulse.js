const DEFAULT_OSC_TYPE = 'sine';
const DEFAULT_GAIN = 0.04;
const DEFAULT_FREQ = 80;

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function createAudioPulseSystem() {
    if (typeof window === 'undefined') {
        return {
            resume: () => Promise.resolve(),
            getEnergy: () => 0,
            destroy: () => {}
        };
    }

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
        return {
            resume: () => Promise.resolve(),
            getEnergy: () => 0,
            destroy: () => {}
        };
    }

    const context = new AudioContext();
    const analyser = context.createAnalyser();
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    analyser.fftSize = 256;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    oscillator.type = DEFAULT_OSC_TYPE;
    oscillator.frequency.value = DEFAULT_FREQ;
    gain.gain.value = DEFAULT_GAIN;

    oscillator.connect(analyser);
    analyser.connect(gain);
    gain.connect(context.destination);

    oscillator.start();

    function resume() {
        if (context.state === 'suspended') {
            return context.resume();
        }
        return Promise.resolve();
    }

    function getEnergy() {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
        }
        if (dataArray.length === 0) return 0;
        const avg = sum / dataArray.length;
        return clamp(avg / 255, 0, 1);
    }

    function destroy() {
        oscillator.stop();
        oscillator.disconnect();
        analyser.disconnect();
        gain.disconnect();
        if (context.state !== 'closed') {
            context.close();
        }
    }

    return {
        resume,
        getEnergy,
        destroy
    };
}

export default createAudioPulseSystem;

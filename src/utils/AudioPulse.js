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
            destroy: () => { }
        };
    }

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
        return {
            resume: () => Promise.resolve(),
            getEnergy: () => 0,
            destroy: () => { }
        };
    }

    const context = new AudioContext();
    const analyser = context.createAnalyser();
    const masterGain = context.createGain();

    // Zen Drone: Multiple low frequency oscillators
    const drones = [];
    const freqs = [110, 165, 220, 55]; // A2, E3, A3, A1 (Harmonic stack)

    freqs.forEach(freq => {
        const osc = context.createOscillator();
        const gain = context.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        // Random slight detune for richness
        osc.detune.value = (Math.random() - 0.5) * 10;

        gain.gain.value = 0.0; // Start silent, fade in

        osc.connect(gain);
        gain.connect(masterGain);
        osc.start();

        // Low volume but audible
        drones.push({ osc, gain, baseGain: 0.15 / freqs.length }); // Increased volume (was 0.05)
    });

    analyser.fftSize = 256;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    masterGain.gain.value = 1.0;

    masterGain.connect(analyser);
    analyser.connect(context.destination);

    function resume() {
        // Always try to resume context
        const resumePromise = (context.state === 'suspended') ? context.resume() : Promise.resolve();

        return resumePromise.then(() => {
            // Fade in drones now that we are resumed
            const now = context.currentTime;
            drones.forEach(d => {
                // Cancel scheduled values to be safe
                d.gain.gain.cancelScheduledValues(now);
                // Ramp up
                d.gain.gain.linearRampToValueAtTime(d.baseGain, now + 2.0); // Faster fade (2s)
            });
            console.log('Zenith Audio: Resumed & Fading In');
        });
    }

    function getEnergy() {
        if (context.state === 'suspended') return 0;
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
        drones.forEach(d => {
            d.osc.stop();
            d.osc.disconnect();
            d.gain.disconnect();
        });
        masterGain.disconnect();
        analyser.disconnect();
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

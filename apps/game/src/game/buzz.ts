/** A short synthesized phone vibration: three low square-wave pulses through WebAudio. No asset needed. */

let ctx: AudioContext | null = null;

export function playBuzz() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime + 0.01;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 140;
    filter.type = "lowpass";
    filter.frequency.value = 600;
    gain.gain.setValueAtTime(0, t0);
    for (let i = 0; i < 3; i++) {
      const t = t0 + i * 0.16;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.015);
      gain.gain.setValueAtTime(0.18, t + 0.09);
      gain.gain.linearRampToValueAtTime(0, t + 0.11);
    }
    osc.connect(filter).connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.5);
  } catch (e) {
    console.warn("[backpack] buzz sound unavailable", e);
  }
}

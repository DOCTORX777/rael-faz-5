export function ballContext(canvas, reducedMotion) {
  if (reducedMotion) return null;
  try {
    const settings = { alpha: true, antialias: true, powerPreference: 'low-power' };
    return canvas.getContext('webgl2', settings) || canvas.getContext('webgl', settings);
  } catch {
    return null;
  }
}

const mix = (from, to, time) => from + (to - from) * time;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function planKick(width, height, drag, attempt) {
  const force = clamp(drag ? .45 + Math.hypot(drag.x, drag.y) / 140 : .75, .45, 1.3);
  return {
    startX: width * .42, startY: height * .78,
    goalX: width * clamp(.51 + (drag?.x ?? 0) / Math.max(width, 1) * .32, .36, .65),
    goalY: height * .43,
    lift: height * (.10 + force * .10),
    hit: .53,
    duration: 870 + (1.3 - force) * 310,
    spin: 6 + force * 10,
    saved: attempt % 4 === 0
  };
}

export function sampleKick(plan, phase) {
  const t = clamp(phase, 0, 1);
  const flight = t <= plan.hit;
  const progress = flight ? t / plan.hit : (t - plan.hit) / (1 - plan.hit);
  const ground = flight ? progress : 1 - progress;
  const air = flight ? Math.sin(Math.PI * progress) * plan.lift
    : Math.abs(Math.sin(progress * Math.PI * 2)) * (1 - progress) * plan.lift * .42;
  const x = mix(plan.startX, plan.goalX, ground);
  const groundY = mix(plan.startY, plan.goalY, ground);
  const scale = mix(1, .42, ground);
  const spin = flight ? 1 - (1 - progress) ** 2 : 1 - progress * .38;
  return { x, y: groundY - air, groundY, scale, rotation: plan.spin * spin,
    shadowScale: scale * (1 - Math.min(.48, air / 130)),
    shadowOpacity: .31 - Math.min(.22, air / 330) };
}

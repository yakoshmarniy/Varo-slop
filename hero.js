import * as THREE from "./vendor/three.module.js";

/*
  Honomi hero — a slow drift of golden rice grains over a dark paddy field.
  One scene per <canvas data-grain-field>. Designed to sit behind the hero
  text and degrade gracefully: if WebGL or motion is unavailable the canvas
  simply stays transparent and the CSS gradient carries the look.
*/

const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uHeight;
  uniform float uPixelRatio;

  attribute float aScale;
  attribute float aSpeed;
  attribute float aPhase;
  attribute float aAngle;
  attribute float aTone;

  varying float vAngle;
  varying float vTone;
  varying float vDepth;

  void main() {
    vec3 pos = position;

    // Grains fall slowly and wrap around the field height.
    float fall = mod(uTime * aSpeed + aPhase * uHeight, uHeight);
    pos.y = position.y - fall;
    if (pos.y < -uHeight * 0.5) {
      pos.y += uHeight;
    }

    // Slight lateral sway as the grains fall — kept small so the motion
    // reads clearly as falling, not floating.
    pos.x += sin(uTime * aSpeed * 0.6 + aPhase * 6.2831) * 0.18;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    vAngle = aAngle + uTime * aSpeed * 0.7;
    vTone = aTone;
    vDepth = clamp((mv.z + 14.0) / 12.0, 0.0, 1.0);

    gl_PointSize = aScale * uPixelRatio * (120.0 / -mv.z);
  }
`;

const FRAG = /* glsl */ `
  precision mediump float;

  varying float vAngle;
  varying float vTone;
  varying float vDepth;

  void main() {
    // Rotate the sprite space so each grain has its own orientation.
    vec2 uv = gl_PointCoord - 0.5;
    float s = sin(vAngle);
    float c = cos(vAngle);
    uv = mat2(c, -s, s, c) * uv;

    // Stretch into a slender, pointed rice-grain shape.
    uv.x /= 0.34;
    float d = length(uv);
    float grain = smoothstep(0.5, 0.30, d);
    if (grain <= 0.001) discard;

    // Pale, milled-rice palette with a faint warm tint, plus a soft
    // highlight down the length of the grain so it reads as a solid kernel.
    vec3 cream = vec3(0.97, 0.94, 0.86);
    vec3 husk = vec3(0.86, 0.78, 0.55);
    vec3 color = mix(husk, cream, vTone);
    color += (1.0 - smoothstep(0.0, 0.22, abs(uv.x))) * 0.10;

    float alpha = grain * mix(0.55, 0.97, vDepth);
    gl_FragColor = vec4(color, alpha);
  }
`;

function buildField(canvas) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  } catch (e) {
    return; // No WebGL — CSS gradient stands in.
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
  camera.position.z = 12;

  const COUNT = window.innerWidth < 760 ? 320 : 700;
  const HEIGHT = 30;
  const WIDTH = 40;
  const DEPTH = 18;

  const positions = new Float32Array(COUNT * 3);
  const scales = new Float32Array(COUNT);
  const speeds = new Float32Array(COUNT);
  const phases = new Float32Array(COUNT);
  const angles = new Float32Array(COUNT);
  const tones = new Float32Array(COUNT);

  for (let i = 0; i < COUNT; i++) {
    positions[i * 3 + 0] = (Math.random() - 0.5) * WIDTH;
    positions[i * 3 + 1] = (Math.random() - 0.5) * HEIGHT;
    positions[i * 3 + 2] = -Math.random() * DEPTH;
    scales[i] = 2.4 + Math.random() * 4.0;
    speeds[i] = 1.0 + Math.random() * 2.2;
    phases[i] = Math.random();
    angles[i] = Math.random() * Math.PI * 2;
    tones[i] = Math.random();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aScale", new THREE.BufferAttribute(scales, 1));
  geometry.setAttribute("aSpeed", new THREE.BufferAttribute(speeds, 1));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute("aAngle", new THREE.BufferAttribute(angles, 1));
  geometry.setAttribute("aTone", new THREE.BufferAttribute(tones, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uHeight: { value: HEIGHT },
      uPixelRatio: { value: dpr },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);

  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener("pointermove", (e) => {
    pointer.tx = (e.clientX / window.innerWidth - 0.5) * 0.6;
    pointer.ty = (e.clientY / window.innerHeight - 0.5) * 0.4;
  });

  function resize() {
    const w = canvas.clientWidth || canvas.offsetWidth;
    const h = canvas.clientHeight || canvas.offsetHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  // Pause rendering when the hero scrolls out of view.
  let visible = true;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      (entries) => entries.forEach((en) => (visible = en.isIntersecting)),
      { threshold: 0 }
    ).observe(canvas);
  }

  const clock = new THREE.Clock();

  function frame() {
    requestAnimationFrame(frame);
    if (!visible) return;
    const t = clock.getElapsedTime();
    material.uniforms.uTime.value = t;

    pointer.x += (pointer.tx - pointer.x) * 0.04;
    pointer.y += (pointer.ty - pointer.y) * 0.04;
    points.rotation.y = pointer.x * 0.5;
    points.rotation.x = pointer.y * 0.4;

    renderer.render(scene, camera);
  }

  if (REDUCED_MOTION) {
    // Render a single still frame and stop.
    resize();
    renderer.render(scene, camera);
  } else {
    frame();
  }
}

document.querySelectorAll("canvas[data-grain-field]").forEach(buildField);

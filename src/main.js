import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MODEL_PATHS = {
  otter: 'player/otter.glb',
  clam: 'player/Clam for attack.glb',
  boss: 'boss/boss.glb',
  trash: 'boss/trash for attack- 9_gWQWhmmQv.glb',
  rock: 'enemy/Rock by J-Toastie - V7cYy0T56b.glb',
  sodacan: 'enemy/Soda Can Crushed by Kenney - MWvBbxYzjJ.glb',
  log: 'enemy/log.glb',
  poop: 'enemy/poop by Tiff Eidmann - 65wuu48mFfG.glb',
  nature: 'for stage map edit/Nature by 3Donimus - 0nsE2b8uXZy.glb',
  tree: 'for stage map edit/Tree by Poly by Google - 6pwiq7hSrHr.glb',
};

const LANES = [-2.2, 0, 2.2];
const SPAWN_Z = -70;
const DESPAWN_Z = 6;
const PLAYER_Z = 0;

const STAGES = [
  { name: '① 입암산 발원지', desc: '여기는 입암산, 황룡강이 시작되는 곳이에요', dist: 0, speed: 12, water: [0x5fe0cc, 0x1fa08c], fog: 0xbfe8dc, sky: 0xcdf2e6, spawnEvery: 1.35, fact: '수달은 깨끗한 물이 흐르는 하천에서만 살 수 있어요.' },
  { name: '② 장성호', desc: '계곡물이 모여 넓은 저수지를 이뤄요', dist: 260, speed: 14.5, water: [0x66c7ea, 0x2a8fc0], fog: 0xc9eaf5, sky: 0xd6f0fa, spawnEvery: 1.15, fact: '장성호는 황룡강을 댐으로 막아 만든 인공 호수예요.' },
  { name: '③ 읍내 구간', desc: '장성 읍내를 가로지르는 도심 하천이에요', dist: 620, speed: 17, water: [0x7fd0b8, 0x3a9f88], fog: 0xdcefe2, sky: 0xe6f4ea, spawnEvery: 0.95, fact: '길에 버린 쓰레기는 비가 오면 하천으로 쓸려 내려와요.' },
  { name: '④ 영산강 합류부', desc: '가장 넓은 강, 곧 보스가 나타나요!', dist: 1050, speed: 19.5, water: [0xffc178, 0xd98c3b], fog: 0xffe3bd, sky: 0xffedd0, spawnEvery: 0.8, fact: '수달은 천연기념물이자 멸종위기 야생생물 Ⅰ급이에요.' },
];
const BOSS_TRIGGER_DIST = 1450;
const BOSS_HP = 10;
const BOSS_HIT_HALF_W = 1.9;   // a clam only hurts the boss if it is lined up with it
const PROJECTILE_SPEED = 34;
const RAMP_PER_M = 0.007;     // speed gained per meter inside a stage
const RAMP_MAX = 2.4;         // max extra speed inside a stage
const TOP_SPEED = STAGES[3].speed + RAMP_MAX;
const SURGE_FLOOR = 0.12;     // muddy current is always faintly visible
const MODES = {
  easy: { lives: 5, surge: false },
  challenge: { lives: 3, surge: true },
};

const state = {
  phase: 'start', // start | playing | boss | win | over
  distance: 0,
  score: 0,
  clams: 0,
  lives: 3,
  invuln: 0,
  lane: 1,
  laneX: LANES[1],
  y: 0,
  vy: 0,
  jumping: false,
  sliding: false,
  slideTimer: 0,
  attackCooldown: 0,
  stageIndex: 0,
  spawnTimer: 0,
  sceneryTimer: 0,
  clamTimer: 0,
  streakTimer: 0,
  bossHp: BOSS_HP,
  boss: null,
  bossAttackTimer: 0,
  bossT: 0,
  trashCleared: 0,
  speed: STAGES[0].speed,
  shake: 0,
  mode: 'challenge',
  maxLives: 3,
  motionFx: true,
  baseSpeed: STAGES[0].speed,
  speedMul: 1,
  slowTimer: 0,
  surge: SURGE_FLOOR,
  time: 0,
  lastLaneChange: -10,
  lastNear: -10,
  slowmoTimer: 0,
  slowmoCd: 0,
  bonus: 0,
  combo: 0,
  comboTimer: 0,
  bossWarnLanes: null,
  bossBaseScale: 1,
  renderedLives: -1,
  paused: false,
  hitStop: 0,        // real-time freeze frames on impact
  auto: false,       // autoplay (test) mode
  autoCd: 0,
  bossDying: 0,
  bossPhase: 1,
  bossAng: 0,
  bossHurt: 0,
  squash: 0,
  splashTimer: 0,
  slideQueued: false,
  best: 0,
};

const BEST_KEY = 'hwg_best_score';
function loadBest() { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch (e) { return 0; } }
function saveBest(v) { try { localStorage.setItem(BEST_KEY, String(v)); } catch (e) { /* storage unavailable */ } }

let renderer, scene, camera, clock;
let waterMat, waterUniforms;
let playerRig, playerModel;
let bankL, bankR;
let mudMesh, mudUniforms, warnTex;
const bossWarnSprites = [];
const entities = []; // {mesh, x, type, destructible, kind}
const projectiles = []; // {mesh} — player-fired clams
const assets = {};
let playerBaseScale = null;
let animT = 0;
let sharedStreak = null;

// ---------- Particles (one InstancedMesh, pooled) ----------
const MAX_PARTICLES = 420;
let partMesh;
let partCursor = 0;
const parts = [];
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _scl = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _col = new THREE.Color();
const ZERO_MAT = new THREE.Matrix4().makeScale(0, 0, 0);

function initParticles() {
  const geo = new THREE.IcosahedronGeometry(0.5, 0);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  partMesh = new THREE.InstancedMesh(geo, mat, MAX_PARTICLES);
  partMesh.frustumCulled = false;
  partMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  partMesh.renderOrder = 5;
  for (let i = 0; i < MAX_PARTICLES; i++) {
    partMesh.setMatrixAt(i, ZERO_MAT);
    partMesh.setColorAt(i, _col.set(0xffffff));
    parts.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0.1, grav: 9, drift: true });
  }
  partMesh.instanceColor.needsUpdate = true;
  scene.add(partMesh);
}

function emit(x, y, z, count, o = {}) {
  const { color = 0xffffff, speed = 3, up = 3, size = 0.14, life = 0.6, grav = 9, drift = true } = o;
  for (let n = 0; n < count; n++) {
    const idx = partCursor;
    partCursor = (partCursor + 1) % MAX_PARTICLES;
    const p = parts[idx];
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * speed;
    p.x = x; p.y = y; p.z = z;
    p.vx = Math.cos(a) * r; p.vz = Math.sin(a) * r * 0.7;
    p.vy = up * (0.35 + Math.random() * 0.9);
    p.max = p.life = life * (0.6 + Math.random() * 0.6);
    p.size = size * (0.55 + Math.random() * 0.9);
    p.grav = grav; p.drift = drift;
    partMesh.setColorAt(idx, _col.set(Array.isArray(color) ? color[(Math.random() * color.length) | 0] : color));
  }
  partMesh.instanceColor.needsUpdate = true;
}

function updateParticles(dt, worldSpeed) {
  for (let i = 0; i < MAX_PARTICLES; i++) {
    const p = parts[i];
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) { partMesh.setMatrixAt(i, ZERO_MAT); continue; }
    p.vy -= p.grav * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt + (p.drift ? worldSpeed * dt : 0);
    if (p.y < 0.03 && p.vy < 0) { p.y = 0.03; p.vy *= -0.25; p.vx *= 0.6; p.vz *= 0.6; }
    const s = p.size * (0.25 + 0.75 * (p.life / p.max));
    _pos.set(p.x, p.y, p.z); _scl.set(s, s, s);
    _mat4.compose(_pos, _quat, _scl);
    partMesh.setMatrixAt(i, _mat4);
  }
  partMesh.instanceMatrix.needsUpdate = true;
}

function clearParticles() {
  for (let i = 0; i < MAX_PARTICLES; i++) { parts[i].life = 0; partMesh.setMatrixAt(i, ZERO_MAT); }
  partMesh.instanceMatrix.needsUpdate = true;
}

const DEBRIS = {
  rock: [0x8a8f8a, 0x6d726e, 0xaab0aa],
  log: [0x8a5a2b, 0x6b4220, 0xa87444],
  sodacan: [0xd9dde2, 0xe5393d, 0xa8adb3],
  poop: [0x7a4a22, 0x5a3517],
  trash: [0x44484d, 0x7bd0e0, 0x9aa0a6],
  bridge: [0x8a6a4a, 0xa88660],
};

const dom = {
  hud: document.getElementById('hud'),
  scoreVal: document.getElementById('scoreVal'),
  distVal: document.getElementById('distVal'),
  clamVal: document.getElementById('clamVal'),
  speedFill: document.getElementById('speedFill'),
  hearts: document.getElementById('hearts'),
  stageBanner: document.getElementById('stageBanner'),
  stName: document.getElementById('stName'),
  stDesc: document.getElementById('stDesc'),
  bossBar: document.getElementById('bossBar'),
  bossFill: document.getElementById('bossFill'),
  attackFlash: document.getElementById('attackFlash'),
  startScreen: document.getElementById('startScreen'),
  startBtn: document.getElementById('startBtn'),
  padStatus: document.getElementById('padStatus'),
  winScreen: document.getElementById('winScreen'),
  overScreen: document.getElementById('overScreen'),
  restartBtnWin: document.getElementById('restartBtnWin'),
  restartBtnOver: document.getElementById('restartBtnOver'),
  overReason: document.getElementById('overReason'),
  touchControls: document.getElementById('touchControls'),
  surgeWrap: document.getElementById('surgeWrap'),
  surgeFill: document.getElementById('surgeFill'),
  surgeEdge: document.getElementById('surgeEdge'),
  dangerVignette: document.getElementById('dangerVignette'),
  comboBadge: document.getElementById('comboBadge'),
  popLayer: document.getElementById('popLayer'),
  stFact: document.getElementById('stFact'),
  muteBtn: document.getElementById('muteBtn'),
  motionOpt: document.getElementById('motionOpt'),
  modeBtns: document.querySelectorAll('.mode-btn'),
  homeBtnWin: document.getElementById('homeBtnWin'),
  homeBtnOver: document.getElementById('homeBtnOver'),
  pauseBtn: document.getElementById('pauseBtn'),
  pauseScreen: document.getElementById('pauseScreen'),
  resumeBtn: document.getElementById('resumeBtn'),
  homeBtnPause: document.getElementById('homeBtnPause'),
  autoBtn: document.getElementById('autoBtn'),
  autoBadge: document.getElementById('autoBadge'),
  bestStart: document.getElementById('bestStart'),
};

init();

async function init() {
  initRenderer();
  initScene();
  await loadAssets();
  buildPlayer();
  state.best = loadBest();
  dom.bestStart.textContent = state.best > 0 ? `내 최고 점수 ${state.best}` : '';
  dom.startBtn.textContent = '게임 시작';
  dom.startBtn.disabled = false;
  dom.autoBtn.disabled = false;
  bindUI();
  bindInput();
  window.addEventListener('resize', onResize);
  clock = new THREE.Clock();
  renderer.setAnimationLoop(tick);
  if (new URLSearchParams(location.search).has('auto')) { state.auto = true; startGame(); }
}

function initRenderer() {
  const canvas = document.getElementById('gameCanvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = false;
}

function initScene() {
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(STAGES[0].fog, 30, 100);
  scene.background = new THREE.Color(STAGES[0].sky);

  camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 4.2, 8.5);
  camera.lookAt(0, 1.2, -6);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x8fae9c, 1.7);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xfff6e0, 1.9);
  dir.position.set(6, 10, 4);
  scene.add(dir);
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));

  createWater();
  createBanks();
  createMudSurge();
  warnTex = makeWarnTexture();
  initParticles();
  sharedStreak = {
    geo: new THREE.PlaneGeometry(0.1, 2.4),
    mat: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }),
  };
  for (let i = 0; i < 3; i++) {
    const sp = makeWarnSprite();
    sp.visible = false;
    scene.add(sp);
    bossWarnSprites.push(sp);
  }
}

// Muddy current that chases the otter from behind (challenge mode)
function createMudSurge() {
  const geo = new THREE.PlaneGeometry(10, 12, 60, 30);
  mudUniforms = { uTime: { value: 0 }, uPower: { value: 0.3 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: mudUniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: `
      uniform float uTime;
      uniform float uPower;
      varying float vCrest;
      varying float vBack;
      void main() {
        vec3 pos = position;
        float crest = exp(-pow((pos.y - 5.0) * 0.85, 2.0));
        float chop = sin(pos.x * 1.9 + uTime * 7.0) * 0.09 + sin(pos.x * 0.8 - uTime * 3.2 + pos.y) * 0.12;
        pos.z += 0.22 + crest * (0.35 + uPower * 0.75) + chop;
        vCrest = crest + chop * 0.8;
        vBack = (pos.y + 6.0) / 12.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying float vCrest;
      varying float vBack;
      void main() {
        vec3 dark = vec3(0.30, 0.20, 0.10);
        vec3 light = vec3(0.58, 0.42, 0.24);
        vec3 col = mix(dark, light, clamp(vCrest, 0.0, 1.0));
        float foam = smoothstep(0.78, 1.0, vCrest);
        col = mix(col, vec3(0.93, 0.88, 0.78), foam * 0.8);
        float a = 0.88 * smoothstep(0.0, 0.25, vBack);
        gl_FragColor = vec4(col, a);
      }
    `,
  });
  mudMesh = new THREE.Mesh(geo, mat);
  mudMesh.rotation.x = -Math.PI / 2;
  mudMesh.renderOrder = 3;
  scene.add(mudMesh);
  placeMud(SURGE_FLOOR);
}

function placeMud(surge) {
  // front edge sits just behind the otter when surge reaches 1
  const frontZ = PLAYER_Z + 1.2 + (1 - surge) * 6.6;
  mudMesh.position.set(0, 0, frontZ + 6);
}

function makeWarnTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffcf3a';
  g.strokeStyle = '#7a2a10';
  g.lineWidth = 8;
  g.lineJoin = 'round';
  g.beginPath(); g.moveTo(64, 10); g.lineTo(120, 114); g.lineTo(8, 114); g.closePath();
  g.fill(); g.stroke();
  g.fillStyle = '#7a2a10';
  g.font = 'bold 72px sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('!', 64, 80);
  return new THREE.CanvasTexture(c);
}

function makeWarnSprite() {
  const mat = new THREE.SpriteMaterial({ map: warnTex, fog: false, depthTest: false, transparent: true });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(1.15, 1.15, 1);
  sp.renderOrder = 10;
  return sp;
}

function createWater() {
  const geo = new THREE.PlaneGeometry(9, 140, 24, 60);
  waterUniforms = {
    uTime: { value: 0 },
    uShallow: { value: new THREE.Color(STAGES[0].water[0]) },
    uDeep: { value: new THREE.Color(STAGES[0].water[1]) },
  };
  waterMat = new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    transparent: true,
    side: THREE.DoubleSide,
    vertexShader: `
      uniform float uTime;
      varying float vElev;
      varying vec3 vNormalW;
      varying vec3 vViewPos;
      void main() {
        vec3 pos = position;
        float wave = sin(pos.x * 0.6 + uTime * 1.6) * 0.10
                   + sin(pos.y * 0.35 + uTime * 2.1) * 0.14
                   + sin((pos.x + pos.y) * 0.9 + uTime * 3.0) * 0.05;
        pos.z += wave;
        vElev = wave;
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        vViewPos = -mv.xyz;
        vNormalW = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform vec3 uShallow;
      uniform vec3 uDeep;
      varying float vElev;
      varying vec3 vNormalW;
      varying vec3 vViewPos;
      void main() {
        vec3 viewDir = normalize(vViewPos);
        float fresnel = pow(1.0 - max(dot(viewDir, normalize(vNormalW)), 0.0), 3.0);
        vec3 base = mix(uDeep, uShallow, clamp(vElev * 3.0 + 0.55, 0.0, 1.0));
        vec3 color = mix(base, vec3(1.0), fresnel * 0.55);
        gl_FragColor = vec4(color, 0.92);
      }
    `,
  });
  const water = new THREE.Mesh(geo, waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0, -25);
  scene.add(water);
}

function createBanks() {
  const bankGeo = new THREE.BoxGeometry(6, 1.4, 140);
  const matL = new THREE.MeshStandardMaterial({ color: 0x6bb87e, roughness: 1 });
  const matR = matL.clone();
  bankL = new THREE.Mesh(bankGeo, matL);
  bankL.position.set(-7.3, -0.7, -25);
  bankR = new THREE.Mesh(bankGeo, matR);
  bankR.position.set(7.3, -0.7, -25);
  scene.add(bankL, bankR);
}

async function loadAssets() {
  const loader = new GLTFLoader();
  const entries = Object.entries(MODEL_PATHS);
  await Promise.all(entries.map(([key, path]) => new Promise((resolve) => {
    loader.load(encodeURI(path), (gltf) => {
      const root = gltf.scene;
      stripSkinning(root);
      if (key === 'clam') root.rotation.z = Math.PI / 2;
      normalizeModel(root, targetSizeFor(key), key === 'otter' || key === 'boss' || key === 'clam' ? 'y' : 'max');
      assets[key] = root;
      resolve();
    }, undefined, (err) => {
      console.error('failed to load', path, err);
      assets[key] = new THREE.Group();
      resolve();
    });
  })));
}

function targetSizeFor(key) {
  switch (key) {
    case 'otter': return 1.05;
    case 'clam': return 1.05;
    case 'boss': return 4.2;
    case 'trash': return 0.8;
    case 'rock': return 1.7;
    case 'sodacan': return 1.1;
    case 'log': return 2.6;
    case 'poop': return 1.1;
    case 'nature': return 3.4;
    case 'tree': return 2.8;
    default: return 1.0;
  }
}

function stripSkinning(root) {
  const skinned = [];
  root.traverse((o) => { if (o.isSkinnedMesh) skinned.push(o); });
  for (const o of skinned) {
    const plain = new THREE.Mesh(o.geometry, o.material);
    plain.position.copy(o.position);
    plain.rotation.copy(o.rotation);
    plain.scale.copy(o.scale);
    plain.name = o.name;
    o.parent.add(plain);
    o.parent.remove(o);
  }
}

function normalizeModel(root, targetSize, axis = 'max') {
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  const ref = axis === 'y' ? size.y : Math.max(size.x, size.y, size.z);
  const scale = targetSize / (ref || 1);
  root.scale.setScalar(scale);
  const box2 = new THREE.Box3().setFromObject(root);
  root.position.y -= box2.min.y;
  root.position.x -= (box2.min.x + box2.max.x) / 2;
  root.position.z -= (box2.min.z + box2.max.z) / 2;
}

function buildPlayer() {
  playerRig = new THREE.Group();
  playerModel = assets.otter.clone(true);
  playerModel.rotation.y = Math.PI;
  playerBaseScale = playerModel.scale.clone();
  playerRig.add(playerModel);
  playerRig.position.set(LANES[1], 0, PLAYER_Z);
  scene.add(playerRig);
}

function cloneAsset(key) {
  return assets[key].clone(true);
}

// ---------- Input ----------
const keys = new Set();
let padConnected = false;
const padPrev = { left: false, right: false, jump: false, slide: false, attack: false };

const KEY_ALIASES = {
  arrowleft: 'ArrowLeft', a: 'ArrowLeft',
  arrowright: 'ArrowRight', d: 'ArrowRight',
  arrowup: 'ArrowUp', w: 'ArrowUp', ' ': 'ArrowUp', spacebar: 'ArrowUp',
  arrowdown: 'ArrowDown', s: 'ArrowDown',
  f: 'KeyF',
  m: 'KeyM',
  p: 'KeyP', escape: 'KeyP',
  t: 'KeyT',
};

function resolveKey(e) {
  const byCode = { ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown',
    KeyA: 'ArrowLeft', KeyD: 'ArrowRight', KeyW: 'ArrowUp', KeyS: 'ArrowDown', KeyF: 'KeyF', KeyM: 'KeyM', Space: 'ArrowUp',
    KeyP: 'KeyP', Escape: 'KeyP', KeyT: 'KeyT' }[e.code];
  if (byCode) return byCode;
  const key = (e.key || '').toLowerCase();
  return KEY_ALIASES[key] || null;
}

function bindInput() {
  window.addEventListener('keydown', (e) => {
    const action = resolveKey(e);
    if (!action) return;
    e.preventDefault();
    const id = e.code || action;
    if (keys.has(id)) return;
    keys.add(id);
    handleDiscreteAction(action);
  });
  window.addEventListener('blur', () => { keys.clear(); autoPauseIfPlaying(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) autoPauseIfPlaying(); });
  window.addEventListener('keyup', (e) => keys.delete(e.code || resolveKey(e)));

  window.addEventListener('gamepadconnected', () => {
    padConnected = true;
    dom.padStatus.textContent = '패드 연결됨 — 사용 준비 완료';
  });
  window.addEventListener('gamepaddisconnected', () => {
    padConnected = false;
    dom.padStatus.textContent = '연결된 패드 없음';
  });

  const bindTouch = (id, code) => {
    const el = document.getElementById(id);
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); handleDiscreteAction(code); });
  };
  bindTouch('tLeft', 'ArrowLeft');
  bindTouch('tRight', 'ArrowRight');
  bindTouch('tJump', 'ArrowUp');
  bindTouch('tSlide', 'ArrowDown');
  bindTouch('tAttack', 'KeyF');
  if ('ontouchstart' in window) dom.touchControls.classList.add('active');

  // swipe: left/right = lane, up = jump, down = dive, tap = jump
  const cv = document.getElementById('gameCanvas');
  let sw = null;
  cv.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    sw = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false, done: false };
  });
  cv.addEventListener('pointermove', (e) => {
    if (!sw || sw.done) return;
    const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
    if (Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy)) {
      handleDiscreteAction(dx < 0 ? 'ArrowLeft' : 'ArrowRight');
      sw.x = e.clientX; sw.y = e.clientY; sw.moved = true;
    } else if (Math.abs(dy) > 36 && Math.abs(dy) > Math.abs(dx)) {
      handleDiscreteAction(dy < 0 ? 'ArrowUp' : 'ArrowDown');
      sw.moved = true; sw.done = true;
    }
  });
  const endSwipe = () => {
    if (sw && !sw.moved && performance.now() - sw.t < 260) handleDiscreteAction('ArrowUp');
    sw = null;
  };
  cv.addEventListener('pointerup', endSwipe);
  cv.addEventListener('pointercancel', () => { sw = null; });
}

function autoPauseIfPlaying() {
  if ((state.phase === 'playing' || state.phase === 'boss') && !state.paused) setPaused(true);
}

function setPaused(v) {
  if (v && state.phase !== 'playing' && state.phase !== 'boss') return;
  state.paused = v;
  dom.pauseScreen.hidden = !v;
  if (audio.ctx) { if (v) audio.ctx.suspend(); else audio.ctx.resume(); }
}

function toggleAuto() {
  if (state.phase !== 'playing' && state.phase !== 'boss') return;
  state.auto = !state.auto;
  dom.autoBadge.style.display = state.auto ? 'inline-block' : 'none';
}

function handleDiscreteAction(action) {
  if (action === 'KeyM') { toggleMute(); return; }
  if (action === 'KeyP') { setPaused(!state.paused); return; }
  if (action === 'KeyT') { if (!state.paused) toggleAuto(); return; }
  if (state.phase !== 'playing' && state.phase !== 'boss') return;
  if (state.paused || state.auto) return;
  if (action === 'ArrowLeft') moveLane(-1);
  else if (action === 'ArrowRight') moveLane(1);
  else if (action === 'ArrowUp') doJump();
  else if (action === 'ArrowDown') doSlide();
  else if (action === 'KeyF') doAttack();
}

function pollGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = pads && pads[0];
  if (!gp) return;
  const axisX = gp.axes[0] || 0;
  const left = gp.buttons[14]?.pressed || axisX < -0.5;
  const right = gp.buttons[15]?.pressed || axisX > 0.5;
  const jump = gp.buttons[0]?.pressed || gp.buttons[12]?.pressed;
  const slide = gp.buttons[1]?.pressed || gp.buttons[13]?.pressed;
  const attack = gp.buttons[2]?.pressed || gp.buttons[7]?.pressed || gp.buttons[5]?.pressed;

  if (left && !padPrev.left) handleDiscreteAction('ArrowLeft');
  if (right && !padPrev.right) handleDiscreteAction('ArrowRight');
  if (jump && !padPrev.jump) handleDiscreteAction('ArrowUp');
  if (slide && !padPrev.slide) handleDiscreteAction('ArrowDown');
  if (attack && !padPrev.attack) handleDiscreteAction('KeyF');

  padPrev.left = left; padPrev.right = right; padPrev.jump = jump;
  padPrev.slide = slide; padPrev.attack = attack;
}

function moveLane(dir) {
  const next = Math.min(2, Math.max(0, state.lane + dir));
  if (next !== state.lane) {
    state.lastLaneChange = state.time;
    if (!state.jumping) emit(playerRig.position.x, 0.15, PLAYER_Z + 0.4, 5, { color: [0xffffff, 0xbfefff], speed: 1.6, up: 1.6, size: 0.1, life: 0.4 });
  }
  state.lane = next;
}

function doJump() {
  if (state.jumping) return;
  state.sliding = false;      // jumping out of a dive is allowed
  state.slideQueued = false;
  state.jumping = true;
  state.vy = 6.4;
  state.squash = -0.9; // stretch on take-off
  emit(playerRig.position.x, 0.12, PLAYER_Z, 10, { color: [0xffffff, 0x9fe6ff], speed: 2.2, up: 3.2, size: 0.12, life: 0.5 });
  sfx.splash();
}

function doSlide() {
  if (state.sliding || state.slideQueued) return;
  if (state.jumping) {        // dive while airborne: drop fast, start the dive on landing
    state.vy = Math.min(state.vy, -14);
    state.slideQueued = true;
    return;
  }
  startSlide();
}

function startSlide() {
  state.sliding = true;
  state.slideTimer = 0.7;
  emit(playerRig.position.x, 0.2, PLAYER_Z, 8, { color: [0xffffff, 0xcff6ff], speed: 1.4, up: 2.4, size: 0.1, life: 0.6, grav: 2 });
}

function doAttack() {
  if (state.attackCooldown > 0 || state.clams <= 0) return;
  state.clams -= 1;
  state.attackCooldown = 0.22;

  const mesh = cloneAsset('clam');
  mesh.scale.multiplyScalar(0.55);
  mesh.position.set(playerRig.position.x, 0.6 + state.y, PLAYER_Z - 1.1);
  scene.add(mesh);
  projectiles.push({ mesh });
  state.squash = 0.5;               // little recoil
  emit(playerRig.position.x, 0.5 + state.y, PLAYER_Z - 0.9, 5, { color: [0xfff3c8, 0xffd27a], speed: 1.2, up: 0.8, size: 0.09, life: 0.3, grav: 2, drift: false });
  sfx.shoot();
}

function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.mesh.position.z -= PROJECTILE_SPEED * dt;
    p.mesh.rotation.x += dt * 18;

    let hit = false;
    // window widens with the frame step so a shot can never tunnel through at low FPS
    const zWin = 1.0 + (PROJECTILE_SPEED + state.speed) * dt * 0.55;
    for (let j = entities.length - 1; j >= 0; j--) {
      const ent = entities[j];
      if (!ent.destructible) continue;
      if (Math.abs(ent.mesh.position.z - p.mesh.position.z) < zWin && Math.abs(ent.mesh.position.x - p.mesh.position.x) < 1.0) {
        const ex = ent.mesh.position.x, ey = 0.6, ez = ent.mesh.position.z;
        scene.remove(ent.mesh);
        entities.splice(j, 1);
        if (ent.kind === 'trash' || ent.kind === 'sodacan' || ent.kind === 'poop') {
          state.trashCleared += 1;
          popText('쓰레기 치움 +15', 'clean');
        }
        emit(ex, ey, ez, 16, { color: DEBRIS[ent.kind] || 0xffffff, speed: 3.2, up: 4.2, size: 0.17, life: 0.7 });
        emit(ex, ey, ez, 6, { color: [0xbfffd8, 0x9ff0c9], speed: 1.6, up: 2.6, size: 0.1, life: 0.6 });
        state.hitStop = Math.max(state.hitStop, 0.04);
        if (state.motionFx) state.shake = Math.max(state.shake, 0.14);
        sfx.pop();
        hit = true;
        break;
      }
    }
    if (!hit && state.phase === 'boss' && state.boss && state.bossDying <= 0
        && p.mesh.position.z <= BOSS_Z + 1.8 && p.mesh.position.z >= BOSS_Z - 3
        && Math.abs(p.mesh.position.x - state.boss.position.x) < BOSS_HIT_HALF_W) {
      state.bossHp -= 1;
      state.bossHurt = 0.5;
      hit = true;
      sfx.bossHit();
      emit(p.mesh.position.x, 1.4, BOSS_Z + 1.2, 14, { color: [0x44484d, 0x7bd0e0, 0xfff3c8], speed: 3.4, up: 3.6, size: 0.18, life: 0.7 });
      state.hitStop = Math.max(state.hitStop, 0.07);
      if (state.motionFx) state.shake = Math.max(state.shake, 0.22);
      popText(`보스 -1 (${Math.max(0, state.bossHp)}/${BOSS_HP})`, 'near');
      if (state.bossHp <= 0) startBossDeath();
    }

    if (hit) {
      flashAttack();
      scene.remove(p.mesh);
      projectiles.splice(i, 1);
    } else if (p.mesh.position.z < SPAWN_Z - 5) {
      scene.remove(p.mesh);
      projectiles.splice(i, 1);
    }
  }
}

function flashAttack() {
  dom.attackFlash.style.transition = 'none';
  dom.attackFlash.style.opacity = '0.7';
  requestAnimationFrame(() => {
    dom.attackFlash.style.transition = 'opacity .35s';
    dom.attackFlash.style.opacity = '0';
  });
}

// ---------- Spawning ----------
function currentStage() { return STAGES[state.stageIndex]; }

const PATTERN_POOLS = [
  ['single', 'single', 'single', 'double'],
  ['single', 'double', 'double', 'combo'],
  ['single', 'double', 'combo', 'zigzag', 'mixed'],
  ['double', 'combo', 'zigzag', 'mixed', 'mixed'],
];

function randomSingleKind() {
  const roll = Math.random();
  if (roll < 0.22) return 'rock';
  if (roll < 0.42) return 'log';
  if (roll < 0.62) return 'sodacan';
  if (roll < 0.78) return 'poop';
  return 'bridge';
}

// Spawns one obstacle pattern. Returns its extra length in world units
// so the next pattern waits until this one has fully entered.
function spawnObstacleWave() {
  const pool = PATTERN_POOLS[state.stageIndex];
  const pattern = pool[Math.floor(Math.random() * pool.length)];
  const lane = Math.floor(Math.random() * 3);
  const gap = Math.max(10, state.speed * 0.85); // ~0.85s between rows
  switch (pattern) {
    case 'double': { // two lanes blocked, one open
      for (let l = 0; l < 3; l++) if (l !== lane) spawnObstacle(Math.random() < 0.7 ? 'rock' : 'log', l);
      return 0;
    }
    case 'combo': { // jump the log, then dive under the bridge in the same lane
      spawnObstacle('log', lane);
      spawnObstacle('bridge', lane, gap);
      return gap;
    }
    case 'zigzag': { // open lane shifts each row
      let open = lane;
      for (let row = 0; row < 3; row++) {
        for (let l = 0; l < 3; l++) if (l !== open) spawnObstacle('rock', l, row * gap * 1.1);
        const dir = open === 0 ? 1 : open === 2 ? -1 : (Math.random() < 0.5 ? -1 : 1);
        open += dir;
      }
      return gap * 2.2;
    }
    case 'mixed': { // every lane blocked: pick jump lane or dive lane
      const kinds = ['rock', 'log', 'bridge'].sort(() => Math.random() - 0.5);
      for (let l = 0; l < 3; l++) spawnObstacle(kinds[l], l);
      return 0;
    }
    default:
      spawnObstacle(randomSingleKind(), lane);
      return 0;
  }
}

function spawnObstacle(kind, lane, zBack = 0) {
  let mesh;
  let type; // 'side' | 'low' | 'high'
  let destructible = false;
  if (kind === 'bridge') {
    mesh = makeBridgePlaceholder();
    type = 'high';
  } else {
    mesh = cloneAsset(kind);
    if (kind === 'rock') type = 'side';
    else if (kind === 'log') type = 'low';
    else { type = 'low'; destructible = true; }
  }
  mesh.position.set(LANES[lane], 0, SPAWN_Z - zBack);
  scene.add(mesh);
  const ent = { mesh, type, destructible, kind, isObstacle: true };
  if (kind === 'bridge') {
    const sp = makeWarnSprite();
    sp.position.y = 3.1;
    mesh.add(sp);
    ent.warn = sp;
  }
  entities.push(ent);
}

function makeBridgePlaceholder() {
  const g = new THREE.Group();
  const beamMat = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.9 });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.35, 0.6), beamMat);
  beam.position.y = 1.55;
  g.add(beam);
  const legGeo = new THREE.BoxGeometry(0.22, 1.55, 0.22);
  const legL = new THREE.Mesh(legGeo, beamMat); legL.position.set(-0.85, 0.78, 0);
  const legR = new THREE.Mesh(legGeo, beamMat); legR.position.set(0.85, 0.78, 0);
  g.add(legL, legR);
  return g;
}

function spawnClam(lane) {
  const mesh = cloneAsset('clam');
  mesh.position.set(LANES[lane], 0.55, SPAWN_Z - 4 - Math.random() * 6);
  scene.add(mesh);
  entities.push({ mesh, type: 'clam', destructible: false, kind: 'clam', isObstacle: false });
}

function spawnScenery() {
  for (const side of [-1, 1]) {
    const roll = Math.random();
    const key = roll < 0.4 ? 'tree' : roll < 0.75 ? 'nature' : 'rock';
    const mesh = cloneAsset(key);
    const jitter = 0.7 + Math.random() * 0.7;
    mesh.scale.multiplyScalar(jitter);
    mesh.position.set(side * (5.0 + Math.random() * 4.6), 0, SPAWN_Z - Math.random() * 22);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    scene.add(mesh);
    entities.push({ mesh, type: 'scenery', destructible: false, kind: 'scenery', isObstacle: false });
  }
}

const BOSS_Z = -17;
const BOSS_FREQ = [0, 1.1, 1.5, 1.9];
const BOSS_INTERVAL = [0, 1.25, 1.0, 0.85];

function startBossDeath() {
  state.bossDying = 2.2;
  state.slowmoTimer = 0.6;
  state.hitStop = Math.max(state.hitStop, 0.25);
  state.shake = state.motionFx ? 0.8 : 0;
  state.bossWarnLanes = null;
  for (const sp of bossWarnSprites) sp.visible = false;
  // leftover boss trash is cleaned up in the blast
  for (let j = entities.length - 1; j >= 0; j--) {
    const ent = entities[j];
    if (!ent.isBossProjectile) continue;
    emit(ent.mesh.position.x, 0.5, ent.mesh.position.z, 8, { color: DEBRIS.trash, speed: 2.6, up: 3.2, size: 0.15, life: 0.6 });
    scene.remove(ent.mesh);
    entities.splice(j, 1);
    state.trashCleared += 1;
  }
  popText('쓰레기 보스 정화!', 'boss');
  sfx.bossDie();
}

function updateBossDeath(dt) {
  const b = state.boss;
  state.bossDying -= dt;
  const k = Math.max(0, state.bossDying / 2.2);
  b.position.x += (Math.random() - 0.5) * 0.25;
  b.scale.setScalar(state.bossBaseScale * (0.35 + 0.65 * k));
  b.rotation.y += dt * (6 + (1 - k) * 10);
  if (Math.random() < 0.55) {
    emit(b.position.x + (Math.random() - 0.5) * 2, 0.8 + Math.random() * 1.6, BOSS_Z + 0.5, 6,
      { color: [0x44484d, 0xff8a65, 0xffd27a, 0xffffff], speed: 3.6, up: 4, size: 0.2, life: 0.8 });
  }
  if (state.bossDying <= 0) {
    emit(b.position.x, 1.2, BOSS_Z + 0.5, 60, { color: [0xbfffd8, 0x9ff0c9, 0xffffff, 0xffd27a], speed: 6, up: 6, size: 0.22, life: 1.1 });
    winGame();
  }
}

function spawnBoss() {
  const mesh = cloneAsset('boss');
  mesh.position.set(0, 0, BOSS_Z);
  scene.add(mesh);
  state.boss = mesh;
  state.bossBaseScale = mesh.scale.x;
  state.bossHp = BOSS_HP;
  state.bossAttackTimer = 1.6;
  state.bossWarnLanes = null;
  state.bossPhase = 1; state.bossAng = 0; state.bossHurt = 0; state.bossDying = 0;
  state.shake = state.motionFx ? 0.5 : 0;
  popText('보스 등장!', 'boss');
  sfx.warn();
  dom.bossBar.classList.add('show');
}

function spawnTrashProjectile(lane) {
  if (lane === undefined) lane = Math.floor(Math.random() * 3);
  const mesh = cloneAsset('trash');
  const originX = state.boss ? state.boss.position.x : LANES[lane];
  mesh.position.set(originX, 0.4, BOSS_Z + 2);
  scene.add(mesh);
  entities.push({ mesh, type: 'low', destructible: true, kind: 'trash', isObstacle: true, isBossProjectile: true, targetX: LANES[lane] });
}

function spawnStreak() {
  const mesh = new THREE.Mesh(sharedStreak.geo, sharedStreak.mat);
  mesh.rotation.x = -Math.PI / 2;
  const divider = Math.random() < 0.5 ? -1.1 : 1.1;
  mesh.position.set(divider, 0.04, SPAWN_Z);
  scene.add(mesh);
  entities.push({ mesh, type: 'streak', destructible: false, kind: 'streak', isObstacle: false, speedMul: 1.6 });
}

// ---------- Game flow ----------
function bindUI() {
  dom.startBtn.addEventListener('click', () => { state.auto = false; startGame(); });
  dom.autoBtn.addEventListener('click', () => { state.auto = true; startGame(); });
  dom.pauseBtn.addEventListener('click', () => setPaused(true));
  dom.resumeBtn.addEventListener('click', () => setPaused(false));
  dom.homeBtnPause.addEventListener('click', goHome);
  dom.restartBtnWin.addEventListener('click', resetGame);
  dom.restartBtnOver.addEventListener('click', resetGame);
  dom.homeBtnWin.addEventListener('click', goHome);
  dom.homeBtnOver.addEventListener('click', goHome);
  dom.muteBtn.addEventListener('click', toggleMute);
  dom.modeBtns.forEach((btn) => btn.addEventListener('click', () => {
    dom.modeBtns.forEach((b) => b.classList.toggle('selected', b === btn));
    state.mode = btn.dataset.mode;
  }));
}

function startGame() {
  state.motionFx = dom.motionOpt.checked;
  audio.init();
  dom.startScreen.hidden = true;
  resetGame();
}

function goHome() {
  state.auto = false;
  state.paused = false;
  state.phase = 'start';
  dom.pauseScreen.hidden = true;
  dom.hud.classList.remove('active');
  dom.bossBar.classList.remove('show');
  dom.winScreen.hidden = true;
  dom.overScreen.hidden = true;
  dom.startScreen.hidden = false;
  dom.dangerVignette.classList.remove('on');
  dom.bestStart.textContent = state.best > 0 ? `내 최고 점수 ${state.best}` : '';
  if (audio.ctx) audio.ctx.resume();
}

// Records the best score (manual play only) and returns true on a new record.
function recordScore() {
  const s = Math.floor(state.score);
  if (state.auto || s <= state.best) return false;
  state.best = s;
  saveBest(s);
  return true;
}

function resetGame() {
  for (const ent of entities) scene.remove(ent.mesh);
  entities.length = 0;
  for (const p of projectiles) scene.remove(p.mesh);
  projectiles.length = 0;
  if (state.boss) { scene.remove(state.boss); state.boss = null; }
  const mode = MODES[state.mode] || MODES.challenge;
  for (const sp of bossWarnSprites) sp.visible = false;
  Object.assign(state, {
    maxLives: mode.lives, baseSpeed: STAGES[0].speed, speedMul: 1, slowTimer: 0,
    surge: SURGE_FLOOR, time: 0, lastLaneChange: -10, lastNear: -10, slowmoTimer: 0, slowmoCd: 0,
    bonus: 0, combo: 0, comboTimer: 0, bossWarnLanes: null, renderedLives: -1,
    phase: 'playing', distance: 0, score: 0, clams: 0, lives: mode.lives, invuln: 0,
    lane: 1, y: 0, vy: 0, jumping: false, sliding: false, slideTimer: 0,
    attackCooldown: 0, stageIndex: 0, spawnTimer: 0, sceneryTimer: 0,
    clamTimer: 0, streakTimer: 0, shake: 0,
    bossHp: BOSS_HP, bossAttackTimer: 0, bossT: 0, trashCleared: 0, speed: STAGES[0].speed,
    paused: false, hitStop: 0, autoCd: 0, bossDying: 0, bossPhase: 1, bossAng: 0, bossHurt: 0, squash: 0, splashTimer: 0, slideQueued: false,
  });
  clearParticles();
  dom.pauseScreen.hidden = true;
  dom.autoBadge.style.display = state.auto ? 'inline-block' : 'none';
  playerRig.position.set(LANES[1], 0, PLAYER_Z);
  camera.fov = 62; camera.updateProjectionMatrix();
  mudMesh.visible = mode.surge;
  placeMud(SURGE_FLOOR);
  dom.surgeWrap.style.display = mode.surge ? '' : 'none';
  dom.surgeEdge.style.opacity = '0';
  dom.surgeEdge.classList.remove('warn');
  dom.dangerVignette.classList.remove('on');
  dom.comboBadge.classList.remove('show');
  dom.popLayer.innerHTML = '';
  dom.bossBar.classList.remove('show');
  dom.winScreen.hidden = true;
  dom.overScreen.hidden = true;
  dom.hud.classList.add('active');
  applyStageVisuals(STAGES[0]);
  showStageBanner(STAGES[0]);
}

let bannerTimeout = null;
function showStageBanner(stage) {
  dom.stName.textContent = stage.name;
  dom.stDesc.textContent = stage.desc;
  dom.stFact.textContent = stage.fact ? '🦦 ' + stage.fact : '';
  dom.stageBanner.classList.add('show');
  clearTimeout(bannerTimeout);
  bannerTimeout = setTimeout(() => dom.stageBanner.classList.remove('show'), 3400);
}

function popText(text, cls = '') {
  const el = document.createElement('div');
  el.className = 'pop ' + cls;
  el.textContent = text;
  dom.popLayer.appendChild(el);
  setTimeout(() => el.remove(), 950);
}

function applyStageVisuals(stage) {
  waterUniforms.uShallow.value.setHex(stage.water[0]);
  waterUniforms.uDeep.value.setHex(stage.water[1]);
  scene.fog.color.setHex(stage.fog);
  scene.background.setHex(stage.sky);
}

function loseLife(reason) {
  if (state.invuln > 0 || state.bossDying > 0) return;
  state.lives -= 1;
  state.invuln = 1.5;
  state.hitStop = 0.09;
  emit(playerRig.position.x, 0.8, PLAYER_Z, 18, { color: [0xff7a5c, 0xffd27a, 0xffffff], speed: 3.4, up: 4, size: 0.16, life: 0.6 });
  state.shake = state.motionFx ? 0.45 : 0;
  state.slowTimer = 1.4;          // otter loses momentum...
  state.combo = 0;
  if (MODES[state.mode].surge) state.surge = Math.min(1, state.surge + 0.28); // ...so the mud catches up
  sfx.hit();
  popText('쿵!', 'hit');
  if (state.lives <= 0) {
    gameOver(reason);
  }
}

function nearMiss() {
  if (state.time - state.lastNear < 0.25) return;
  state.lastNear = state.time;
  state.bonus += 10;
  if (MODES[state.mode].surge) state.surge = Math.max(SURGE_FLOOR, state.surge - 0.07);
  popText('아슬아슬! +10', 'near');
  sfx.whoosh();
  if (state.motionFx && state.slowmoCd <= 0) { state.slowmoTimer = 0.2; state.slowmoCd = 1.6; }
}

function collectClam() {
  state.clams += 1;
  emit(playerRig.position.x, 0.7 + state.y, PLAYER_Z, 7, { color: [0xfff3c8, 0xffd27a, 0xffffff], speed: 1.8, up: 2.6, size: 0.1, life: 0.45, grav: 5 });
  state.combo = state.comboTimer > 0 ? state.combo + 1 : 1;
  state.comboTimer = 1.4;
  const mult = comboMult();
  state.bonus += 2 * mult;
  sfx.clam(state.combo);
}

function comboMult() { return Math.min(3, 1 + Math.floor((state.combo - 1) / 4)); }

function gameOver(reason) {
  state.phase = 'over';
  sfx.over();
  dom.dangerVignette.classList.remove('on');
  for (const sp of bossWarnSprites) sp.visible = false;
  dom.hud.classList.remove('active');
  dom.overReason.textContent = reason || '다시 도전해서 영산강 합류부까지 헤엄쳐 보세요.';
  const record = recordScore();
  document.getElementById('overScore').textContent = Math.floor(state.score) + (record ? ' 🎉 새 기록!' : '');
  document.getElementById('overBest').textContent = state.auto ? '자동 플레이는 기록 안 됨' : state.best;
  document.getElementById('overDist').textContent = Math.floor(state.distance) + 'm';
  dom.overScreen.hidden = false;
}

function winGame() {
  state.phase = 'win';
  sfx.win();
  dom.dangerVignette.classList.remove('on');
  for (const sp of bossWarnSprites) sp.visible = false;
  dom.hud.classList.remove('active');
  dom.bossBar.classList.remove('show');
  const record = recordScore();
  document.getElementById('winScore').textContent = Math.floor(state.score) + (record ? ' 🎉 새 기록!' : '');
  document.getElementById('winBest').textContent = state.auto ? '자동 플레이는 기록 안 됨' : state.best;
  document.getElementById('winDist').textContent = Math.floor(state.distance) + 'm';
  document.getElementById('winTrash').textContent = state.trashCleared + '개';
  dom.winScreen.hidden = false;
}

// ---------- Update loop ----------
let lastW = 0, lastH = 0;
function ensureSize() {
  const w = window.innerWidth, h = window.innerHeight;
  if (w > 0 && h > 0 && (w !== lastW || h !== lastH)) {
    lastW = w; lastH = h;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
}

function tick() {
  ensureSize();
  const dt = Math.min(clock.getDelta(), 0.05);
  pollGamepad();
  frame(dt);
  renderer.render(scene, camera);
}

// One simulation frame. Shared by the render loop and the headless test hook.
function frame(dt) {
  const running = state.phase === 'playing' || state.phase === 'boss';
  let ts = 1;
  if (state.paused) ts = 0;
  else if (state.hitStop > 0) { state.hitStop -= dt; ts = 0; }       // hit stop: freeze the world, keep the camera shaking
  else if (state.slowmoTimer > 0) { state.slowmoTimer -= dt; ts = 0.4; }
  if (!state.paused) {
    waterUniforms.uTime.value += dt * (ts > 0 ? 1 : 0.15);
    mudUniforms.uTime.value += dt * (ts > 0 ? 1 : 0.15);
    if (state.slowmoCd > 0) state.slowmoCd -= dt;
  }
  if (running && ts > 0) updateGame(dt * ts);
  updateParticles(dt * ts, running && ts > 0 ? state.speed : 0);
  if (!state.paused) updatePlayerVisual(dt);
}

function updateGame(dt) {
  state.time += dt;
  state.attackCooldown = Math.max(0, state.attackCooldown - dt);
  if (state.invuln > 0) state.invuln -= dt;
  if (state.slowTimer > 0) state.slowTimer -= dt;
  if (state.comboTimer > 0) { state.comboTimer -= dt; if (state.comboTimer <= 0) state.combo = 0; }

  // speed: keeps climbing inside a stage, eases into the next stage
  const st = currentStage();
  const target = st.speed + Math.min(RAMP_MAX, (state.distance - st.dist) * RAMP_PER_M);
  state.baseSpeed += (target - state.baseSpeed) * Math.min(1, dt * 0.9);
  const mulTarget = state.slowTimer > 0 ? 0.6 : 1;
  state.speedMul += (mulTarget - state.speedMul) * Math.min(1, dt * (mulTarget < 1 ? 8 : 1.5));
  state.speed = state.baseSpeed * state.speedMul;

  // stage progression
  state.distance += state.speed * dt;
  const nextIdx = STAGES.findIndex((s, i) => i > state.stageIndex && state.distance >= s.dist);
  if (nextIdx !== -1) {
    state.stageIndex = nextIdx;
    applyStageVisuals(STAGES[nextIdx]);
    showStageBanner(STAGES[nextIdx]);
    state.spawnTimer = Math.max(state.spawnTimer, 1.9); // short breather to read the banner
    sfx.stage();
  }

  // muddy current chase
  if (MODES[state.mode].surge) {
    const drift = state.slowTimer > 0 ? 0.12 : -0.04;
    state.surge = Math.min(1, Math.max(SURGE_FLOOR, state.surge + drift * dt));
    placeMud(state.surge);
    mudUniforms.uPower.value = state.surge;
    const edge = Math.max(0, (state.surge - 0.3) / 0.7);
    dom.surgeEdge.style.opacity = String(edge);
    dom.surgeEdge.classList.toggle('warn', state.surge > 0.6);
    dom.surgeFill.style.width = (state.surge * 100) + '%';
    if (state.surge >= 1) {
      gameOver('흙탕물에 따라잡혔어요. 부딪히면 느려져서 흙탕물이 다가와요!');
      return;
    }
  }

  if (state.phase === 'playing' && state.distance >= BOSS_TRIGGER_DIST) {
    state.phase = 'boss';
    spawnBoss();
  }

  state.score = Math.floor(state.distance) + state.bonus + state.trashCleared * 15;

  if (state.auto && state.bossDying <= 0) autoPilot(dt);

  // lane movement
  const targetX = LANES[state.lane];
  playerRig.position.x += (targetX - playerRig.position.x) * Math.min(1, dt * 10);

  // jump physics
  if (state.jumping) {
    state.vy -= 18 * dt;
    state.y += state.vy * dt;
    if (state.y <= 0) {
      state.y = 0; state.vy = 0; state.jumping = false;
      if (state.slideQueued) { state.slideQueued = false; startSlide(); }
      state.squash = 1; // landing squash + splash ring
      emit(playerRig.position.x, 0.1, PLAYER_Z, 14, { color: [0xffffff, 0x9fe6ff, 0xcff6ff], speed: 2.8, up: 2.4, size: 0.13, life: 0.5 });
      sfx.splash();
    }
  }
  // wake: little droplets trailing behind the swimming otter
  state.splashTimer -= dt;
  if (state.splashTimer <= 0) {
    state.splashTimer = state.sliding ? 0.04 : 0.06;
    emit(playerRig.position.x + (Math.random() - 0.5) * 0.5, state.sliding ? 0.15 : 0.1 + state.y, PLAYER_Z + 0.7, state.sliding ? 2 : 1,
      { color: [0xffffff, 0xcff6ff], speed: 0.6, up: 1.2, size: 0.09, life: 0.5, grav: 4 });
  }
  // slide timer
  if (state.sliding) {
    state.slideTimer -= dt;
    if (state.slideTimer <= 0) state.sliding = false;
  }

  if (state.phase === 'playing') {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      const extra = spawnObstacleWave();
      state.spawnTimer = currentStage().spawnEvery + extra / state.speed + Math.random() * 0.3;
    }
  }
  state.sceneryTimer -= dt;
  if (state.sceneryTimer <= 0) { spawnScenery(); state.sceneryTimer = 0.5; }

  if (state.phase === 'playing' || state.phase === 'boss') {
    state.clamTimer -= dt;
    if (state.clamTimer <= 0) {
      spawnClam(Math.floor(Math.random() * 3));
      state.clamTimer = 0.45 + Math.random() * 0.35;
    }
  }

  state.streakTimer -= dt;
  if (state.streakTimer <= 0) { spawnStreak(); state.streakTimer = 0.1; }

  // boss behavior — 3 phases: weave + 2-lane throws -> faster -> frenzy with 3-lane volleys
  if (state.phase === 'boss' && state.boss) {
    state.bossT += dt;
    if (state.bossHurt > 0) state.bossHurt = Math.max(0, state.bossHurt - dt * 2.5);
    if (state.bossDying > 0) {
      updateBossDeath(dt);
    } else {
      const ratio = state.bossHp / BOSS_HP;
      const phase = ratio > 0.6 ? 1 : ratio > 0.3 ? 2 : 3;
      if (phase !== state.bossPhase) {
        state.bossPhase = phase;
        popText(phase === 2 ? '보스가 화났다!' : '보스 폭주! 점프로 피하세요', 'boss');
        sfx.phase();
        if (state.motionFx) state.shake = Math.max(state.shake, 0.45);
        emit(state.boss.position.x, 1.6, BOSS_Z + 1, 24, { color: [0x44484d, 0xff8a65, 0xffd27a], speed: 4.4, up: 4.4, size: 0.2, life: 0.8 });
        state.bossAttackTimer = Math.min(state.bossAttackTimer, 0.9);
      }
      state.bossAng += dt * BOSS_FREQ[phase];
      state.boss.position.x = Math.sin(state.bossAng) * 2.8;
      state.bossAttackTimer -= dt;
      // telegraph: show warning signs over the target lanes before the throw
      if (!state.bossWarnLanes && state.bossAttackTimer <= 0.55) {
        const order = [0, 1, 2].sort(() => Math.random() - 0.5);
        state.bossWarnLanes = order.slice(0, phase === 3 ? 3 : 2);
        state.bossWarnLanes.forEach((l, i) => {
          bossWarnSprites[i].position.set(LANES[l], 2.0, -7);
          bossWarnSprites[i].visible = true;
        });
        sfx.warn();
      }
      const warning = !!state.bossWarnLanes;
      const pulse = warning ? 1 + 0.12 * Math.abs(Math.sin(state.bossT * 18)) : 1;
      state.boss.scale.setScalar(state.bossBaseScale * pulse * (1 + state.bossHurt * 0.5));
      state.boss.rotation.z = Math.sin(state.bossT * 3) * 0.05 + state.bossHurt * 0.4;
      if (warning) bossWarnSprites.forEach((sp) => { sp.material.opacity = 0.55 + 0.45 * Math.abs(Math.sin(state.bossT * 14)); });
      if (state.bossAttackTimer <= 0) {
        for (const l of state.bossWarnLanes || []) spawnTrashProjectile(l);
        for (const sp of bossWarnSprites) sp.visible = false;
        state.bossWarnLanes = null;
        state.bossAttackTimer = BOSS_INTERVAL[phase];
      }
    }
    dom.bossFill.style.width = Math.max(0, (state.bossHp / BOSS_HP) * 100) + '%';
  }

  updateProjectiles(dt);

  // move entities & collisions
  for (let i = entities.length - 1; i >= 0; i--) {
    const ent = entities[i];
    ent.mesh.position.z += state.speed * (ent.speedMul || 1) * dt;
    if (ent.type !== 'scenery' && ent.kind !== 'bridge' && ent.kind !== 'streak') ent.mesh.rotation.y += dt * 0.6;
    if (ent.targetX !== undefined) {
      ent.mesh.position.x += (ent.targetX - ent.mesh.position.x) * Math.min(1, dt * 2.5);
    }

    // blinking warning sign + beep when a bridge approaches
    if (ent.warn) {
      const z = ent.mesh.position.z;
      ent.warn.visible = z < -9 && Math.floor(state.time * 7) % 2 === 0;
      if (!ent.beeped && z > -48) { ent.beeped = true; sfx.warn(); }
    }

    // near miss: obstacle just slipped past without hitting
    if (ent.isObstacle && !ent.passed && ent.mesh.position.z > PLAYER_Z + 0.9) {
      ent.passed = true;
      const dxp = Math.abs(ent.mesh.position.x - playerRig.position.x);
      if (ent.dodged || (dxp < 2.7 && state.time - state.lastLaneChange < 0.6)) nearMiss();
    }

    if (ent.mesh.position.z > DESPAWN_Z) {
      scene.remove(ent.mesh);
      entities.splice(i, 1);
      continue;
    }

    if (!ent.isObstacle && ent.kind !== 'clam') continue;

    const dz = Math.abs(ent.mesh.position.z - PLAYER_Z);
    const dx = Math.abs(ent.mesh.position.x - playerRig.position.x);
    if (dz < 0.85 && dx < 0.95) {
      if (ent.kind === 'clam') {
        collectClam();
        scene.remove(ent.mesh);
        entities.splice(i, 1);
        continue;
      }
      const avoided =
        (ent.type === 'low' && state.jumping) ||
        (ent.type === 'high' && state.sliding);
      if (avoided) ent.dodged = true;
      else {
        emit(ent.mesh.position.x, 0.6, ent.mesh.position.z, 14, { color: DEBRIS[ent.kind] || 0xffffff, speed: 3, up: 3.6, size: 0.16, life: 0.6 });
        scene.remove(ent.mesh);
        entities.splice(i, 1);
        loseLife(ent.isBossProjectile ? '보스의 쓰레기에 맞았어요.' : '장애물에 부딪혔어요.');
        if (state.phase === 'over') return;
      }
    }
  }

  document.getElementById('scoreVal').textContent = state.score;
  document.getElementById('distVal').textContent = Math.floor(state.distance);
  document.getElementById('clamVal').textContent = state.clams;
  dom.speedFill.style.width = Math.min(100, Math.max(4, ((state.speed - 9) / (TOP_SPEED - 9)) * 100)) + '%';
  if (state.combo >= 2) {
    dom.comboBadge.textContent = `조개 콤보 ${state.combo}` + (comboMult() > 1 ? ` · ×${comboMult()}` : '');
    dom.comboBadge.classList.add('show');
  } else dom.comboBadge.classList.remove('show');
  dom.dangerVignette.classList.toggle('on', state.lives === 1);
  if (state.renderedLives !== state.lives) renderHearts();
}

function renderHearts() {
  state.renderedLives = state.lives;
  dom.hearts.innerHTML = '';
  for (let i = 0; i < state.maxLives; i++) {
    const h = document.createElement('div');
    h.className = 'heart' + (i < state.lives ? '' : ' off');
    dom.hearts.appendChild(h);
  }
}

function updatePlayerVisual(dt) {
  animT += dt;
  playerRig.position.y = state.y;
  const running = state.phase === 'playing' || state.phase === 'boss';
  const swim = running ? Math.sin(animT * 9) : Math.sin(animT * 2) * 0.4;       // paddling rhythm
  const targetY = state.sliding ? -0.85 : swim * 0.05;
  // nose up while rising, down while falling, dive angle when sliding
  const targetTilt = state.sliding ? -0.45 : state.jumping ? Math.max(-0.45, Math.min(0.4, state.vy * 0.06)) : swim * 0.05;
  // bank into the turn
  const lateral = (LANES[state.lane] - playerRig.position.x);
  const targetRoll = Math.max(-0.5, Math.min(0.5, lateral * 0.22)) + swim * 0.07;
  playerModel.position.y += (targetY - playerModel.position.y) * Math.min(1, dt * 12);
  playerModel.rotation.x += (targetTilt - playerModel.rotation.x) * Math.min(1, dt * 12);
  playerModel.rotation.z += (targetRoll - playerModel.rotation.z) * Math.min(1, dt * 14);
  // squash & stretch (jump take-off stretches, landing squashes, shooting recoils)
  state.squash += (0 - state.squash) * Math.min(1, dt * 9);
  if (playerBaseScale) {
    const sy = 1 - 0.22 * state.squash, sxz = 1 + 0.12 * state.squash;
    playerModel.scale.set(playerBaseScale.x * sxz, playerBaseScale.y * sy, playerBaseScale.z * sxz);
  }

  if (state.invuln > 0) {
    playerModel.visible = Math.floor(state.invuln * 14) % 2 === 0;
  } else {
    playerModel.visible = true;
  }

  const speedT = Math.min(1, Math.max(0, (state.baseSpeed - 12) / (TOP_SPEED - 12)));
  camera.position.x += (playerRig.position.x * 0.6 - (camera.position.x - 0)) * Math.min(1, dt * 4);
  camera.position.y = (state.motionFx ? 4.2 - speedT * 0.55 : 4.2) + state.y * 0.2;
  camera.lookAt(playerRig.position.x * 0.4, 1.1 + state.y * 0.3, -6);

  if (state.shake > 0) {
    state.shake = Math.max(0, state.shake - dt * 1.8);
    const s = state.shake * 0.4;
    camera.position.x += (Math.random() - 0.5) * s;
    camera.position.y += (Math.random() - 0.5) * s;
  }

  const targetFov = state.motionFx ? 62 + speedT * 14 + (state.slowmoTimer > 0 ? -3 : 0) : 62;
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 2.5);
    camera.updateProjectionMatrix();
  }
}

// ---------- Autoplay (test mode) ----------
// A bot that plays by the real rules: it only calls the same moveLane / doJump / doSlide / doAttack
// a human would, and every hit is still decided by the normal collision code.
function laneOfX(x) {
  let best = 0;
  for (let l = 1; l < 3; l++) if (Math.abs(LANES[l] - x) < Math.abs(LANES[best] - x)) best = l;
  return best;
}

function autoPilot(dt) {
  state.autoCd -= dt;
  const sp = state.speed;
  const horizon = Math.max(16, sp * 1.1);
  const inBoss = state.phase === 'boss' && state.boss;
  const info = [0, 1, 2].map(() => ({ rock: 99, low: 99, high: 99, clam: 99, trashD: 99 }));
  for (const e of entities) {
    if (!e.isObstacle && e.kind !== 'clam') continue;
    const d = PLAYER_Z - e.mesh.position.z;       // >0: still ahead of the otter
    if (d < -1.0 || d > horizon + 8) continue;
    const l = laneOfX(e.targetX !== undefined ? e.targetX : e.mesh.position.x);
    const slot = info[l];
    if (e.kind === 'clam') slot.clam = Math.min(slot.clam, d);
    else if (e.type === 'side') slot.rock = Math.min(slot.rock, d);
    else if (e.type === 'low') slot.low = Math.min(slot.low, d);
    else if (e.type === 'high') slot.high = Math.min(slot.high, d);
    if (e.destructible && d > 2) slot.trashD = Math.min(slot.trashD, d);
  }

  // where the boss will be when a clam fired now reaches it
  let bossX = 0;
  if (inBoss) bossX = Math.sin(state.bossAng + BOSS_FREQ[state.bossPhase] * 0.42) * 2.8;

  // choose the best lane
  const cost = (l) => {
    const s = info[l];
    let c = Math.abs(l - state.lane) * 0.3;
    if (s.rock < horizon) c += 100 - s.rock;
    c += (s.low < horizon ? (inBoss ? 0.6 : 3) : 0) + (s.high < horizon ? 3 : 0);
    if (s.low < horizon && s.high < horizon) c += 4;
    if (s.clam < horizon) c -= 1.2;
    if (inBoss && state.clams > 0) c += Math.abs(LANES[l] - bossX) * 1.1;
    return c;
  };
  // once a jump/dive obstacle is close, stay committed to the lane (don't wander off after a clam)
  const cur = info[state.lane];
  const commitD = sp * 0.6 + 2;
  const committed = (cur.low < commitD || cur.high < commitD) && cur.rock >= horizon;
  if (state.autoCd <= 0 && !committed) {
    let bestL = state.lane;
    for (let l = 0; l < 3; l++) if (cost(l) < cost(bestL) - 0.05) bestL = l;
    if (bestL !== state.lane) {
      const step = Math.sign(bestL - state.lane);
      const next = state.lane + step;
      // never step into a lane whose rock is about to arrive
      if (info[next].rock > sp * 0.32 + 2.2 || info[next].rock < -0.5) {
        moveLane(step);
        state.autoCd = 0.14;
      }
    }
  }

  const here = info[state.lane];
  if (here.low < 0.85 + sp * 0.17 && here.low > -0.6 && !state.jumping) doJump();
  else if (here.high < 0.85 + sp * 0.15 && here.high > -0.6 && !state.sliding) doSlide();

  // shooting
  if (state.attackCooldown <= 0 && state.clams > 0) {
    if (inBoss) {
      if (Math.abs(bossX - playerRig.position.x) < 1.4) doAttack();
    } else if (state.clams >= 6 && here.trashD < 20) {
      doAttack();
    }
  }
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ---------- Audio (WebAudio synth, no files needed) ----------
const audio = {
  ctx: null, master: null, muted: false, noise: null,
  nextTime: 0, step: 0, timer: null,
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 0.5;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
  },
  bpm() {
    if (state.phase === 'boss') return 156;
    return [112, 122, 134, 146][state.stageIndex] || 120;
  },
  schedule() {
    const ctx = this.ctx;
    while (this.nextTime < ctx.currentTime + 0.12) {
      if (state.phase === 'playing' || state.phase === 'boss') this.playStep(this.step % 16, this.nextTime);
      this.nextTime += 60 / this.bpm() / 4;
      this.step++;
    }
  },
  playStep(s, t) {
    if (s === 0 || s === 8 || (state.phase === 'boss' && (s === 4 || s === 12))) this.kick(t);
    if (s % 4 === 2) this.hat(t, 0.06);
    const roots = [[110, 131, 147, 165], [98, 117, 131, 147], [123, 147, 165, 185], [104, 123, 139, 156]];
    const scale = roots[state.stageIndex] || roots[0];
    const pattern = [0, -1, -1, 2, -1, -1, 1, -1, 0, -1, 3, -1, 2, -1, 1, -1];
    const n = pattern[s];
    if (n >= 0) this.tone(scale[n], t, 0.14, 'triangle', 0.12);
    if (state.lives === 1 && (s === 0 || s === 3)) this.tone(52, t, 0.18, 'sine', 0.45); // heartbeat
  },
  env(t, peak, dur) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(this.master);
    return g;
  },
  tone(freq, t, dur, type = 'sine', vol = 0.2, slideTo) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    o.connect(this.env(t, vol, dur));
    o.start(t); o.stop(t + dur + 0.02);
  },
  noiseHit(t, dur, vol, freq = 1200, type = 'bandpass', sweepTo) {
    if (!this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    src.connect(f); f.connect(this.env(t, vol, dur));
    src.start(t); src.stop(t + dur + 0.02);
  },
  kick(t) { this.tone(140, t, 0.16, 'sine', 0.5, 45); },
  hat(t, v) { this.noiseHit(t, 0.04, v, 7000, 'highpass'); },
};

function now() { return audio.ctx ? audio.ctx.currentTime : 0; }
const sfx = {
  hit() { const t = now(); audio.noiseHit(t, 0.25, 0.6, 400, 'lowpass'); audio.tone(180, t, 0.3, 'sawtooth', 0.25, 50); },
  clam(combo) { audio.tone(660 * Math.pow(2, Math.min(combo - 1, 12) / 12), now(), 0.09, 'square', 0.08); },
  whoosh() { audio.noiseHit(now(), 0.28, 0.35, 600, 'bandpass', 3500); },
  warn() { const t = now(); audio.tone(880, t, 0.08, 'square', 0.1); audio.tone(880, t + 0.12, 0.08, 'square', 0.1); },
  pop() { audio.tone(520, now(), 0.1, 'triangle', 0.18, 980); },
  bossHit() { audio.tone(220, now(), 0.15, 'square', 0.15, 110); },
  stage() { const t = now(); [523, 659, 784, 1047].forEach((f, i) => audio.tone(f, t + i * 0.08, 0.14, 'triangle', 0.14)); },
  over() { const t = now(); [392, 330, 262, 196].forEach((f, i) => audio.tone(f, t + i * 0.16, 0.22, 'triangle', 0.16)); },
  splash() { audio.noiseHit(now(), 0.16, 0.16, 2400, 'bandpass', 900); },
  shoot() { audio.tone(740, now(), 0.09, 'triangle', 0.12, 1250); },
  phase() { const t = now(); audio.tone(150, t, 0.4, 'sawtooth', 0.22, 70); audio.noiseHit(t, 0.35, 0.3, 500, 'lowpass', 120); },
  bossDie() {
    const t = now();
    audio.noiseHit(t, 1.1, 0.6, 600, 'lowpass', 70);
    [220, 165, 110, 82].forEach((f, i) => audio.tone(f, t + i * 0.12, 0.35, 'sawtooth', 0.2, f * 0.5));
  },
  win() { const t = now(); [523, 659, 784, 1047, 1319].forEach((f, i) => audio.tone(f, t + i * 0.12, 0.25, 'triangle', 0.16)); },
};

function toggleMute() {
  audio.muted = !audio.muted;
  if (audio.master) audio.master.gain.value = audio.muted ? 0 : 0.5;
  dom.muteBtn.textContent = audio.muted ? '♪ 소리 꺼짐' : '♪ 소리 켜짐';
  dom.muteBtn.classList.toggle('off', audio.muted);
}

// ---------- Debug / test hook (headless simulation) ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
window.__hwg = {
  state, entities,
  ready: () => !!(playerRig && assets.otter),
  seed(s) { Math.random = mulberry32(s); },
  newGame(mode = 'challenge', auto = true) {
    state.mode = mode; state.auto = auto; state.motionFx = true;
    dom.startScreen.hidden = true;
    resetGame();
  },
  // advance the real simulation without rendering; stops at win / over
  step(n = 1, dt = 1 / 60) {
    for (let i = 0; i < n; i++) {
      frame(dt);
      if (state.phase === 'win' || state.phase === 'over') break;
    }
    return state.phase;
  },
  render() { renderer.render(scene, camera); },
};

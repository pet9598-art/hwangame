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
};

let renderer, scene, camera, clock;
let waterMat, waterUniforms;
let playerRig, playerModel;
let bankL, bankR;
let mudMesh, mudUniforms, warnTex;
const bossWarnSprites = [];
const entities = []; // {mesh, x, type, destructible, kind}
const projectiles = []; // {mesh} — player-fired clams
const assets = {};

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
};

init();

async function init() {
  initRenderer();
  initScene();
  await loadAssets();
  buildPlayer();
  dom.startBtn.textContent = '게임 시작';
  dom.startBtn.disabled = false;
  bindUI();
  bindInput();
  window.addEventListener('resize', onResize);
  clock = new THREE.Clock();
  renderer.setAnimationLoop(tick);
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
  for (let i = 0; i < 2; i++) {
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
    case 'boss': return 2.6;
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
};

function resolveKey(e) {
  const byCode = { ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown',
    KeyA: 'ArrowLeft', KeyD: 'ArrowRight', KeyW: 'ArrowUp', KeyS: 'ArrowDown', KeyF: 'KeyF', KeyM: 'KeyM', Space: 'ArrowUp' }[e.code];
  if (byCode) return byCode;
  const key = (e.key || '').toLowerCase();
  return KEY_ALIASES[key] || null;
}

function bindInput() {
  window.addEventListener('keydown', (e) => {
    const action = resolveKey(e);
    if (!action) return;
    const id = e.code || action;
    if (keys.has(id)) return;
    keys.add(id);
    handleDiscreteAction(action);
  });
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
}

function handleDiscreteAction(action) {
  if (action === 'KeyM') { toggleMute(); return; }
  if (state.phase !== 'playing' && state.phase !== 'boss') return;
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
  if (next !== state.lane) state.lastLaneChange = state.time;
  state.lane = next;
}

function doJump() {
  if (state.jumping || state.sliding) return;
  state.jumping = true;
  state.vy = 6.4;
}

function doSlide() {
  if (state.jumping || state.sliding) return;
  state.sliding = true;
  state.slideTimer = 0.7;
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
}

function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.mesh.position.z -= PROJECTILE_SPEED * dt;
    p.mesh.rotation.x += dt * 18;

    let hit = false;
    for (let j = entities.length - 1; j >= 0; j--) {
      const ent = entities[j];
      if (!ent.destructible) continue;
      if (Math.abs(ent.mesh.position.z - p.mesh.position.z) < 1.0 && Math.abs(ent.mesh.position.x - p.mesh.position.x) < 1.0) {
        scene.remove(ent.mesh);
        entities.splice(j, 1);
        if (ent.kind === 'trash' || ent.kind === 'sodacan' || ent.kind === 'poop') {
          state.trashCleared += 1;
          popText('쓰레기 치움 +15', 'clean');
        }
        sfx.pop();
        hit = true;
        break;
      }
    }
    if (!hit && state.phase === 'boss' && state.boss && p.mesh.position.z <= BOSS_Z + 1.8) {
      state.bossHp -= 1;
      hit = true;
      sfx.bossHit();
      if (state.bossHp <= 0) winGame();
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

function spawnBoss() {
  const mesh = cloneAsset('boss');
  mesh.position.set(0, 0, BOSS_Z);
  scene.add(mesh);
  state.boss = mesh;
  state.bossBaseScale = mesh.scale.x;
  state.bossHp = BOSS_HP;
  state.bossAttackTimer = 1.6;
  state.bossWarnLanes = null;
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
  const geo = new THREE.PlaneGeometry(0.1, 2.4);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  const divider = Math.random() < 0.5 ? -1.1 : 1.1;
  mesh.position.set(divider, 0.04, SPAWN_Z);
  scene.add(mesh);
  entities.push({ mesh, type: 'streak', destructible: false, kind: 'streak', isObstacle: false, speedMul: 1.6 });
}

// ---------- Game flow ----------
function bindUI() {
  dom.startBtn.addEventListener('click', startGame);
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
  dom.winScreen.hidden = true;
  dom.overScreen.hidden = true;
  dom.startScreen.hidden = false;
  dom.dangerVignette.classList.remove('on');
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
  });
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
  if (state.invuln > 0) return;
  state.lives -= 1;
  state.invuln = 1.5;
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
  document.getElementById('overScore').textContent = Math.floor(state.score);
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
  document.getElementById('winScore').textContent = Math.floor(state.score);
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
  waterUniforms.uTime.value += dt;
  mudUniforms.uTime.value += dt;
  pollGamepad();

  let ts = 1;
  if (state.slowmoTimer > 0) { state.slowmoTimer -= dt; ts = 0.4; }
  if (state.slowmoCd > 0) state.slowmoCd -= dt;
  if (state.phase === 'playing' || state.phase === 'boss') updateGame(dt * ts);
  updatePlayerVisual(dt);
  renderer.render(scene, camera);
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

  // lane movement
  const targetX = LANES[state.lane];
  playerRig.position.x += (targetX - playerRig.position.x) * Math.min(1, dt * 10);

  // jump physics
  if (state.jumping) {
    state.vy -= 18 * dt;
    state.y += state.vy * dt;
    if (state.y <= 0) { state.y = 0; state.vy = 0; state.jumping = false; }
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

  // boss behavior — weaves side to side while flinging trash faster
  if (state.phase === 'boss' && state.boss) {
    state.bossT += dt;
    state.boss.position.x = Math.sin(state.bossT * 1.1) * 2.8;
    state.bossAttackTimer -= dt;
    // telegraph: show warning signs over the target lanes before the throw
    if (!state.bossWarnLanes && state.bossAttackTimer <= 0.55) {
      const laneA = Math.floor(Math.random() * 3);
      let laneB = Math.floor(Math.random() * 3);
      if (laneB === laneA) laneB = (laneB + 1) % 3;
      state.bossWarnLanes = [laneA, laneB];
      state.bossWarnLanes.forEach((l, i) => {
        bossWarnSprites[i].position.set(LANES[l], 2.0, -7);
        bossWarnSprites[i].visible = true;
      });
      sfx.warn();
    }
    const warning = !!state.bossWarnLanes;
    const pulse = warning ? 1 + 0.12 * Math.abs(Math.sin(state.bossT * 18)) : 1;
    state.boss.scale.setScalar(state.bossBaseScale * pulse);
    if (warning) bossWarnSprites.forEach((sp) => { sp.material.opacity = 0.55 + 0.45 * Math.abs(Math.sin(state.bossT * 14)); });
    if (state.bossAttackTimer <= 0) {
      for (const l of state.bossWarnLanes || []) spawnTrashProjectile(l);
      for (const sp of bossWarnSprites) sp.visible = false;
      state.bossWarnLanes = null;
      // boss throws faster as it weakens
      state.bossAttackTimer = 1.25 - (1 - state.bossHp / BOSS_HP) * 0.4;
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
  playerRig.position.y = state.y;
  const targetY = state.sliding ? -0.85 : 0;
  const targetTilt = state.sliding ? -0.45 : 0;
  playerModel.position.y += (targetY - playerModel.position.y) * Math.min(1, dt * 12);
  playerModel.rotation.x += (targetTilt - playerModel.rotation.x) * Math.min(1, dt * 12);

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
  win() { const t = now(); [523, 659, 784, 1047, 1319].forEach((f, i) => audio.tone(f, t + i * 0.12, 0.25, 'triangle', 0.16)); },
};

function toggleMute() {
  audio.muted = !audio.muted;
  if (audio.master) audio.master.gain.value = audio.muted ? 0 : 0.5;
  dom.muteBtn.textContent = audio.muted ? '♪ 소리 꺼짐' : '♪ 소리 켜짐';
  dom.muteBtn.classList.toggle('off', audio.muted);
}

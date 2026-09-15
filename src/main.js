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
  { name: '① 입암산 발원지', desc: '여기는 입암산, 황룡강이 시작되는 곳이에요', dist: 0, speed: 12, water: [0x5fe0cc, 0x1fa08c], fog: 0xbfe8dc, sky: 0xcdf2e6, spawnEvery: 1.35 },
  { name: '② 장성호', desc: '계곡물이 모여 넓은 저수지를 이뤄요', dist: 260, speed: 14.5, water: [0x66c7ea, 0x2a8fc0], fog: 0xc9eaf5, sky: 0xd6f0fa, spawnEvery: 1.15 },
  { name: '③ 읍내 구간', desc: '장성 읍내를 가로지르는 도심 하천이에요', dist: 620, speed: 17, water: [0x7fd0b8, 0x3a9f88], fog: 0xdcefe2, sky: 0xe6f4ea, spawnEvery: 0.95 },
  { name: '④ 영산강 합류부', desc: '가장 넓은 강, 곧 보스가 나타나요!', dist: 1050, speed: 19.5, water: [0xffc178, 0xd98c3b], fog: 0xffe3bd, sky: 0xffedd0, spawnEvery: 0.8 },
];
const BOSS_TRIGGER_DIST = 1450;
const BOSS_HP = 6;

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
  bossHp: BOSS_HP,
  boss: null,
  bossAttackTimer: 0,
  trashCleared: 0,
  speed: STAGES[0].speed,
};

let renderer, scene, camera, clock;
let waterMat, waterUniforms;
let playerRig, playerModel;
let bankL, bankR;
const entities = []; // {mesh, x, type, destructible, kind}
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
};

function resolveKey(e) {
  const byCode = { ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown',
    KeyA: 'ArrowLeft', KeyD: 'ArrowRight', KeyW: 'ArrowUp', KeyS: 'ArrowDown', KeyF: 'KeyF', Space: 'ArrowUp' }[e.code];
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
  state.lane = Math.min(2, Math.max(0, state.lane + dir));
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
  state.attackCooldown = 0.4;
  flashAttack();

  let target = null;
  let bestZ = Infinity;
  for (const ent of entities) {
    if (!ent.destructible) continue;
    if (ent.mesh.position.z > 3 || ent.mesh.position.z < -14) continue;
    if (ent.mesh.position.z < bestZ) { bestZ = ent.mesh.position.z; target = ent; }
  }
  if (target) {
    scene.remove(target.mesh);
    entities.splice(entities.indexOf(target), 1);
    if (target.kind === 'trash' || target.kind === 'sodacan' || target.kind === 'poop') {
      state.trashCleared += 1;
      state.score += 15;
    }
  } else if (state.phase === 'boss' && state.boss) {
    state.bossHp -= 1;
    if (state.bossHp <= 0) winGame();
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

function spawnObstacleWave() {
  const roll = Math.random();
  const lane = Math.floor(Math.random() * 3);
  let kind;
  if (roll < 0.22) kind = 'rock';
  else if (roll < 0.42) kind = 'log';
  else if (roll < 0.62) kind = 'sodacan';
  else if (roll < 0.78) kind = 'poop';
  else kind = 'bridge';
  spawnObstacle(kind, lane);

  if (Math.random() < 0.55) spawnClam((lane + 1 + (Math.random() < 0.5 ? 0 : 1)) % 3);
}

function spawnObstacle(kind, lane) {
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
  mesh.position.set(LANES[lane], 0, SPAWN_Z);
  scene.add(mesh);
  entities.push({ mesh, type, destructible, kind, isObstacle: true });
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
  state.bossHp = BOSS_HP;
  dom.bossBar.classList.add('show');
}

function spawnTrashProjectile() {
  const lane = Math.floor(Math.random() * 3);
  const mesh = cloneAsset('trash');
  mesh.position.set(LANES[lane], 0.4, BOSS_Z + 2);
  scene.add(mesh);
  entities.push({ mesh, type: 'low', destructible: true, kind: 'trash', isObstacle: true, isBossProjectile: true });
}

// ---------- Game flow ----------
function bindUI() {
  dom.startBtn.addEventListener('click', startGame);
  dom.restartBtnWin.addEventListener('click', resetGame);
  dom.restartBtnOver.addEventListener('click', resetGame);
}

function startGame() {
  dom.startScreen.hidden = true;
  dom.hud.classList.add('active');
  state.phase = 'playing';
  showStageBanner(STAGES[0]);
}

function resetGame() {
  for (const ent of entities) scene.remove(ent.mesh);
  entities.length = 0;
  if (state.boss) { scene.remove(state.boss); state.boss = null; }
  Object.assign(state, {
    phase: 'playing', distance: 0, score: 0, clams: 0, lives: 3, invuln: 0,
    lane: 1, y: 0, vy: 0, jumping: false, sliding: false, slideTimer: 0,
    attackCooldown: 0, stageIndex: 0, spawnTimer: 0, sceneryTimer: 0,
    bossHp: BOSS_HP, bossAttackTimer: 0, trashCleared: 0, speed: STAGES[0].speed,
  });
  playerRig.position.set(LANES[1], 0, PLAYER_Z);
  dom.bossBar.classList.remove('show');
  dom.winScreen.hidden = true;
  dom.overScreen.hidden = true;
  dom.hud.classList.add('active');
  applyStageVisuals(STAGES[0]);
  showStageBanner(STAGES[0]);
}

function showStageBanner(stage) {
  dom.stName.textContent = stage.name;
  dom.stDesc.textContent = stage.desc;
  dom.stageBanner.classList.add('show');
  setTimeout(() => dom.stageBanner.classList.remove('show'), 2600);
}

function applyStageVisuals(stage) {
  waterUniforms.uShallow.value.setHex(stage.water[0]);
  waterUniforms.uDeep.value.setHex(stage.water[1]);
  scene.fog.color.setHex(stage.fog);
  scene.background.setHex(stage.sky);
  state.speed = stage.speed;
}

function loseLife(reason) {
  if (state.invuln > 0) return;
  state.lives -= 1;
  state.invuln = 1.5;
  if (state.lives <= 0) {
    gameOver(reason);
  }
}

function gameOver(reason) {
  state.phase = 'over';
  dom.hud.classList.remove('active');
  dom.overReason.textContent = reason || '다시 도전해서 영산강 합류부까지 헤엄쳐 보세요.';
  document.getElementById('overScore').textContent = Math.floor(state.score);
  document.getElementById('overDist').textContent = Math.floor(state.distance) + 'm';
  dom.overScreen.hidden = false;
}

function winGame() {
  state.phase = 'win';
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
  pollGamepad();

  if (state.phase === 'playing' || state.phase === 'boss') updateGame(dt);
  updatePlayerVisual(dt);
  renderer.render(scene, camera);
}

function updateGame(dt) {
  state.attackCooldown = Math.max(0, state.attackCooldown - dt);
  if (state.invuln > 0) state.invuln -= dt;

  // stage progression
  state.distance += state.speed * dt;
  const nextIdx = STAGES.findIndex((s, i) => i > state.stageIndex && state.distance >= s.dist);
  if (nextIdx !== -1) {
    state.stageIndex = nextIdx;
    applyStageVisuals(STAGES[nextIdx]);
    showStageBanner(STAGES[nextIdx]);
  }

  if (state.phase === 'playing' && state.distance >= BOSS_TRIGGER_DIST) {
    state.phase = 'boss';
    spawnBoss();
  }

  state.score = Math.floor(state.distance) + state.clams * 2 + state.trashCleared * 15;

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
      spawnObstacleWave();
      state.spawnTimer = currentStage().spawnEvery + Math.random() * 0.3;
    }
  }
  state.sceneryTimer -= dt;
  if (state.sceneryTimer <= 0) { spawnScenery(); state.sceneryTimer = 0.5; }

  // boss behavior
  if (state.phase === 'boss' && state.boss) {
    state.bossAttackTimer -= dt;
    if (state.bossAttackTimer <= 0) { spawnTrashProjectile(); state.bossAttackTimer = 2.2; }
    dom.bossFill.style.width = Math.max(0, (state.bossHp / BOSS_HP) * 100) + '%';
  }

  // move entities & collisions
  for (let i = entities.length - 1; i >= 0; i--) {
    const ent = entities[i];
    ent.mesh.position.z += state.speed * dt;
    if (ent.type !== 'scenery' && ent.kind !== 'bridge') ent.mesh.rotation.y += dt * 0.6;

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
        state.clams += 1;
        scene.remove(ent.mesh);
        entities.splice(i, 1);
        continue;
      }
      const avoided =
        (ent.type === 'low' && state.jumping) ||
        (ent.type === 'high' && state.sliding);
      if (!avoided) {
        scene.remove(ent.mesh);
        entities.splice(i, 1);
        loseLife(ent.isBossProjectile ? '보스의 쓰레기에 맞았어요.' : '장애물에 부딪혔어요.');
      }
    }
  }

  document.getElementById('scoreVal').textContent = state.score;
  document.getElementById('distVal').textContent = Math.floor(state.distance);
  document.getElementById('clamVal').textContent = state.clams;
  dom.speedFill.style.width = Math.min(100, (state.speed / STAGES[3].speed) * 100) + '%';
  renderHearts();
}

function renderHearts() {
  dom.hearts.innerHTML = '';
  for (let i = 0; i < 3; i++) {
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

  camera.position.x += (playerRig.position.x * 0.6 - (camera.position.x - 0)) * Math.min(1, dt * 4);
  camera.position.y = 4.2 + state.y * 0.2;
  camera.lookAt(playerRig.position.x * 0.4, 1.1 + state.y * 0.3, -6);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

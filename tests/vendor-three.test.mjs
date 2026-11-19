// vendor-three.test.mjs — Node tests for the VENDORED three.js module itself.
//
// Why this file exists: the entry used to vendor the upstream SPLIT build of
// three.js r187 (three.module.min.js + three.core.js, the module importing
// the core twice). The swap replaced it with a single SELF-CONTAINED module
// build of the same library and version (esbuild bundle of the two upstream
// r187 files), and deleted three.core.js. These tests pin that swap down:
// the vendored file must load standalone with no three.core.js anywhere near
// it, report REVISION 187, expose every THREE.* name the game uses, and
// behave like the real three.js in the constructs the view layer relies on.
// Run: node tests/vendor-three.test.mjs
import * as THREE from '../game/vendor/three/three.module.min.js';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

let passed = 0;
let failed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`ok - ${name}`); }
  else { failed++; console.log(`FAIL - ${name}${extra ? ' — ' + extra : ''}`); }
}
const approx = (a, b, tol) => Math.abs(a - b) <= tol;
const here = dirname(fileURLToPath(import.meta.url));
const vendorDir = join(here, '..', 'game', 'vendor', 'three');
const modulePath = join(vendorDir, 'three.module.min.js');
const moduleText = readFileSync(modulePath, 'utf8');

// 1. The vendored file is the self-contained build, not the split one.
{
  check('vendored module has no three.core reference', !moduleText.includes('three.core'));
  check('vendored module has no relative import of any sibling file', !/from\s*["']\.\//.test(moduleText));
  check('vendored module is a real bundle, not a stub (> 500 KiB)', moduleText.length > 500 * 1024, `got ${moduleText.length} bytes`);
  check('three.core.js is gone from the tree', !existsSync(join(vendorDir, 'three.core.js')));
  check('LICENSE still sits next to the module', existsSync(join(vendorDir, 'LICENSE')));
}

// 2. REVISION is 187, the version the whole game was built against.
{
  check('THREE.REVISION is 187', THREE.REVISION === '187', `got ${THREE.REVISION}`);
  check('module exports a full API (>= 400 names)', Object.keys(THREE).length >= 400, `got ${Object.keys(THREE).length}`);
}

// 3. Every THREE.* name the game actually uses (grepped from game/src/).
// If the game adds a new THREE use, add its name here.
{
  const gameUsed = [
    'ACESFilmicToneMapping', 'AdditiveBlending', 'BackSide', 'BoxGeometry',
    'BufferAttribute', 'BufferGeometry', 'CanvasTexture', 'CircleGeometry',
    'Color', 'ConeGeometry', 'CylinderGeometry', 'DirectionalLight',
    'DoubleSide', 'DynamicDrawUsage', 'Euler', 'Float32BufferAttribute',
    'Fog', 'Group', 'HemisphereLight', 'InstancedMesh', 'Line',
    'LineBasicMaterial', 'Matrix4', 'Mesh', 'MeshBasicMaterial',
    'MeshStandardMaterial', 'Object3D', 'PCFSoftShadowMap',
    'PerspectiveCamera', 'PlaneGeometry', 'Points', 'PointsMaterial',
    'Quaternion', 'SRGBColorSpace', 'Scene', 'ShaderMaterial',
    'SphereGeometry', 'SpotLight', 'Sprite', 'SpriteMaterial',
    'TorusGeometry', 'Vector3', 'WebGLRenderer',
  ];
  const missing = gameUsed.filter((n) => THREE[n] === undefined);
  check(`all ${gameUsed.length} game-used THREE names exist`, missing.length === 0, `missing: ${missing.join(', ')}`);
  // Names the game does not call directly but the view layer leans on
  // (types, targets, texture/filter constants, event plumbing).
  const supporting = [
    'Raycaster', 'Texture', 'DataTexture', 'OrthographicCamera',
    'MeshDepthMaterial', 'MeshDistanceMaterial', 'RawShaderMaterial',
    'Uint16BufferAttribute', 'Uint32BufferAttribute', 'VSMShadowMap',
    'PCFShadowMap', 'Vector2', 'Vector4', 'Matrix3', 'EventDispatcher',
    'Frustum', 'Layers', 'CubeTexture', 'WebGLRenderTarget',
    'ClampToEdgeWrapping', 'RepeatWrapping', 'LinearFilter',
    'NearestFilter', 'RGBAFormat', 'UnsignedByteType', 'FloatType',
    'ColorManagement',
  ];
  const missingSup = supporting.filter((n) => THREE[n] === undefined);
  check(`all ${supporting.length} supporting THREE names exist`, missingSup.length === 0, `missing: ${missingSup.join(', ')}`);
}

// 4. Functional smoke: the constructs the view layer builds every frame.
// (WebGLRenderer and CanvasTexture are typeof-only here: constructing them
// needs a DOM/canvas, which Node has not got; the live Playwright run
// covers the real renderer.)
{
  check('WebGLRenderer is a constructor', typeof THREE.WebGLRenderer === 'function');
  check('CanvasTexture is a constructor', typeof THREE.CanvasTexture === 'function');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
  scene.add(camera);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 2, 3),
    new THREE.MeshStandardMaterial({ color: 0xff0000 }),
  );
  mesh.position.set(10, 0, -5);
  scene.add(mesh);
  check('scene holds camera + mesh', scene.children.length === 2);
  check('box geometry keeps its parameters', mesh.geometry.parameters.width === 1 && mesh.geometry.parameters.depth === 3);
  check('mesh world position is set', mesh.position.x === 10 && mesh.position.z === -5);
  scene.remove(mesh);
  check('scene remove works', scene.children.length === 1);
}

// 5. Vector / quaternion / colour math the camera and vehicles depend on.
{
  const v = new THREE.Vector3(1, 2, 3);
  check('Vector3 length is sqrt(14)', approx(v.length(), Math.sqrt(14), 1e-9), `got ${v.length()}`);
  const a = new THREE.Vector3(1, 0, 0);
  const b = new THREE.Vector3(0, 1, 0);
  const cross = new THREE.Vector3().crossVectors(a, b);
  check('Vector3 cross product points +z', cross.x === 0 && cross.y === 0 && cross.z === 1);
  check('Vector3 dot product is 0 for perpendicular axes', a.dot(b) === 0);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
  const turned = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
  check('quaternion yaw 90deg turns +x toward -z', approx(turned.x, 0, 1e-9) && approx(turned.z, -1, 1e-9), `got (${turned.x}, ${turned.z})`);
  const colour = new THREE.Color(0xffe9a8);
  check('Color round-trips its hex', colour.getHex() === 0xffe9a8);
  const m4 = new THREE.Matrix4().makeTranslation(5, 6, 7);
  const p = new THREE.Vector3(1, 1, 1).applyMatrix4(m4);
  check('Matrix4 translation moves the point', p.x === 6 && p.y === 7 && p.z === 8);
}

// 6. Instanced meshes, points, lines and sprites: the batched city, the
// particle bursts, the bullet tracer and the vehicle headlight glows.
{
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const inst = new THREE.InstancedMesh(geo, mat, 4);
  const dummy = new THREE.Object3D();
  dummy.position.set(3, 0, 0);
  dummy.updateMatrix();
  inst.setMatrixAt(2, dummy.matrix);
  inst.instanceMatrix.needsUpdate = true;
  check('InstancedMesh holds 4 instances', inst.count === 4);
  const readBack = new THREE.Matrix4();
  inst.getMatrixAt(2, readBack);
  check('InstancedMesh matrix round-trips', approx(readBack.elements[12], 3, 1e-9));
  const pointsGeo = new THREE.BufferGeometry();
  pointsGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 1], 3));
  const points = new THREE.Points(pointsGeo, new THREE.PointsMaterial({ size: 0.5 }));
  check('Points holds 2 vertices', points.geometry.attributes.position.count === 2);
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 1.4, 0, 10, 1.0, 0]), 3));
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xffe9a8 }));
  check('Line holds 2 endpoints', line.geometry.attributes.position.count === 2);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffffff }));
  check('Sprite is an Object3D', sprite instanceof THREE.Object3D);
}

// 7. Scene dressing: fog, lights, groups, and material blending flags.
{
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x112233, 50, 500);
  check('Fog keeps near/far', scene.fog.near === 50 && scene.fog.far === 500);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x223344, 0.8);
  const sun = new THREE.DirectionalLight(0xffe0b3, 2.0);
  const spot = new THREE.SpotLight(0xffffff, 50, 60, 0.5, 0.4);
  scene.add(hemi, sun, spot);
  check('scene holds 3 lights', scene.children.length === 3);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial()));
  scene.add(group);
  check('Group nests a mesh inside the scene', scene.children.length === 4 && group.children.length === 1);
  const additive = new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending, transparent: true });
  check('additive blending flag sticks', additive.blending === THREE.AdditiveBlending);
  const shader = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 } }, vertexShader: 'void main(){}', fragmentShader: 'void main(){}' });
  check('ShaderMaterial keeps its uniform', shader.uniforms.uTime.value === 0);
  const raycaster = new THREE.Raycaster();
  check('Raycaster constructs', typeof raycaster.set === 'function');
}

console.log(failed === 0 ? `\n${passed} vendor-three tests passed, 0 failed` : `\n${failed} VENDOR-THREE TEST(S) FAILED (${passed} passed)`);
process.exit(failed === 0 ? 0 : 1);

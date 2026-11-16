import {
  AmbientLight, DirectionalLight, Mesh, MeshStandardMaterial, OrthographicCamera, Scene,
  SphereGeometry, SRGBColorSpace, TextureLoader, WebGLRenderer
} from './vendor/three-0.160.0.module.min.js';

export async function mountBall(canvas, context, { size, sample, onFailure }) {
  const texture = await new TextureLoader().loadAsync('/assets/cena/bola-textura.webp');
  texture.colorSpace = SRGBColorSpace;
  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, context, alpha: true });
  } catch (error) {
    texture.dispose();
    throw error;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0, 0);
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, .1, 1000);
  camera.position.z = 375;
  const geometry = new SphereGeometry(1, 40, 24);
  const material = new MeshStandardMaterial({ map: texture, roughness: .68, metalness: 0 });
  const mesh = new Mesh(geometry, material);
  scene.add(mesh, new AmbientLight(0xfff5db, 1.55));
  const sun = new DirectionalLight(0xfff2c2, 2.10);
  sun.position.set(-3, 5, 6);
  scene.add(sun);

  let width = 0;
  let height = 0;
  let active = false;
  let animation;
  let previous = 0;
  let disposed = false;
  function resize(w, h) {
    width = w;
    height = h;
    renderer.setSize(w, h, false);
    camera.left = -w / 2;
    camera.right = w / 2;
    camera.top = h / 2;
    camera.bottom = -h / 2;
    camera.updateProjectionMatrix();
  }
  function render(now) {
    if (!active || disposed) return;
    const box = size();
    if (box.width > 0 && box.height > 0) {
      if (box.width !== width || box.height !== height) resize(box.width, box.height);
      const delta = previous ? Math.min(50, now - previous) : 0;
      const pose = sample(delta, box);
      mesh.position.set(pose.x - width / 2, height / 2 - pose.y, 0);
      mesh.scale.setScalar(Math.max(1, box.diameter * .45 * pose.scale));
      mesh.rotation.set(.31, pose.rotation, pose.rotation * .35);
      renderer.render(scene, camera);
    }
    previous = now;
    if (active) animation = requestAnimationFrame(render);
  }
  function setActive(value) {
    if (active === value || disposed) return;
    active = value;
    cancelAnimationFrame(animation);
    previous = 0;
    if (active) animation = requestAnimationFrame(render);
  }
  function dispose() {
    setActive(false);
    disposed = true;
    geometry.dispose();
    material.dispose();
    texture.dispose();
    renderer.dispose();
  }
  canvas.addEventListener('webglcontextlost', () => {
    dispose();
    onFailure();
  }, { once: true });
  return { setActive, dispose };
}

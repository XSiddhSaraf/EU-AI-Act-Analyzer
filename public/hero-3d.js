(() => {
if (customElements.get('hero-3d')) return;
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
class Hero3D extends HTMLElement {
  connectedCallback() {
    this.style.display = 'block';
    this.style.position = 'absolute';
    this.style.inset = '0';
    this.style.overflow = 'hidden';
    this.style.borderRadius = this.getAttribute('radius') || '24px';
    this.style.background = 'radial-gradient(120% 100% at 50% 0%, #ffffff 0%, #e9ecf2 60%, #dfe3ea 100%)';
    this._start();
  }
  disconnectedCallback() { this._dead = true; cancelAnimationFrame(this._raf); this._ro && this._ro.disconnect(); }
  async _start() {
    const THREE = await import(THREE_URL);
    if (this._dead) return;
    const accent = new THREE.Color(this.getAttribute('accent') || '#0e76ff');
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    Object.assign(renderer.domElement.style, { position: 'absolute', inset: 0, width: '100%', height: '100%' });
    this.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xc9d1dd, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(4, 6, 5); scene.add(key);
    const fill = new THREE.DirectionalLight(0xdfe9ff, 1.0); fill.position.set(-5, 2, -4); scene.add(fill);

    const root = new THREE.Group(); scene.add(root);
    const rnd = (n) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
    // Brain silhouette test: two hemispheres (ellipsoids, x split) + cerebellum + short stem. Sample points inside; keep a denser shell.
    const inBrain = (p) => {
      const hx = Math.abs(p.x) - 0.05;
      if (hx > 0) {
        let e = (hx * hx) / (0.62 * 0.62) + (p.y * p.y) / (0.62 * 0.62) + (p.z * p.z) / (0.92 * 0.92);
        if (p.y < -0.15 && p.z > 0.2) e += 0.9 * (p.z - 0.2) * (-0.15 - p.y); // temporal notch (front-bottom)
        if (e <= 1) return 'hemi';
      }
      const c = ((p.x) ** 2) / (0.36 * 0.36) + ((p.y + 0.5) ** 2) / (0.22 * 0.22) + ((p.z + 0.55) ** 2) / (0.3 * 0.3);
      if (c <= 1) return 'cb';
      const sx = p.x, sy = p.y + 0.62, sz = p.z + 0.25;
      if (sy < 0 && sy > -0.42 && sx * sx + sz * sz < 0.09 * 0.09 * (1 + sy * 0.9)) return 'stem';
      return null;
    };
    const pts = [], kinds = [];
    let i = 0;
    while (pts.length < 300 && i < 200000) {
      const p = new THREE.Vector3(rnd(i) * 2.6 - 1.3, rnd(i + 1e5) * 2.4 - 1.25, rnd(i + 2e5) * 2.4 - 1.2); i++;
      const k = inBrain(p); if (!k) continue;
      // bias to shell: reject interior hemisphere points most of the time
      if (k === 'hemi') {
        const hx = Math.abs(p.x) - 0.05, e = (hx * hx) / (0.62 * 0.62) + (p.y * p.y) / (0.62 * 0.62) + (p.z * p.z) / (0.92 * 0.92);
        if (e < 0.72 && rnd(i + 3e5) < 0.72) continue;
      }
      // min spacing
      let ok = true; for (const q of pts) if (q.distanceTo(p) < 0.11) { ok = false; break; }
      if (!ok) continue;
      pts.push(p); kinds.push(k);
    }
    // Nodes: glossy spheres, varying size, palette of pale/ink/blue
    const palette = [new THREE.Color('#ffffff'), new THREE.Color('#dfe9fb'), new THREE.Color('#b8cdf2'), accent, new THREE.Color('#0b0f19')];
    const weights = [0.28, 0.3, 0.2, 0.16, 0.06];
    const pick = (r) => { let a = 0; for (let j = 0; j < weights.length; j++) { a += weights[j]; if (r < a) return palette[j]; } return palette[0]; };
    const nodeGeo = new THREE.SphereGeometry(1, 20, 20);
    const nodeMat = new THREE.MeshPhysicalMaterial({ roughness: 0.28, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.2 });
    const nodes = new THREE.InstancedMesh(nodeGeo, nodeMat, pts.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    const baseScale = [];
    pts.forEach((p, j) => {
      const r = rnd(j + 7e5); const s = r < 0.12 ? 0.075 : r < 0.5 ? 0.045 : 0.028;
      baseScale.push(s); sc.setScalar(s); m.compose(p, q, sc); nodes.setMatrixAt(j, m);
      nodes.setColorAt(j, pick(rnd(j + 9e5)));
    });
    root.add(nodes);
    // Struts: connect each node to nearest few neighbours, as thin cylinders (batched via instancing)
    const pairs = [];
    for (let a = 0; a < pts.length; a++) {
      const d = pts.map((p, b) => [p.distanceTo(pts[a]), b]).filter(x => x[1] !== a).sort((x, y) => x[0] - y[0]).slice(0, 3 + (rnd(a + 4e5) < 0.35 ? 1 : 0));
      for (const [dist, b] of d) if (dist < 0.62 && a < b || (dist < 0.62 && !pairs.some(pr => pr[0] === b && pr[1] === a))) pairs.push([Math.min(a, b), Math.max(a, b)]);
    }
    const uniq = [...new Set(pairs.map(p => p.join(',')))].map(s => s.split(',').map(Number));
    const strutGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1); strutGeo.translate(0, 0.5, 0);
    const strutMat = new THREE.MeshStandardMaterial({ color: 0xc4cddc, roughness: 0.5, metalness: 0.3 });
    const struts = new THREE.InstancedMesh(strutGeo, strutMat, uniq.length);
    const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
    uniq.forEach(([a, b], j) => {
      dir.subVectors(pts[b], pts[a]); const len = dir.length(); q.setFromUnitVectors(up, dir.clone().normalize());
      sc.set(0.007, len, 0.007); m.compose(pts[a], q, sc); struts.setMatrixAt(j, m);
      struts.setColorAt(j, rnd(j + 5e5) < 0.18 ? accent : new THREE.Color('#c4cddc'));
    });
    root.add(struts);
    // Signal pulses travelling along struts
    const pulseMat = new THREE.MeshBasicMaterial({ color: accent });
    const pulses = [];
    for (let j = 0; j < 16; j++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 10), pulseMat); s.userData = { e: (j * 37) % uniq.length, ph: rnd(j + 6e5), sp: 0.5 + rnd(j + 8e5) * 0.7 }; root.add(s); pulses.push(s); }
    // Orbit rings with satellites
    const ink = new THREE.Color('#0b0f19'), ringHot = new THREE.MeshBasicMaterial({ color: accent }), ringSat = new THREE.MeshStandardMaterial({ color: ink, roughness: 0.4 });
    const rings = [];
    [[1.75, 0.35, 0], [1.9, -0.6, 0.9], [2.05, 1.1, -0.5]].forEach(([r, rx, rz], j) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.008, 8, 160), new THREE.MeshBasicMaterial({ color: j === 1 ? accent : ink, transparent: true, opacity: j === 1 ? 0.9 : 0.35 }));
      ring.rotation.set(rx, 0, rz); scene.add(ring); rings.push(ring);
      const sat = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 14), j === 1 ? ringHot : ringSat); ring.add(sat); ring.userData = { sat, r };
    });
    // Soft ground shadow
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.5, 64), new THREE.MeshBasicMaterial({ color: 0x0b0f19, transparent: true, opacity: 0.08 }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = -2.2; disc.scale.set(1, 0.8, 1); scene.add(disc);
    root.scale.setScalar(1.25);

    const resize = () => { const w = this.clientWidth || 1, h = this.clientHeight || 1; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    this._ro = new ResizeObserver(resize); this._ro.observe(this); resize();
    let mx = 0, my = 0; this.addEventListener('pointermove', e => { const b = this.getBoundingClientRect(); mx = (e.clientX - b.left) / b.width - 0.5; my = (e.clientY - b.top) / b.height - 0.5; });
    const clock = new THREE.Clock();
    const loop = () => {
      if (this._dead) return; this._raf = requestAnimationFrame(loop);
      const t = clock.getElapsedTime();
      // Camera sweeps around the side profile (most recognisable), never fully to the front/back
      const az = Math.PI / 2 + Math.sin(t * 0.22) * 0.85 + mx * 0.5, el = 0.22 + Math.sin(t * 0.17) * 0.12 - my * 0.35, d = 8.2;
      camera.position.set(Math.sin(az) * Math.cos(el) * d, Math.sin(el) * d, Math.cos(az) * Math.cos(el) * d);
      camera.lookAt(0, -0.05, 0);
      root.rotation.y = t * 0.05;
      rings.forEach((r, j) => { r.rotation.y = t * (0.25 + j * 0.1); const ph = t * (0.9 + j * 0.3); r.userData.sat.position.set(Math.cos(ph) * r.userData.r, Math.sin(ph) * r.userData.r, 0); });
      pulses.forEach((p) => { const u = (t * p.userData.sp + p.userData.ph) % 1; const [a, b] = uniq[p.userData.e]; p.position.lerpVectors(pts[a], pts[b], u).multiplyScalar(root.scale.x).applyAxisAngle(up, root.rotation.y); });
      renderer.render(scene, camera);
    };
    loop();
  }
}
customElements.define('hero-3d', Hero3D);
})();

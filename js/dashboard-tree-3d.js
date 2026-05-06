// Bosque UNAM — Árbol 3D realista en Three.js
// Reemplaza el SVG schematic por un árbol procedural con:
// - Tronco curvo (TubeGeometry siguiendo CatmullRom)
// - 8 ramas radiales con curvatura natural
// - 50 hojas (IcosahedronGeometry) coloreadas por salud
// - Sol direccional + sombra suave + ambient + hemisphere
// - OrbitControls: drag para rotar, pinch para zoom (mobile), auto-rotate lento
// - Hover/click sobre hojas → tooltip + edición del árbol

(function () {
  'use strict';

  let scene, camera, renderer, controls;
  let leafMeshes = [];
  let raycaster, mouse;
  let animId = null;
  let resizeHandler = null;
  let containerEl = null;
  let lastHovered = null;

  function colorByHealth(score) {
    if (score == null) return 0xc5b5a0;
    if (score >= 80) return 0x4a7c2a;
    if (score >= 60) return 0x95b86c;
    if (score >= 40) return 0xd49b3a;
    if (score >= 0)  return 0xb54f3a;
    return 0xc5b5a0;
  }

  function createSkyTexture() {
    const c = document.createElement('canvas');
    c.width = 16; c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0.00, '#a8d4f0'); // cielo arriba
    g.addColorStop(0.45, '#dde8d9'); // brisa
    g.addColorStop(0.70, '#f5ede0'); // horizonte cálido
    g.addColorStop(1.00, '#d4b896'); // tierra reflejada
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 16, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    return tex;
  }

  // =========================================================
  // JACARANDA (Jacaranda mimosifolia) — árbol icónico de UNAM
  //  - Tronco grueso, gris-marrón claro, BIFURCACIÓN TEMPRANA
  //  - Canopy AMPLIO en forma de paraguas, denso
  //  - Hojas verdes pequeñas + flores violeta lavanda en racimos
  // =========================================================
  function buildTree(trees) {
    const group = new THREE.Group();

    const barkMat = new THREE.MeshStandardMaterial({
      color: 0x6e5a3e,    // gris-marrón claro (no oscuro)
      roughness: 0.92,
      metalness: 0.0
    });

    // ---- Tronco corto (1.8m) que bifurca temprano ----
    const trunkPoints = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.05, 0.5, 0.05),
      new THREE.Vector3(-0.05, 1.0, -0.03),
      new THREE.Vector3(0.05, 1.5, 0.02),
      new THREE.Vector3(0, 1.8, 0)
    ];
    const trunkCurve = new THREE.CatmullRomCurve3(trunkPoints);
    const trunkGeo = new THREE.TubeGeometry(trunkCurve, 24, 0.42, 14, false);
    try {
      const pos = trunkGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
        const h = Math.max(0, Math.min(1, vy / 1.8));
        const taper = 1 - h * 0.30;
        const sp = trunkCurve.getPoint(h);
        if (!sp || sp.x == null) continue;
        const dx = vx - sp.x, dz = vz - sp.z;
        pos.setXYZ(i, sp.x + dx * taper, vy, sp.z + dz * taper);
      }
      pos.needsUpdate = true;
      trunkGeo.computeVertexNormals();
    } catch (e) { console.warn('Trunk taper:', e.message); }
    const trunk = new THREE.Mesh(trunkGeo, barkMat);
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    group.add(trunk);

    // ---- 5 ramas principales abriéndose como paraguas ----
    const allTips = [];
    const numMain = 5;
    for (let i = 0; i < numMain; i++) {
      const angle = (i / numMain) * Math.PI * 2 + Math.random() * 0.4;
      const tilt = 0.55 + Math.random() * 0.20;
      const length = 4.5 + Math.random() * 1.2;
      const sx = 0, sy = 1.7, sz = 0;
      const endR = length * Math.sin(tilt);
      const endY = sy + length * Math.cos(tilt);
      const ex = Math.sin(angle) * endR;
      const ez = Math.cos(angle) * endR;
      const m1 = new THREE.Vector3(
        (ex - sx) * 0.35 + (Math.random() - 0.5) * 0.3,
        sy + (endY - sy) * 0.40,
        (ez - sz) * 0.35 + (Math.random() - 0.5) * 0.3
      );
      const m2 = new THREE.Vector3(
        (ex - sx) * 0.70,
        sy + (endY - sy) * 0.78,
        (ez - sz) * 0.70
      );
      const branchCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(sx, sy, sz), m1, m2,
        new THREE.Vector3(ex, endY, ez)
      ]);
      const branchGeo = new THREE.TubeGeometry(branchCurve, 18, 0.20, 10, false);
      try {
        const p = branchGeo.attributes.position;
        for (let j = 0; j < p.count; j++) {
          const vx = p.getX(j), vy = p.getY(j), vz = p.getZ(j);
          const h = Math.max(0, Math.min(1, (vy - sy) / Math.max(0.001, endY - sy)));
          const taper = 1 - h * 0.65;
          const sp = branchCurve.getPoint(h);
          if (!sp) continue;
          p.setXYZ(j, sp.x + (vx - sp.x) * taper, vy, sp.z + (vz - sp.z) * taper);
        }
        p.needsUpdate = true;
        branchGeo.computeVertexNormals();
      } catch (e) {}
      const branch = new THREE.Mesh(branchGeo, barkMat);
      branch.castShadow = true;
      group.add(branch);

      allTips.push({ x: ex, y: endY, z: ez, size: 1.0 });

      // Sub-ramas
      const subCount = 2 + Math.floor(Math.random() * 2);
      for (let s = 0; s < subCount; s++) {
        const subAngle = angle + (Math.random() - 0.5) * 1.0;
        const subLen = 1.0 + Math.random() * 1.2;
        const sx2 = ex * 0.7, sy2 = endY * 0.85, sz2 = ez * 0.7;
        const endR2 = subLen * Math.sin(tilt + (Math.random() - 0.5) * 0.3);
        const ex2 = sx2 + Math.sin(subAngle) * endR2;
        const ey2 = sy2 + subLen * Math.cos(tilt) * 0.4;
        const ez2 = sz2 + Math.cos(subAngle) * endR2;
        const subCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(sx2, sy2, sz2),
          new THREE.Vector3((sx2 + ex2) * 0.5, (sy2 + ey2) * 0.5 + 0.2, (sz2 + ez2) * 0.5),
          new THREE.Vector3(ex2, ey2, ez2)
        ]);
        const subGeo = new THREE.TubeGeometry(subCurve, 10, 0.09, 7, false);
        const sub = new THREE.Mesh(subGeo, barkMat);
        sub.castShadow = true;
        group.add(sub);
        allTips.push({ x: ex2, y: ey2, z: ez2, size: 0.8 });
      }
    }

    // ---- HOJAS DATA (50 clickeables, coloreadas por salud) ----
    leafMeshes = [];
    const leafGeo = new THREE.IcosahedronGeometry(0.40, 0);
    const flowerGeo = new THREE.SphereGeometry(0.32, 8, 6);

    // Paleta jacaranda en flor
    const FLOWER_COLORS = [0x8e6bb5, 0xa07ec5, 0xb794d8, 0xc8aae0, 0x9678c0, 0x7c5aa6];
    const LEAF_GREEN = [0x6b8a3e, 0x7a9c4a, 0x8aab58];

    const sorted = (trees || []).slice().sort((a, b) => (b.health_score || 0) - (a.health_score || 0));
    const total = sorted.length;
    const totalDataSlots = 50;
    const scaled = total > totalDataSlots;

    for (let i = 0; i < totalDataSlots; i++) {
      const tip = allTips[i % allTips.length];
      const spread = 1.6 * tip.size;
      const offset = new THREE.Vector3(
        (Math.random() - 0.5) * spread,
        (Math.random() - 0.2) * 0.9,
        (Math.random() - 0.5) * spread
      );
      let assignedTree = null;
      if (!scaled) assignedTree = sorted[i] || null;
      else assignedTree = sorted[Math.floor(i * total / totalDataSlots)] || null;
      const isEmpty = !(assignedTree && assignedTree.id != null);
      const score = assignedTree ? (assignedTree.health_score || 0) : null;
      const color = isEmpty ? 0xc5b5a0 : colorByHealth(score);

      const mat = new THREE.MeshStandardMaterial({
        color, roughness: 0.65, flatShading: true,
        emissive: 0x000000,
        transparent: isEmpty, opacity: isEmpty ? 0.30 : 1.0
      });
      const leaf = new THREE.Mesh(leafGeo, mat);
      leaf.position.set(tip.x + offset.x, tip.y + offset.y, tip.z + offset.z);
      const baseScale = isEmpty ? 0.5 : (0.85 + Math.random() * 0.5);
      leaf.scale.setScalar(baseScale);
      leaf.castShadow = !isEmpty;
      leaf.userData = {
        isLeaf: true, tree: assignedTree, isEmpty, baseScale,
        wobblePhase: Math.random() * Math.PI * 2, baseY: leaf.position.y
      };
      group.add(leaf);
      leafMeshes.push(leaf);
    }

    // ---- 250 FLORES VIOLETA jacaranda (densidad visual) ----
    for (let i = 0; i < 250; i++) {
      const tip = allTips[i % allTips.length];
      const spread = 2.0 * tip.size;
      const x = tip.x + (Math.random() - 0.5) * spread;
      const y = tip.y + (Math.random() - 0.3) * 1.6;
      const z = tip.z + (Math.random() - 0.5) * spread;
      const c = FLOWER_COLORS[Math.floor(Math.random() * FLOWER_COLORS.length)];
      const mat = new THREE.MeshStandardMaterial({
        color: c, roughness: 0.55, flatShading: true,
        emissive: 0x140820, emissiveIntensity: 0.25
      });
      const flower = new THREE.Mesh(flowerGeo, mat);
      flower.position.set(x, y, z);
      flower.scale.setScalar(0.55 + Math.random() * 0.55);
      flower.userData = { isFlower: true, baseY: y, wobblePhase: Math.random() * Math.PI * 2 };
      group.add(flower);
    }

    // ---- 70 hojas verdes intercaladas ----
    for (let i = 0; i < 70; i++) {
      const tip = allTips[i % allTips.length];
      const spread = 2.2 * tip.size;
      const x = tip.x + (Math.random() - 0.5) * spread;
      const y = tip.y + (Math.random() - 0.4) * 1.4;
      const z = tip.z + (Math.random() - 0.5) * spread;
      const greenColor = LEAF_GREEN[Math.floor(Math.random() * LEAF_GREEN.length)];
      const mat = new THREE.MeshStandardMaterial({
        color: greenColor, roughness: 0.7, flatShading: true
      });
      const greenLeaf = new THREE.Mesh(leafGeo, mat);
      greenLeaf.position.set(x, y, z);
      greenLeaf.scale.setScalar(0.45 + Math.random() * 0.4);
      greenLeaf.userData = { isFlower: true, baseY: y, wobblePhase: Math.random() * Math.PI * 2 };
      group.add(greenLeaf);
    }

    return group;
  }

  function setupScene(container, trees) {
    const w = container.clientWidth;
    const h = Math.min(560, Math.max(380, Math.round(w * 0.65)));

    scene = new THREE.Scene();
    scene.background = createSkyTexture();
    scene.fog = new THREE.Fog(0xeae0c8, 22, 65);

    camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 200);
    camera.position.set(0, 5.5, 14);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding || THREE.LinearEncoding;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Lights
    const sun = new THREE.DirectionalLight(0xfff0d8, 1.4);
    sun.position.set(8, 16, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 0.1;
    sun.shadow.camera.far = 40;
    sun.shadow.camera.left = -10;
    sun.shadow.camera.right = 10;
    sun.shadow.camera.top = 14;
    sun.shadow.camera.bottom = -2;
    scene.add(sun);

    scene.add(new THREE.AmbientLight(0xb8d4f0, 0.45));
    scene.add(new THREE.HemisphereLight(0xfff8e0, 0x4a3a2a, 0.55));

    // Ground (disco de tierra)
    const groundGeo = new THREE.CircleGeometry(14, 48);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x8b6f47, roughness: 0.95
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    scene.add(ground);

    // Hierba sutil (anillo más oscuro)
    const grassGeo = new THREE.RingGeometry(2.5, 6, 32);
    const grassMat = new THREE.MeshStandardMaterial({
      color: 0x6b8a4e, roughness: 0.95, side: THREE.DoubleSide,
      transparent: true, opacity: 0.65
    });
    const grass = new THREE.Mesh(grassGeo, grassMat);
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.04;
    grass.receiveShadow = true;
    scene.add(grass);

    // Tree
    const tree = buildTree(trees);
    scene.add(tree);

    // Controls
    if (THREE.OrbitControls) {
      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.6;
      controls.minDistance = 8;
      controls.maxDistance = 24;
      controls.minPolarAngle = Math.PI / 7;
      controls.maxPolarAngle = Math.PI / 2.05;
      controls.target.set(0, 4.5, 0);
      controls.enablePan = false;
    } else {
      console.warn('OrbitControls no cargado, modo estático');
    }

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    renderer.domElement.addEventListener('mousemove', onPointerMove);
    renderer.domElement.addEventListener('click', onPointerClick);
    renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: true });

    resizeHandler = () => onResize(container);
    window.addEventListener('resize', resizeHandler);
  }

  function onResize(container) {
    if (!renderer || !camera || !container) return;
    const w = container.clientWidth;
    const h = Math.min(560, Math.max(380, Math.round(w * 0.65)));
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  function pickLeaf(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(leafMeshes);
    return hits.find(h => !h.object.userData.isEmpty);
  }

  function onPointerMove(e) {
    const tooltip = document.getElementById('dashboard-tree-tooltip');
    const hit = pickLeaf(e.clientX, e.clientY);
    // Reset previous
    if (lastHovered && lastHovered !== (hit && hit.object)) {
      lastHovered.material.emissive.setHex(0x000000);
    }
    if (hit) {
      const leaf = hit.object;
      leaf.material.emissive.setHex(0x222200);
      lastHovered = leaf;
      const t = leaf.userData.tree;
      if (tooltip && t) {
        tooltip.innerHTML =
          '<strong>' + escapeHtml(t.common_name || t.species || 'Árbol') +
          ' <span style="opacity:0.7;">(' + escapeHtml(t.tree_code || '-') + ')</span></strong>' +
          'Salud: ' + (t.health_score || 0) + '/100 — ' + escapeHtml(t.status || '?') + '<br>' +
          'Campus: ' + escapeHtml(t.campus || '?');
        tooltip.style.display = 'block';
        tooltip.style.left = e.clientX + 'px';
        tooltip.style.top = e.clientY + 'px';
      }
      renderer.domElement.style.cursor = 'pointer';
      // Pause auto-rotate while hovering
      if (controls) controls.autoRotate = false;
    } else {
      if (lastHovered) {
        lastHovered.material.emissive.setHex(0x000000);
        lastHovered = null;
      }
      if (tooltip) tooltip.style.display = 'none';
      renderer.domElement.style.cursor = 'grab';
      // Resume auto-rotate after delay
      if (controls) {
        clearTimeout(window._bosqueResumeTimer);
        window._bosqueResumeTimer = setTimeout(() => {
          if (controls) controls.autoRotate = true;
        }, 3000);
      }
    }
  }

  function onPointerClick(e) {
    const hit = pickLeaf(e.clientX, e.clientY);
    if (hit) {
      const t = hit.object.userData.tree;
      if (t && t.id != null && typeof editAdminTree === 'function') {
        editAdminTree(parseInt(t.id, 10));
      }
    }
  }

  function onTouchStart(e) {
    if (!e.touches || !e.touches[0]) return;
    const t = e.touches[0];
    onPointerMove(t);
    setTimeout(() => {
      const tooltip = document.getElementById('dashboard-tree-tooltip');
      if (tooltip) tooltip.style.display = 'none';
    }, 2500);
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function animate() {
    animId = requestAnimationFrame(animate);
    if (controls) controls.update();
    // Wobble suave de hojas (efecto brisa)
    const t = Date.now() * 0.0008;
    for (let i = 0; i < leafMeshes.length; i++) {
      const leaf = leafMeshes[i];
      const ud = leaf.userData;
      leaf.position.y = ud.baseY + Math.sin(t + ud.wobblePhase) * 0.04;
      leaf.rotation.y = Math.sin(t * 0.7 + ud.wobblePhase) * 0.15;
    }
    renderer.render(scene, camera);
  }

  function destroy() {
    if (animId) cancelAnimationFrame(animId);
    animId = null;
    if (resizeHandler) window.removeEventListener('resize', resizeHandler);
    resizeHandler = null;
    if (renderer) {
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    }
    if (controls) controls.dispose();
    scene = camera = renderer = controls = null;
    leafMeshes = [];
    lastHovered = null;
  }

  function init(containerSelector, trees) {
    if (!window.THREE) {
      console.warn('Three.js no cargado — fallback al SVG');
      return false;
    }
    const container = typeof containerSelector === 'string'
      ? document.querySelector(containerSelector) : containerSelector;
    if (!container) return false;

    // Si ya hay un tree previo, destruirlo limpiamente
    destroy();

    containerEl = container;
    setupScene(container, trees || []);
    animate();
    return true;
  }

  // Expose
  window.DashboardTree3D = { init, destroy };
})();

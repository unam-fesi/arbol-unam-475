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

  function buildTree(trees) {
    const group = new THREE.Group();

    // ---- Tronco: TubeGeometry con curva natural ----
    const trunkPoints = [
      new THREE.Vector3(0,    0,    0),
      new THREE.Vector3(0.25, 1.5,  0.15),
      new THREE.Vector3(-0.15, 3,   0.05),
      new THREE.Vector3(0.15, 4.5, -0.10),
      new THREE.Vector3(0.05, 6,    0.05),
      new THREE.Vector3(0,    7.5,  0)
    ];
    const trunkCurve = new THREE.CatmullRomCurve3(trunkPoints);
    const trunkGeo = new THREE.TubeGeometry(trunkCurve, 32, 0.55, 14, false);

    // Bark material: dark brown roughness, no metalness
    const barkMat = new THREE.MeshStandardMaterial({
      color: 0x4a3a28,
      roughness: 0.95,
      metalness: 0.0,
      flatShading: false
    });

    // Vary trunk thickness manually (taper)
    const pos = trunkGeo.attributes.position;
    const tubeLen = trunkPoints.length - 1;
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
      // approximate height fraction
      const h = v.y / 7.5;
      const taper = 1 - h * 0.55; // thicker at base
      // distance from spine in horizontal plane
      const cx = trunkCurve.getPointAt(Math.min(1, h)).x;
      const cz = trunkCurve.getPointAt(Math.min(1, h)).z;
      const dx = v.x - cx;
      const dz = v.z - cz;
      v.x = cx + dx * taper;
      v.z = cz + dz * taper;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
    trunkGeo.computeVertexNormals();

    const trunk = new THREE.Mesh(trunkGeo, barkMat);
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    group.add(trunk);

    // ---- Ramas: 8 ramas radiales con curvatura ----
    const branchTips = [];
    const numBranches = 8;
    for (let i = 0; i < numBranches; i++) {
      const angle = (i / numBranches) * Math.PI * 2 + Math.random() * 0.3;
      const startY = 4.0 + Math.random() * 2.5;
      const startR = 0.35;
      const sx = Math.sin(angle) * startR;
      const sz = Math.cos(angle) * startR;
      const endR = 2.8 + Math.random() * 1.4;
      const endY = startY + 1.0 + Math.random() * 1.4;
      const ex = Math.sin(angle) * endR;
      const ez = Math.cos(angle) * endR;

      const branchCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(sx, startY, sz),
        new THREE.Vector3(
          (sx + ex) * 0.5 + (Math.random() - 0.5) * 0.6,
          (startY + endY) * 0.5 + 0.4,
          (sz + ez) * 0.5 + (Math.random() - 0.5) * 0.6
        ),
        new THREE.Vector3(ex, endY, ez)
      ]);
      const branchGeo = new THREE.TubeGeometry(branchCurve, 14, 0.14, 8, false);
      const branch = new THREE.Mesh(branchGeo, barkMat);
      branch.castShadow = true;
      group.add(branch);

      branchTips.push({ x: ex, y: endY, z: ez });

      // Sub-ramas
      if (Math.random() > 0.4) {
        const subTip = {
          x: ex + Math.cos(angle) * (0.6 + Math.random()),
          y: endY + 0.4 + Math.random() * 0.8,
          z: ez - Math.sin(angle) * (0.6 + Math.random())
        };
        const subCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(ex, endY, ez),
          new THREE.Vector3(
            (ex + subTip.x) * 0.5,
            (endY + subTip.y) * 0.5 + 0.2,
            (ez + subTip.z) * 0.5
          ),
          new THREE.Vector3(subTip.x, subTip.y, subTip.z)
        ]);
        const subGeo = new THREE.TubeGeometry(subCurve, 8, 0.08, 6, false);
        const sub = new THREE.Mesh(subGeo, barkMat);
        sub.castShadow = true;
        group.add(sub);
        branchTips.push(subTip);
      }
    }

    // ---- Hojas: 50 instancias coloreadas por salud ----
    leafMeshes = [];
    const leafGeo = new THREE.IcosahedronGeometry(0.42, 0);
    const totalSlots = 50;
    const sorted = (trees || []).slice().sort((a, b) => (b.health_score || 0) - (a.health_score || 0));
    const total = sorted.length;
    const scaled = total > totalSlots;

    for (let i = 0; i < totalSlots; i++) {
      const tip = branchTips[i % branchTips.length];
      // Spread leaves around branch tip in a small cluster
      const offset = new THREE.Vector3(
        (Math.random() - 0.5) * 1.6,
        (Math.random() - 0.3) * 1.0,
        (Math.random() - 0.5) * 1.6
      );

      let assignedTree = null;
      if (!scaled) assignedTree = sorted[i] || null;
      else assignedTree = sorted[Math.floor(i * total / totalSlots)] || null;

      const isEmpty = !(assignedTree && assignedTree.id != null);
      const score = assignedTree ? (assignedTree.health_score || 0) : null;
      const color = isEmpty ? 0xc5b5a0 : colorByHealth(score);

      const mat = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.7,
        metalness: 0.0,
        flatShading: true,
        emissive: 0x000000,
        transparent: isEmpty,
        opacity: isEmpty ? 0.35 : 1.0
      });
      const leaf = new THREE.Mesh(leafGeo, mat);
      leaf.position.set(tip.x + offset.x, tip.y + offset.y, tip.z + offset.z);
      const baseScale = isEmpty ? 0.55 : (0.75 + Math.random() * 0.45);
      leaf.scale.setScalar(baseScale);
      leaf.castShadow = !isEmpty;
      leaf.userData = {
        isLeaf: true,
        tree: assignedTree,
        isEmpty,
        baseScale,
        wobblePhase: Math.random() * Math.PI * 2,
        baseY: leaf.position.y
      };
      group.add(leaf);
      leafMeshes.push(leaf);
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
    camera.position.set(0, 7, 17);

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
      controls.minDistance = 11;
      controls.maxDistance = 28;
      controls.minPolarAngle = Math.PI / 7;
      controls.maxPolarAngle = Math.PI / 2.05;
      controls.target.set(0, 5.5, 0);
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

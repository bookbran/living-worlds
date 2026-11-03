// ══ THE CITY (2026-10-31, Dan on Shibuya: "better building data so this looks more
// realistic, with neon signs ... in urban places it's not THE FOREST it should be trees
// in the city ... the sound of people in a public space ... important contextual
// landmarks ... we can click on those images and the map gently flies there and we can
// experience the sounds of that place"). A world built with "setting": "city" gets:
//   buildings at their measured heights with windows that light up after dusk,
//   blade signs carrying the real shop names, stacked up the facades, and fascia signs,
//   the big video screens over the crossing,
//   the Scramble's crowd, crossing when the lights stop every car at once,
//   the walk tones, the platforms' announcements and melodies, people talking,
//   and the places to visit, each a picture you press to fly there and hear it.
const CM = meta.city || {};
// a world's own files: inside the page as a block when it was saved as one file (Groundstation),
// else beside it in its folder (the brain's Earth maps)
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav' };
const fileUrl = (rel) => { const e = inside('f-' + rel.toLowerCase().replace(/[^a-z0-9]+/g, '-')); return e ? 'data:' + (MIME[rel.split('.').pop().toLowerCase()] || 'application/octet-stream') + ';base64,' + e : DATA + rel; };
const NIGHT = { value: 0 };
const REC = {};
const PLACES = (CM.places || []).map((p) => ({ ...p, g: sampleHeight(p.xy[0], p.xy[1]) }));
const BLD = [];
const hash1 = (a, b = 0) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
const signMats = [];
// ══ TOUCHES (2026-10-31, Dan: "start really small and prove the system can be added on
// like this in a great way by hundreds of people later"). The community's additions,
// laid on by the builder (touches.py, touches/TOUCH.md): each hangs on a building's
// permanent id, a place or a point, may keep to its hours, and is credited by name.
const TOUCHES = Array.isArray(meta.touches) ? meta.touches : [];
const TOUCH_REPORT = Array.isArray(meta.touch_report) ? meta.touch_report : [];
const FACADES = new Map(TOUCHES.filter((t) => t.kind === 'facade' && t.anchor && t.anchor.building).map((t) => [t.anchor.building, t]));
const HOUR = { value: 12 };
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
function inWhen(w) {   // the slider's hour, today's day and date
  if (!w) return true;
  if (w.hours) { const [a, b] = w.hours, h = HOUR.value; if (a <= b ? (h < a || h >= b) : (h < a && h >= b)) return false; }
  const now = new Date();
  if (w.days && !w.days.map((d) => d.slice(0, 3).toLowerCase()).includes(DAYS[now.getDay()])) return false;
  if (w.dates && !w.dates.includes(String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0'))) return false;
  return true;
}
function dressFacade(G) {   // a building in the skin someone gave it: their texture across its walls, its crown lettered
  const f = G.T.facade || {}, [tw, th] = f.tile_m || [4, 3.4];
  // the walls wear the touch's texture; the roof stays the aerial photo of itself (2026-11-01, Dan:
  // "the roof doesn't look like the sides do, use the satellite for the roof")
  const WP = [], WN = [], WUV = [], RP = [], RN = [], RUV = [], ex = core.extent;
  for (let k = 0; k < G.P.length / 3; k++) {
    const roof = G.N[k * 3 + 1] > 0.45;
    (roof ? RP : WP).push(G.P[k * 3], G.P[k * 3 + 1], G.P[k * 3 + 2]); (roof ? RN : WN).push(G.N[k * 3], G.N[k * 3 + 1], G.N[k * 3 + 2]);
    if (roof) RUV.push((G.P[k * 3] - ex[0]) / (ex[2] - ex[0]), (-G.P[k * 3 + 2] - ex[1]) / (ex[3] - ex[1]));
    else WUV.push(G.UV[k * 2] / tw, G.UV[k * 2 + 1] / th);
  }
  if (RP.length) {
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(RP, 3)); rg.setAttribute('normal', new THREE.Float32BufferAttribute(RN, 3)); rg.setAttribute('uv', new THREE.Float32BufferAttribute(RUV, 2));
    const rm = new THREE.Mesh(rg, living(new THREE.MeshStandardMaterial({ map: corePhoto, roughness: 0.9, metalness: 0 }), false)); rm.castShadow = rm.receiveShadow = true; scene.add(rm);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(WP, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(WN, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(WUV, 2));
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: f.metalness ?? 0.1, roughness: f.roughness ?? 0.7 });
  if (f.texture) new THREE.TextureLoader().load(fileUrl(G.T.dir + f.texture), (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    mat.map = t; mat.needsUpdate = true;
  });
  const mesh = new THREE.Mesh(g, living(mat, false)); mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh);
  if (f.crown && f.crown.text) {   // its name in a band round the top, lit like a sign
    const c = document.createElement('canvas'); c.width = 1024; c.height = 128; const x = c.getContext('2d');
    x.fillStyle = f.crown.ground || '#222'; x.fillRect(0, 0, 1024, 128);
    x.fillStyle = f.crown.ink || '#fff'; x.font = '800 92px "Roboto Condensed", "Arial Narrow", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(f.crown.text, 512, 68);
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
    const hb = f.crown.height_m || 3, span = hb * 8, P = [], UV = [];
    for (const r of G.rings) {
      let u = 0; const y0 = r.top - hb - 0.6, y1 = r.top - 0.6;
      for (const e of r.edges) {
        const o = 0.06, ax = e.a[0] + e.n[0] * o, ay = e.a[1] + e.n[1] * o, bx = e.b[0] + e.n[0] * o, by = e.b[1] + e.n[1] * o, u1 = u + e.L / span;
        for (const [px, py, pz, uu, vv] of [[ax, y0, -ay, u, 0], [bx, y0, -by, u1, 0], [bx, y1, -by, u1, 1], [ax, y0, -ay, u, 0], [bx, y1, -by, u1, 1], [ax, y1, -ay, u, 1]]) { P.push(px, py, pz); UV.push(uu, vv); }
        u = u1;
      }
    }
    const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); cg.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
    const cm = new THREE.MeshBasicMaterial({ map: t }); signMats.push(cm); scene.add(new THREE.Mesh(cg, cm));
  }
}
// materials: a photographed rock or moss laid into the land's own rock where it reaches
function touchMaterials() {
  for (const t of TOUCHES.filter((q) => q.kind === 'material')) {
    const m = t.material || {}, slot = m.layer === 'moss' ? ['uMossMap', 'uMatM'] : ['uRockMap', 'uMatR'];
    new THREE.TextureLoader().load(fileUrl(t.dir + m.texture), (tx) => {
      tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = renderer.capabilities.getMaxAnisotropy();
      U[slot[0]].value = tx;
      U[slot[1]].value.set(t.xy[0], -t.xy[1], m.reach_m || 400, m.tile_m || 4);
    });
  }
}
// rules: one small rule that changes everything it reaches. The first is moss, by the way a face turns
const FACING = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };   // world x and z
function touchRules() {
  for (const t of TOUCHES.filter((q) => q.kind === 'rule')) {
    const r = t.rule || {};
    if (r.what === 'moss') {
      const f = FACING[String(r.where || 'north').replace('-facing', '')] || FACING.north;
      U.uMossRule.value.set(t.xy[0], -t.xy[1], r.reach_m || 400, Math.max(0, Math.min(1, r.amount ?? 0.8)));
      U.uMossFace.value.set(f[0], f[1]);
    }
  }
}
// THE CANOPY SHELL (2026-11-01, beside Google Earth's view of Dan's block): the lidar's canopy as a
// surface at its real heights, wearing the aerial photo, so a grove has its true mass, outline and
// colour from above and the side. Lower in the canopy is darker, as a crown's inside is; its edges
// slope down to the ground the way a photographed canopy does.
const CANOPY = meta.canopy ? await f32('canopy.bin') : null;
function canopyShell() {
  if (!CANOPY || !meta.canopy) return 0;
  const [W, H] = meta.canopy.grid, cc = meta.canopy.cell || cell / 2, ex = core.extent;
  const c = new Float32Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {   // a light blur, so crowns are round, not pixels
    let s = 0, n = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= W || b >= H) continue; const w = di || dj ? 1 : 2; s += CANOPY[b * W + a] * w; n += w; }
    c[j * W + i] = s / n;
  }
  const P = new Float32Array(W * H * 3), UV = new Float32Array(W * H * 2), C = new Float32Array(W * H * 3);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i, x = ex[0] + (i + 0.5) * cc, y = ex[3] - (j + 0.5) * cc, h = c[k];
    const bump = h > 2 ? (hash1(i * 0.37, j * 0.71) - 0.5) * Math.min(1.6, h * 0.07) : 0;   // foliage is never a smooth sheet
    const g = smoothHeight(x, y);
    P[k * 3] = x; P[k * 3 + 1] = h > 1.5 ? g + h + bump : g - 0.4; P[k * 3 + 2] = -y;
    UV[k * 2] = (x - ex[0]) / (ex[2] - ex[0]); UV[k * 2 + 1] = (y - ex[1]) / (ex[3] - ex[1]);
    const shade = h > 1.5 ? 0.62 + 0.42 * Math.min(1, h / 28) : 0.45;
    C[k * 3] = C[k * 3 + 1] = C[k * 3 + 2] = shade;
  }
  const idx = [];
  for (let j = 0; j + 1 < H; j++) for (let i = 0; i + 1 < W; i++) {
    const a = j * W + i, b = a + 1, d = a + W, e = d + 1;
    if (Math.max(c[a], c[b], c[d], c[e]) < 2.5) continue;
    idx.push(a, d, b, b, d, e);
  }
  if (!idx.length) return 0;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.BufferAttribute(UV, 2)); g.setAttribute('color', new THREE.BufferAttribute(C, 3));
  g.setIndex(idx); g.computeVertexNormals();
  const mat = living(new THREE.MeshStandardMaterial({ map: corePhoto, vertexColors: true, roughness: 0.96, metalness: 0, side: THREE.DoubleSide }), false);
  const mesh = new THREE.Mesh(g, mat); mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh);
  return idx.length / 6;
}
// VEHICLES (2026-11-01, Dan: "the vehicles that appear flattened from satellite you'd guess at what
// they are and model those too"): each one the aerial photo shows stands where it is parked, its
// length, width and heading from the photo, its body the photo's colour, its kind a guess from its
// size: a car, an SUV, a van or a pickup. Glass and tyres are dark; one draw per kind.
const VEHICLE = {   // real sizes (m) and side profiles, x forward, y up: the painted body, then the glass above it
  car:    { L: 4.6, W: 1.8, body: [[-2.3, .3], [2.3, .3], [2.33, .6], [2.18, .8], [1.15, .9], [-1.6, .93], [-2.25, .84], [-2.33, .58]],
            glass: [[1.15, .9], [.5, 1.4], [-.8, 1.43], [-1.6, .93]] },
  suv:    { L: 4.8, W: 1.95, body: [[-2.4, .36], [2.4, .36], [2.43, .74], [2.22, .98], [1.3, 1.06], [-2.36, 1.08], [-2.43, .8]],
            glass: [[1.3, 1.06], [.72, 1.68], [-2.22, 1.72], [-2.36, 1.08]] },
  van:    { L: 5.1, W: 2.0, body: [[-2.55, .36], [2.55, .36], [2.58, .8], [2.3, 1.04], [1.7, 1.1], [-2.55, 1.12], [-2.58, .9]],
            glass: [[1.7, 1.1], [1.05, 1.95], [-2.45, 1.98], [-2.55, 1.12]] },
  pickup: { L: 5.6, W: 2.0, body: [[-2.8, .42], [2.8, .42], [2.83, .86], [2.55, 1.1], [1.6, 1.15], [-2.8, 1.15], [-2.83, .9]],
            glass: [[1.6, 1.15], [1.08, 1.76], [-.22, 1.79], [-.36, 1.15]] },
};
function vehicleGeometry(kind) {
  const V = VEHICLE[kind] || VEHICLE.car, parts = [];
  const paint = (g, shade) => { g = g.index ? g.toNonIndexed() : g; if (g.attributes.uv) g.deleteAttribute('uv'); const n = g.attributes.position.count; g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(shade), 3)); parts.push(g); };
  const slab = (pts, depth, bevel) => { const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 });
    g.translate(0, 0, -depth / 2); g.computeVertexNormals(); return g; };
  paint(slab(V.body, V.W - 0.1, 0.05), 1);                                     // the body, its colour
  paint(slab(V.glass, V.W - 0.28, 0.04), 0.13);                               // the glasshouse
  if (kind === 'pickup') paint(new THREE.BoxGeometry(2.3, 0.06, V.W - 0.3).translate(-1.55, 1.12, 0), 0.35);   // the bed's floor, seen from above
  const wx = V.L / 2 - 0.82;
  for (const sx of [-wx, wx]) for (const sz of [-1, 1]) {
    const t = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 18).rotateX(Math.PI / 2).translate(sx, 0.34, sz * (V.W / 2 - 0.16));
    paint(t, 0.05);
    paint(new THREE.CylinderGeometry(0.19, 0.19, 0.25, 12).rotateX(Math.PI / 2).translate(sx, 0.34, sz * (V.W / 2 - 0.155)), 0.55);   // the hubs
  }
  return mergeGeometries(parts);
}
function cityVehicles() {
  const list = Array.isArray(meta.vehicles) ? meta.vehicles : [];
  if (!list.length) return 0;
  const byKind = {};
  for (const v of list) (byKind[v.kind] = byKind[v.kind] || []).push(v);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
  for (const [kind, vs] of Object.entries(byKind)) {
    const im = new THREE.InstancedMesh(vehicleGeometry(kind), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.35 }), vs.length);
    vs.forEach((v, i) => {
      // the photo's colour of a car is lit from above and a little washed out: deepen it a touch
      col.set(v.colour); const hsl = {}; col.getHSL(hsl); col.setHSL(hsl.h, Math.min(1, hsl.s * 1.25), Math.max(0.06, Math.min(0.9, hsl.l * 0.92)));
      im.setColorAt(i, col);
      const V = VEHICLE[kind] || VEHICLE.car;   // a real-sized model, only nudged toward what the photo measured
      m4.compose(pos.set(v.at[0], sampleHeight(v.at[0], v.at[1]), -v.at[1]), q.setFromAxisAngle(up, v.yaw), sc.set(THREE.MathUtils.clamp(v.len / V.L, 0.88, 1.12), 1, THREE.MathUtils.clamp(v.wid / V.W, 0.92, 1.08)));
      im.setMatrixAt(i, m4);
    });
    im.castShadow = im.receiveShadow = true; scene.add(im);
  }
  return list.length;
}
// creatures: a cat (for now) that roams near where it was left, in its hours
const CREATURES = [];
function catModel(colour) {
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(colour || '#d98c45'), roughness: 0.95 });
  const g = new THREE.Group(), add = (geo, x, y, z, s) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); if (s) o.scale.set(...s); o.castShadow = true; g.add(o); return o; };
  add(new THREE.SphereGeometry(0.1, 10, 8), 0, 0.17, 0, [1, 0.9, 2.1]);                 // body
  const head = add(new THREE.SphereGeometry(0.075, 10, 8), 0, 0.27, 0.22);              // head
  for (const sx of [-1, 1]) add(new THREE.ConeGeometry(0.028, 0.06, 4), sx * 0.04, 0.34, 0.22);   // ears
  for (const [x, z] of [[-0.05, 0.13], [0.05, 0.13], [-0.05, -0.12], [0.05, -0.12]]) add(new THREE.CylinderGeometry(0.018, 0.016, 0.13, 5), x, 0.065, z);   // legs
  const tail = new THREE.Group(); tail.position.set(0, 0.2, -0.2); g.add(tail);
  const tm = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.26, 5), m); tm.position.set(0, 0.1, -0.06); tm.rotation.x = -0.6; tail.add(tm);
  return { g, tail, head };
}
// a squirrel and a rabbit (2026-11-01, Dan: "crows and squirrels, and a lot of rabbits")
function squirrelModel(colour) {
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(colour || '#7a6a5a'), roughness: 0.95 }), belly = new THREE.MeshStandardMaterial({ color: 0xd9d0c2, roughness: 0.95 });
  const g = new THREE.Group(), add = (geo, mat, x, y, z, sc) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); if (sc) o.scale.set(...sc); o.castShadow = true; g.add(o); return o; };
  add(new THREE.SphereGeometry(0.06, 10, 8), m, 0, 0.08, 0, [1, 1.05, 1.7]);
  add(new THREE.SphereGeometry(0.045, 8, 6), belly, 0, 0.06, 0.02, [0.8, 0.8, 1.3]);
  const head = add(new THREE.SphereGeometry(0.04, 10, 8), m, 0, 0.13, 0.1);
  for (const sx of [-1, 1]) add(new THREE.ConeGeometry(0.012, 0.03, 4), m, sx * 0.022, 0.17, 0.1);
  const tail = new THREE.Group(); tail.position.set(0, 0.08, -0.09); g.add(tail);
  const tm = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), m); tm.scale.set(0.8, 2.4, 0.8); tm.position.set(0, 0.1, -0.03); tm.rotation.x = -0.35; tail.add(tm);
  return { g, tail, head, hop: 0.03, speed: 1.6, pause: [1, 4] };
}
function rabbitModel(colour) {
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(colour || '#8a7560'), roughness: 0.97 }), white = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.97 });
  const g = new THREE.Group(), add = (geo, mat, x, y, z, sc, rx) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); if (sc) o.scale.set(...sc); if (rx) o.rotation.x = rx; o.castShadow = true; g.add(o); return o; };
  add(new THREE.SphereGeometry(0.09, 10, 8), m, 0, 0.1, -0.02, [1, 0.95, 1.35]);
  const head = add(new THREE.SphereGeometry(0.055, 10, 8), m, 0, 0.17, 0.11);
  for (const sx of [-1, 1]) add(new THREE.CapsuleGeometry(0.014, 0.08, 3, 6), m, sx * 0.022, 0.25, 0.09, null, -0.25);
  add(new THREE.SphereGeometry(0.03, 8, 6), white, 0, 0.12, -0.14);
  const tail = new THREE.Group(); g.add(tail);
  return { g, tail, head, hop: 0.07, speed: 1.1, pause: [3, 12] };
}
function creatureModel(type, colour) {
  if (type === 'squirrel') return squirrelModel(colour);
  if (type === 'rabbit') return rabbitModel(colour);
  return Object.assign(catModel(colour), { hop: 0.012, speed: 0.55, pause: [2, 9] });
}
// trees someone planted by touch: a magnolia in the front yard, standing as its species
function touchTrees() {
  for (const t of TOUCHES.filter((q) => q.kind === 'tree')) {
    const r = t.tree || {}, want = String(r.species || '').toLowerCase();
    let sp = SPECIES.findIndex((q) => q.name.toLowerCase() === want);
    if (sp < 0) sp = SPECIES.findIndex((q) => !!q.broad === (r.form !== 'conifer'));
    if (sp < 0) sp = 0;
    plan.push({ x: t.xy[0], y: t.xy[1], g: sampleHeight(t.xy[0], t.xy[1]), h: r.height_m || 9, sp, rot: hash1(t.xy[0], t.xy[1]) * 6.283, wide: r.wide || 1, tint: 0.5 });
  }
}
function touchCreatures() {
  for (const t of TOUCHES.filter((q) => q.kind === 'creature')) {
    const c = t.creature || {};
    for (let i = 0; i < Math.min(6, c.count || 1); i++) {
      const cat = creatureModel(c.type, c.colour), at = [t.xy[0] + (Math.random() - 0.5) * 6, t.xy[1] + (Math.random() - 0.5) * 6];
      scene.add(cat.g);
      CREATURES.push({ t, cat, x: at[0], y: at[1], tx: at[0], ty: at[1], rest: Math.random() * 3, yaw: Math.random() * 6.28, roam: c.roam_m || 12 });
    }
  }
}
function moveCreatures(dt, time) {
  for (const k of CREATURES) {
    const on = inWhen(k.t.when); k.cat.g.visible = on; if (!on) continue;
    const dx = k.tx - k.x, dy = k.ty - k.y, d = Math.hypot(dx, dy);
    const P = k.cat.pause || [2, 9];
    if (d < 0.08) { k.rest -= dt; if (k.rest < 0) { const a = Math.random() * 6.283, r = Math.random() * k.roam; k.tx = k.t.xy[0] + Math.cos(a) * r; k.ty = k.t.xy[1] + Math.sin(a) * r; k.rest = P[0] + Math.random() * (P[1] - P[0]); } }
    else { const st = Math.min(d, (k.cat.speed || 0.55) * dt); k.x += dx / d * st; k.y += dy / d * st; k.yaw = Math.atan2(dx, -dy) + Math.PI; }
    const walking = d >= 0.08;
    k.cat.g.position.set(k.x, sampleHeight(k.x, k.y) + (walking ? Math.abs(Math.sin(time * (k.cat.hop > 0.05 ? 6 : 9))) * (k.cat.hop || 0.012) : 0), -k.y);
    k.cat.g.rotation.y = k.yaw;
    k.cat.tail.rotation.z = Math.sin(time * (walking ? 3 : 1.2)) * 0.5;
    k.cat.head.rotation.y = walking ? 0 : Math.sin(time * 0.4 + k.x) * 0.6;
  }
}
// the touches, credited, in the panel: what is in, what waits for its anchor, what was turned away and why
// ADD YOUR OWN (2026-10-31, Dan: "a button ... that invites people to add their own to make
// the scene look even better by working with their agents"): it sits at the foot of the
// list, lower right, and hands the ask to the chat through Earth maps (which forwards it
// only because its card lists how the ask begins)
function touchesHtml(esc) {
  const dot = { in: 'in', waiting: 'wait', 'turned away': 'away' };
  return '<div class="set touches"><b>Touches · added by people</b>' + (TOUCH_REPORT.length ? TOUCH_REPORT.map((r) =>
    '<div class="touch ' + dot[r.status] + '" data-id="' + esc(r.id) + '"><i></i><span class="tt">' + esc(r.title) + '</span><span class="by">' + esc(r.by) +
    (r.status === 'in' ? '' : ' · ' + esc(r.status)) + '</span>' + (r.why ? '<span class="why">' + esc(r.why) + (r.fix ? '. ' + esc(r.fix) : '') + '</span>' : '') + '</div>').join('')
    : '<div class="touch-none">No touches yet. This place is waiting for its first.</div>') +
    '<button type="button" class="add-touch" title="Work with your agent on a touch that makes this place more true to life">Add your own touch</button></div>';
}
function askForTouch() {
  const msg = { type: 'living-world:add-touch', world: document.title.replace(/, a living world$/, ''), slug: DATA.replace(/^\.\/world-|\/$/g, '') };
  try { (parent !== window ? parent : window).postMessage(msg, '*'); } catch (_) {}
}
function goToTouch(id) {
  const t = TOUCHES.find((q) => q.id === id); if (!t) return;
  const g = sampleHeight(t.xy[0], t.xy[1]), T = new THREE.Vector3(t.xy[0], g + (t.kind === 'facade' ? 25 : 0.3), -t.xy[1]);
  const from = camera.position.clone().sub(T).setY(0); if (from.lengthSq() < 4) from.set(1, 0, 1); from.normalize();
  const near = t.kind === 'creature';
  if (near && t.when && t.when.hours && !inWhen(t.when)) { tod.value = (t.when.hours[0] + 1) % 24; setSun(Number(tod.value)); }
  const C = near ? CREATURES.find((k) => k.t.id === id) : null;
  if (C) T.set(C.x, g + 0.2, -C.y);
  fly = { t: 0, p0: camera.position.clone(), t0: controls.target.clone(), p1: T.clone().addScaledVector(from, near ? 3.2 : 90).add(new THREE.Vector3(0, near ? 1.4 : 30, 0)), t1: T };
  if (meeting) meeting.until = 0;
}
function cityBuildings() {
  const list = Array.isArray(meta.buildings) ? meta.buildings : [];
  const PAL = [
    ['#dcd7cc', '#cdbfa8', '#a89a88', '#8f9497', '#e6e3dc', '#b9a58c', '#c4c7c9', '#9c8f80', '#d9cfc0'],   // small: tile, render, concrete
    ['#b7bcc1', '#9fa7ae', '#cfcac1', '#8a9298', '#c9c3b6', '#aeb4ad'],                                    // offices
    ['#7d8b97', '#6a7886', '#8e9fac', '#5f6d7a', '#94a3ae'],                                               // glass towers
  ];
  const P = [], N = [], C = [], UV = [], B = [];
  const own = new Map();   // buildings a facade touch dresses, drawn apart with their own skin
  const wc = new THREE.Color(), rc = new THREE.Color();
  for (const b of list) {
    if (!Array.isArray(b.p) || b.p.length < 3) continue;
    let pts = b.p;
    let A = 0; for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]; A += x1 * y2 - x2 * y1; }
    if (Math.abs(A) < 4) continue;
    if (A < 0) pts = pts.slice().reverse();
    const h = Math.max(3, b.h || 8);
    let base = Infinity, cx = 0, cy = 0;
    for (const [x, y] of pts) { base = Math.min(base, sampleHeight(x, y)); cx += x; cy += y; }
    cx /= pts.length; cy /= pts.length; base -= 0.4;
    const top = base + h + 0.4;
    const style = h >= 70 ? 2 : h >= 22 ? 1 : 0, seed = hash1(cx * 0.37, cy * 0.53);
    // a neighbourhood of houses: the study's own wall and roof colours, and pitched roofs
    // (2026-11-01, Dan's block in Beaumont-Wilshire)
    const ST = PROFILE.structures || {}, ownWalls = Array.isArray(ST.walls) && style === 0 ? ST.walls : null, ownRoofs = Array.isArray(ST.roofs) ? ST.roofs : null;
    try { wc.set(b.wall || (ownWalls ? ownWalls[Math.floor(seed * ownWalls.length)] : PAL[style][Math.floor(seed * PAL[style].length)])); } catch (_) { wc.set(PAL[style][0]); }
    try { rc.set(b.roof || (ownRoofs ? ownRoofs[Math.floor(hash1(seed * 7) * ownRoofs.length)] : '#6d7176')); } catch (_) { rc.set('#6d7176'); }
    if (!b.roof && !ownRoofs) rc.multiplyScalar(0.8 + 0.35 * hash1(seed * 91));
    const pitched = ST.roof_form === 'pitched' && style === 0 && h < 14 && Math.abs(A) < 1200;
    const roofH = pitched ? Math.min(3.6, Math.max(1.5, Math.sqrt(Math.abs(A)) * 0.24)) : 0, wallTop = top - roofH;
    wc.multiplyScalar(0.92 + 0.16 * hash1(seed * 13));
    const rec = { id: b.id, pts, h, base, top, c: [cx, cy], style, seed, name: b.name, edges: [] };
    const T = b.id && FACADES.get(b.id);
    const G = T ? (own.get(T.id) || own.set(T.id, { T, P: [], N: [], UV: [], rings: [] }).get(T.id)) : null;
    if (G) G.rings.push(rec);
    let u = 0;
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
      if (L < 0.05) continue;
      const nx = dy / L, nz = dx / L;   // outward, in world x and z
      const quad = [[ax, base, -ay, u, 0], [bx, base, -by, u + L, 0], [bx, wallTop, -by, u + L, wallTop - base], [ax, base, -ay, u, 0], [bx, wallTop, -by, u + L, wallTop - base], [ax, wallTop, -ay, u, wallTop - base]];
      for (const [x, y, z, uu, vv] of quad) { if (G) { G.P.push(x, y, z); G.N.push(nx, 0, nz); G.UV.push(uu, vv); continue; } P.push(x, y, z); N.push(nx, 0, nz); C.push(wc.r, wc.g, wc.b); UV.push(uu, vv); B.push(pitched ? 3 : style, seed, 1); }
      rec.edges.push({ a: [ax, ay], b: [bx, by], L, n: [dy / L, -dx / L], used: 0 });
      u += L;
    }
    let capPts = pts, capY = top;
    if (pitched) {
      const ins = pts.map(([x, y]) => [cx + (x - cx) * 0.3, cy + (y - cy) * 0.3]);
      const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nn = new THREE.Vector3();
      for (let i = 0; i < pts.length; i++) {
        const a0 = pts[i], b0 = pts[(i + 1) % pts.length], a1 = ins[i], b1 = ins[(i + 1) % pts.length];
        const PA = [a0[0], wallTop, -a0[1]], PB = [b0[0], wallTop, -b0[1]], QB = [b1[0], top, -b1[1]], QA = [a1[0], top, -a1[1]];
        e1.set(PB[0] - PA[0], PB[1] - PA[1], PB[2] - PA[2]); e2.set(QB[0] - PA[0], QB[1] - PA[1], QB[2] - PA[2]); nn.crossVectors(e1, e2).normalize();
        for (const q of [PA, PB, QB, PA, QB, QA]) { const T = G || null; if (T) { T.P.push(...q); T.N.push(nn.x, nn.y, nn.z); T.UV.push(q[0], -q[2]); } else { P.push(...q); N.push(nn.x, nn.y, nn.z); C.push(rc.r, rc.g, rc.b); UV.push(q[0], -q[2]); B.push(style, seed, 0); } }
      }
      capPts = ins;
    }
    const tris = THREE.ShapeUtils.triangulateShape(capPts.map(([x, y]) => new THREE.Vector2(x, y)), []);
    for (let [i, j, k] of tris) {
      const [x1, y1] = capPts[i], [x2, y2] = capPts[j], [x3, y3] = capPts[k];
      if ((x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1) < 0) [j, k] = [k, j];
      for (const q of [i, j, k]) { const [x, y] = capPts[q]; if (G) { G.P.push(x, capY, -y); G.N.push(0, 1, 0); G.UV.push(x, y); continue; } P.push(x, capY, -y); N.push(0, 1, 0); C.push(rc.r, rc.g, rc.b); UV.push(x, y); B.push(style, seed, 0); }
    }
    BLD.push(rec);
  }
  if (!P.length) return 0;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setAttribute('aUV', new THREE.Float32BufferAttribute(UV, 2));
  g.setAttribute('aB', new THREE.Float32BufferAttribute(B, 3));
  const mat = living(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.05 }), false);
  const before = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh) => {
    before(sh);
    sh.uniforms.uNight = NIGHT;
    sh.uniforms.uPhoto = { value: corePhoto }; sh.uniforms.uExt = { value: new THREE.Vector4(core.extent[0], core.extent[1], core.extent[2], core.extent[3]) };
    sh.vertexShader = 'attribute vec2 aUV; attribute vec3 aB; varying vec2 vUV; varying vec3 vB;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vUV = aUV; vB = aB;');
    sh.fragmentShader = `uniform float uNight; uniform sampler2D uPhoto; uniform vec4 uExt; varying vec2 vUV; varying vec3 vB;
      float hb(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
      // windows: a grid of floors and bays per building, its own spacing by kind; the shop floor is glass
      vec3 windows() {
        if (vB.z < 0.5) return vec3(0.0);
        float st = vB.x;
        if (st > 2.5) {   // A HOUSE (2026-11-01, Dan: "the facades of these homes look like white rectangles"):
          // a storey of about 2.9 m, windows a few metres apart with a little jitter, no shopfront
          float cwH = 3.1 + vB.y * 1.2, fhH = 2.9;
          vec2 cellH = vec2(floor(vUV.x / cwH), floor(vUV.y / fhH)), fH = vec2(fract(vUV.x / cwH), fract(vUV.y / fhH));
          float skip = step(0.78, hb(cellH * 3.1 + vB.y));                           // not every bay has a window
          float mH = step(abs(fH.x - 0.5 - (hb(cellH) - 0.5) * 0.2), 0.2) * step(abs(fH.y - 0.55), 0.24) * (1.0 - skip) * step(0.6, vUV.y);
          return vec3(mH, step(hb(cellH + vB.y * 37.0), 0.4), hb(cellH * 1.7 + vB.y));
        }
        float fh = st > 1.5 ? 4.0 : st > 0.5 ? 3.7 : 3.1;
        float cw = st > 1.5 ? 1.5 : st > 0.5 ? 2.2 + vB.y * 0.8 : 1.8 + vB.y * 1.6;
        vec2 cell = vec2(floor(vUV.x / cw), floor(vUV.y / fh));
        vec2 f = vec2(fract(vUV.x / cw), fract(vUV.y / fh));
        float wx = st > 1.5 ? 0.9 : st > 0.5 ? 0.7 : 0.5, wy = st > 1.5 ? 0.82 : 0.55;
        float m = step(abs(f.x - 0.5), wx * 0.5) * step(abs(f.y - 0.55), wy * 0.5);
        if (vUV.y < 4.0) m = step(abs(fract(vUV.x / 4.5) - 0.5), 0.44) * step(0.35, vUV.y) * step(vUV.y, 3.3);   // a shopfront (not a house)
        float lit = step(hb(cell + vB.y * 37.0), st > 1.5 ? 0.5 : 0.62);
        if (vUV.y < 4.0) lit = step(hb(vec2(floor(vUV.x / 4.5), vB.y * 11.0)), 0.85);
        return vec3(m, lit, hb(cell * 1.7 + vB.y));
      }\n` + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 W = windows();
        // glass: dark, with blinds or curtains behind some panes, reflecting only at a glancing angle
        vec3 pane = mix(vec3(0.03, 0.04, 0.05), vec3(0.16, 0.15, 0.13), step(0.72, W.z) * 0.8);
        if (vB.x > 2.5 && vB.z > 0.5) {   // a house wall: lap siding in its own colour, light trim round each window
          float cwT = 3.1 + vB.y * 1.2, fhT = 2.9;
          vec2 fT = vec2(fract(vUV.x / cwT), fract(vUV.y / fhT)), cT = vec2(floor(vUV.x / cwT), floor(vUV.y / fhT));
          float hasWin = 1.0 - step(0.78, hb(cT * 3.1 + vB.y));
          float trim = step(abs(fT.x - 0.5 - (hb(cT) - 0.5) * 0.2), 0.235) * step(abs(fT.y - 0.55), 0.28) * hasWin * step(0.6, vUV.y) * (1.0 - W.x);
          diffuseColor.rgb *= 1.0 - 0.13 * smoothstep(0.0, 0.18, fract(vUV.y / 0.2)) * (1.0 - smoothstep(0.18, 0.3, fract(vUV.y / 0.2)));   // the shadow line under each board
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.76, 0.71), trim * 0.85);
          diffuseColor.rgb *= 1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.5, vUV.y));   // the foundation, darker at the foot
        }
        diffuseColor.rgb = mix(diffuseColor.rgb, pane, W.x * 0.94);
        if (vB.z > 0.5 && vB.x < 2.5) diffuseColor.rgb *= 1.0 - 0.07 * step(fract(vUV.y / 3.6), 0.07);
        // REAL ROOFS (2026-11-01, Dan: "build a thing that gets roof color and texture well"): within
        // the aerial photo a roof wears the photo of itself, shingles, patches, vents and panels;
        // where a tree hangs over it, or deep shadow, the roof's own colour (the builder's median) shows
        if (vB.z < 0.5 && vWP.x > uExt.x && vWP.x < uExt.z && -vWP.z > uExt.y && -vWP.z < uExt.w) {
          vec2 puv = vec2((vWP.x - uExt.x) / (uExt.z - uExt.x), (-vWP.z - uExt.y) / (uExt.w - uExt.y));
          // the roof's own even colour, with only the photo's light and dark (softened over about a
          // metre) on top, so a roof reads as one material, not a patchwork (2026-11-01: "splotchy")
          vec2 px = 0.7 / vec2(uExt.z - uExt.x, uExt.w - uExt.y);
          vec3 ph = (texture2D(uPhoto, puv).rgb * 2.0 + texture2D(uPhoto, puv + vec2(px.x, 0.0)).rgb + texture2D(uPhoto, puv - vec2(px.x, 0.0)).rgb
                   + texture2D(uPhoto, puv + vec2(0.0, px.y)).rgb + texture2D(uPhoto, puv - vec2(0.0, px.y)).rgb) / 6.0;
          float leaf = smoothstep(0.0, 0.04, ph.g - max(ph.r * 1.04, ph.b)), dk = 1.0 - smoothstep(0.03, 0.08, ph.r + ph.g + ph.b);
          float lumP = dot(ph, vec3(0.3, 0.55, 0.15)), lumR = max(0.02, dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15)));
          float detail = clamp(pow(lumP / lumR, 0.5), 0.82, 1.18);
          diffuseColor.rgb *= mix(detail, 1.0, max(leaf, dk));
        }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.22, W.x);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = mix(metalnessFactor, 0.0, W.x);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        vec3 warm = mix(vec3(1.0, 0.74, 0.45), vec3(0.82, 0.9, 1.0), step(0.62, W.z));
        float shop = step(vUV.y, 4.0) * vB.z * step(vB.x, 2.5);   // houses have no shopfront glow
        totalEmissiveRadiance += W.x * W.y * warm * uNight * (1.4 + 1.4 * W.z) * (1.0 - shop) + shop * W.x * W.y * vec3(1.0, 0.94, 0.84) * (0.5 + uNight * 3.5);`);
  };
  mat.customProgramCacheKey = () => 'city-buildings';
  const mesh = new THREE.Mesh(g, mat); mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh);
  for (const G of own.values()) dressFacade(G);
  return BLD.length;
}
// the facade nearest a point, within reach: which building, which edge, how far along
const EDGE_GRID = new Map();
function indexEdges() {
  BLD.forEach((b, bi) => b.edges.forEach((e, ei) => {
    const x0 = Math.floor(Math.min(e.a[0], e.b[0]) / 30), x1 = Math.floor(Math.max(e.a[0], e.b[0]) / 30);
    const y0 = Math.floor(Math.min(e.a[1], e.b[1]) / 30), y1 = Math.floor(Math.max(e.a[1], e.b[1]) / 30);
    for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) { const k = i + ',' + j; if (!EDGE_GRID.has(k)) EDGE_GRID.set(k, []); EDGE_GRID.get(k).push([bi, ei]); }
  }));
}
function nearestFacade(x, y, reach = 22) {
  let best = null, bd = reach;
  const gi = Math.floor(x / 30), gj = Math.floor(y / 30);
  for (let i = gi - 1; i <= gi + 1; i++) for (let j = gj - 1; j <= gj + 1; j++) for (const [bi, ei] of EDGE_GRID.get(i + ',' + j) || []) {
    const e = BLD[bi].edges[ei], dx = e.b[0] - e.a[0], dy = e.b[1] - e.a[1];
    const t = Math.max(0, Math.min(1, ((x - e.a[0]) * dx + (y - e.a[1]) * dy) / (e.L * e.L)));
    const d = Math.hypot(e.a[0] + dx * t - x, e.a[1] + dy * t - y);
    if (d < bd && e.L > 2.5) { bd = d; best = { b: BLD[bi], e, t, d }; }
  }
  return best;
}
// SIGNS: each shop's name on a lit panel, the colours of Tokyo's signs. Blade signs stand
// out from the wall, stacked a floor apart (the look of Center Gai); the rest are fascias
// over the shopfront. Two atlases of canvas text, one mesh each.
const SIGN_COLOURS = [['#d6142b', '#ffffff'], ['#ffe600', '#1a1a1a'], ['#111111', '#ff3fa4'], ['#0b1e3a', '#38e1ff'], ['#ffffff', '#d6142b'],
  ['#1a1a1a', '#ffd23f'], ['#00a85a', '#ffffff'], ['#ff6a00', '#ffffff'], ['#111111', '#7dff6a'], ['#f4f1e8', '#1b3f8f'], ['#7a1fa2', '#ffffff']];
function citySigns() {
  const signs = (CM.signs || []).slice();
  if (!signs.length || !BLD.length) return 0;
  const cjk = (s) => /[぀-ヿ㐀-鿿ｦ-ﾟ]/.test(s);
  const atlas = (cw, ch, cols, rows) => { const c = document.createElement('canvas'); c.width = cw * cols; c.height = ch * rows; return { c, x: c.getContext('2d'), cw, ch, cols, rows, n: 0, P: [], UV: [] }; };
  const blade = atlas(64, 256, 32, 8), fascia = atlas(256, 64, 8, 32);
  const paint = (A, text, vertical, pal) => {
    const i = A.n++, cx = (i % A.cols) * A.cw, cy = Math.floor(i / A.cols) * A.ch, x = A.x;
    x.fillStyle = pal[0]; x.fillRect(cx, cy, A.cw, A.ch);
    x.strokeStyle = pal[1]; x.globalAlpha = 0.7; x.lineWidth = 3; x.strokeRect(cx + 3, cy + 3, A.cw - 6, A.ch - 6); x.globalAlpha = 1;
    x.fillStyle = pal[1]; x.textAlign = 'center'; x.textBaseline = 'middle'; x.shadowColor = pal[1]; x.shadowBlur = 6;
    if (vertical) {
      const chars = [...text].slice(0, 6), fs = Math.min(44, (A.ch - 24) / Math.max(1, chars.length));
      x.font = `700 ${fs}px "Hiragino Kaku Gothic ProN","Yu Gothic","Meiryo","Noto Sans JP",sans-serif`;
      chars.forEach((ch, k) => x.fillText(ch, cx + A.cw / 2, cy + 12 + fs * (k + 0.5) + (A.ch - 24 - fs * chars.length) / 2));
    } else {
      let fs = 40; x.font = `700 ${fs}px "Hiragino Kaku Gothic ProN","Yu Gothic","Meiryo","Noto Sans JP",sans-serif`;
      const t = text.slice(0, 14); const w = x.measureText(t).width; if (w > A.cw - 20) { fs *= (A.cw - 20) / w; x.font = `700 ${fs}px "Hiragino Kaku Gothic ProN","Yu Gothic","Meiryo",sans-serif`; }
      x.fillText(t, cx + A.cw / 2, cy + A.ch / 2 + 2);
    }
    x.shadowBlur = 0;
    const u0 = cx / A.c.width, u1 = (cx + A.cw) / A.c.width, v1 = 1 - cy / A.c.height, v0 = 1 - (cy + A.ch) / A.c.height;
    return [u0, v0, u1, v1];
  };
  const quad = (A, p0, p1, p2, p3, uv) => {   // p0 bottom-left, p1 bottom-right, p2 top-right, p3 top-left
    const [u0, v0, u1, v1] = uv;
    for (const [p, u, v] of [[p0, u0, v0], [p1, u1, v0], [p2, u1, v1], [p0, u0, v0], [p2, u1, v1], [p3, u0, v1]]) { A.P.push(...p); A.UV.push(u, v); }
  };
  let placed = 0;
  for (const s of signs) {
    const f = nearestFacade(s.at[0], s.at[1]);
    if (!f) continue;
    const { b, e } = f, text = (s.name || '').trim();
    if (!text) continue;
    const pal = SIGN_COLOURS[Math.floor(hash1(text.length * 7.1, text.charCodeAt(0)) * SIGN_COLOURS.length)];
    const ex = (e.b[0] - e.a[0]) / e.L, ey = (e.b[1] - e.a[1]) / e.L, [nx, ny] = e.n;
    const vertical = cjk(text) && b.h > 9 && blade.n < 256 && (e.used < Math.floor((b.h - 4) / 4.4));
    if (vertical) {
      // a blade: out from the wall at the end of the shopfront, a floor above the last one
      const t = Math.min(e.L - 0.6, Math.max(0.6, f.t * e.L)), y0 = b.base + 3.6 + e.used * 4.4, hgt = Math.min(3.6, 0.9 + [...text].slice(0, 6).length * 0.55);
      if (y0 + hgt > b.top - 0.5) continue;
      e.used++;
      const ax = e.a[0] + ex * t, ay = e.a[1] + ey * t, o0 = 0.25, o1 = 1.15;
      const P0 = [ax + nx * o0, y0, -(ay + ny * o0)], P1 = [ax + nx * o1, y0, -(ay + ny * o1)], P2 = [ax + nx * o1, y0 + hgt, -(ay + ny * o1)], P3 = [ax + nx * o0, y0 + hgt, -(ay + ny * o0)];
      const uv = paint(blade, text, true, pal);
      quad(blade, P0, P1, P2, P3, uv); quad(blade, P1, P0, P3, P2, uv);
    } else if (fascia.n < 256 && !e.fascia) {
      e.fascia = true;
      const w = Math.min(e.L * 0.8, 2.4 + text.length * 0.55), t = Math.min(e.L - w / 2, Math.max(w / 2, f.t * e.L)), y0 = b.base + 3.3;
      if (b.h < 4.6) continue;
      const cxp = e.a[0] + ex * t, cyp = e.a[1] + ey * t, o = 0.12;
      const L0 = [cxp - ex * w / 2 + nx * o, cyp - ey * w / 2 + ny * o], R0 = [cxp + ex * w / 2 + nx * o, cyp + ey * w / 2 + ny * o];
      const uv = paint(fascia, text, false, pal);
      quad(fascia, [L0[0], y0, -L0[1]], [R0[0], y0, -R0[1]], [R0[0], y0 + 0.9, -R0[1]], [L0[0], y0 + 0.9, -L0[1]], uv);
    } else continue;
    placed++;
  }
  for (const A of [blade, fascia]) {
    if (!A.P.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(A.P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(A.UV, 2));
    const t = new THREE.CanvasTexture(A.c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const m = new THREE.MeshBasicMaterial({ map: t, side: THREE.FrontSide });
    signMats.push(m); scene.add(new THREE.Mesh(g, m));
  }
  return placed;
}
// SCREENS: the big video walls over the crossing, playing original loops of colour and type
const SCREENS = [];
const scramble = PLACES.find((p) => p.scramble);
function cityScreens() {
  const look = scramble ? scramble.xy : [0, 0];
  for (const p of PLACES.filter((q) => q.screen)) {
    let best = null, bd = 60;
    for (const b of BLD) { const d = Math.hypot(b.c[0] - p.xy[0], b.c[1] - p.xy[1]); if (d < bd) { bd = d; best = b; } }
    if (!best) continue;
    let face = null, fd = -2;
    for (const e of best.edges) {
      if (e.L < 6) continue;
      const mx = (e.a[0] + e.b[0]) / 2, my = (e.b[1] + e.a[1]) / 2, tx = look[0] - mx, ty = look[1] - my, tl = Math.hypot(tx, ty) || 1;
      const s = (e.n[0] * tx + e.n[1] * ty) / tl + e.L / 200;
      if (s > fd) { fd = s; face = e; }
    }
    if (!face) continue;
    const w = Math.min(face.L * 0.86, 24), h = Math.min(w * 0.6, Math.max(6, best.h - 6)), ex = (face.b[0] - face.a[0]) / face.L, ey = (face.b[1] - face.a[1]) / face.L;
    const mx = (face.a[0] + face.b[0]) / 2 + face.n[0] * 0.35, my = (face.a[1] + face.b[1]) / 2 + face.n[1] * 0.35, y1 = best.top - 2.5, y0 = Math.max(best.base + 6, y1 - h);
    const c = document.createElement('canvas'); c.width = 512; c.height = Math.round(512 * (y1 - y0) / w);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const g = new THREE.BufferGeometry(), L = [mx - ex * w / 2, my - ey * w / 2], R = [mx + ex * w / 2, my + ey * w / 2];
    g.setAttribute('position', new THREE.Float32BufferAttribute([L[0], y0, -L[1], R[0], y0, -R[1], R[0], y1, -R[1], L[0], y0, -L[1], R[0], y1, -R[1], L[0], y1, -L[1]], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
    const m = new THREE.MeshBasicMaterial({ map: t }); signMats.push(m); scene.add(new THREE.Mesh(g, m));
    SCREENS.push({ c, x: c.getContext('2d'), t, seed: SCREENS.length * 2.3 + 0.7, last: -1 });
  }
}
const SCREEN_WORDS = [['渋谷', 'SHIBUYA'], ['夜', 'TONIGHT'], ['新作', 'NEW SEASON'], ['音楽', 'LIVE'], ['ようこそ', 'WELCOME'], ['東京', 'TOKYO']];
function drawScreens(time) {
  for (const S of SCREENS) {
    if (time - S.last < 1 / 15) continue; S.last = time;
    const { x, c } = S, W = c.width, H = c.height, k = time / 7 + S.seed, scene = Math.floor(k) % 3, f = k % 1, hue = (Math.floor(k) * 67 + S.seed * 40) % 360;
    const [ja, en] = SCREEN_WORDS[Math.floor(k + S.seed) % SCREEN_WORDS.length];
    if (scene === 0) {   // a colour field sweeping across, a word sliding in
      const gr = x.createLinearGradient(0, 0, W, H); gr.addColorStop(0, `hsl(${hue},85%,${45 + 10 * Math.sin(time)}%)`); gr.addColorStop(1, `hsl(${(hue + 80) % 360},90%,30%)`);
      x.fillStyle = gr; x.fillRect(0, 0, W, H);
      x.fillStyle = '#fff'; x.font = `900 ${H * 0.42}px "Yu Gothic","Meiryo",sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(ja, W * (1.3 - Math.min(1, f * 2.2) * 0.8), H * 0.45); x.font = `700 ${H * 0.13}px "Roboto Condensed",sans-serif`; x.fillText(en, W / 2, H * 0.82);
    } else if (scene === 1) {   // rings pulsing out from the middle
      x.fillStyle = `hsl(${hue},70%,8%)`; x.fillRect(0, 0, W, H);
      for (let r = 0; r < 7; r++) { x.strokeStyle = `hsl(${(hue + r * 25) % 360},95%,60%)`; x.lineWidth = H * 0.05; x.beginPath(); x.arc(W / 2, H / 2, ((f * 3 + r / 7) % 1) * W * 0.7, 0, 6.283); x.stroke(); }
      x.fillStyle = '#fff'; x.font = `900 ${H * 0.2}px "Roboto Condensed",sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(en, W / 2, H / 2);
    } else {   // bars of colour, like a music video's opening
      for (let i = 0; i < 9; i++) { x.fillStyle = `hsl(${(hue + i * 31 + time * 40) % 360},90%,${40 + 20 * Math.sin(time * 3 + i)}%)`; x.fillRect(i * W / 9, 0, W / 9 + 1, H); }
      x.fillStyle = 'rgba(0,0,0,.55)'; x.fillRect(0, H * 0.62, W, H * 0.3);
      x.fillStyle = '#fff'; x.font = `800 ${H * 0.2}px "Yu Gothic","Meiryo",sans-serif`; x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillText(ja + ' ' + en, W * (1 - f * 1.6), H * 0.77);
    }
    S.t.needsUpdate = true;
  }
}
// THE SCRAMBLE: one signal cycle for the whole crossing. Cars, then every light red at
// once and the walk tones sound, and the crowd waiting on every corner pours across, the
// diagonals too. The last seconds flash and the tones stop.
const SIG = { cycle: 100, walk: 42, flash: 7, t: 88 };
const sigPhase = () => { const t = SIG.t % SIG.cycle; return t < SIG.walk - SIG.flash ? 'walk' : t < SIG.walk ? 'flash' : 'cars'; };
const CROWD = { n: 0 };
function cityCrowd() {
  if (!scramble) return;
  const R = scramble.radius_m || 30, cx = scramble.xy[0], cy = scramble.xy[1], N = 460;
  const corners = []; for (let k = 0; k < 8; k++) { const a = (k + 0.5) / 8 * 6.283; corners.push([cx + Math.cos(a) * (R + 4), cy + Math.sin(a) * (R + 4)]); }
  const body = new THREE.CapsuleGeometry(0.21, 1.15, 3, 6).translate(0, 0.79, 0);
  const head = new THREE.SphereGeometry(0.12, 8, 6).translate(0, 1.6, 0.02);
  const geo = mergeGeometries([body, head].map((g) => { g.deleteAttribute('uv'); return g.index ? g.toNonIndexed() : g; }));
  const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.9 }), N);
  const CLOTH = ['#15161a', '#22252b', '#2d3240', '#3b3f45', '#6d6a63', '#b9b1a3', '#e8e4dc', '#1e2a44', '#5a4636', '#8a1f24', '#3c4a3a', '#c9b48a'];
  const col = new THREE.Color(), people = [];
  for (let i = 0; i < N; i++) {
    const home = Math.floor(Math.random() * 8), a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * 5.5;
    const x = corners[home][0] + Math.cos(a) * r, y = corners[home][1] + Math.sin(a) * r;
    people.push({ x, y, home, to: -1, sp: 1.2 + Math.random() * 0.6, go: Math.random() * 9, ph: Math.random() * 6.28, s: 0.92 + Math.random() * 0.16, yaw: Math.random() * 6.28 });
    im.setColorAt(i, col.set(CLOTH[Math.floor(Math.random() * CLOTH.length)]));
  }
  im.castShadow = true; im.frustumCulled = false; scene.add(im);
  Object.assign(CROWD, { im, people, corners, n: N, m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), sv: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), was: 'cars', g: scramble.g });
}
function moveCrowd(dt, time) {
  if (!CROWD.n) return;
  const phase = sigPhase(), C = CROWD;
  if (phase === 'walk' && C.was === 'cars') for (const p of C.people) { const off = 1 + Math.floor(Math.random() * 7); p.to = (p.home + off) % 8; p.go = time + Math.random() * 7; const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * 5.5; p.tx = C.corners[p.to][0] + Math.cos(a) * r; p.ty = C.corners[p.to][1] + Math.sin(a) * r; }
  C.was = phase === 'flash' ? 'walk' : phase;
  for (let i = 0; i < C.n; i++) {
    const p = C.people[i];
    let moving = false;
    if (p.to >= 0 && time > p.go) {
      const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
      if (d < 0.4) { p.home = p.to; p.to = -1; }
      else { const st = Math.min(d, p.sp * dt); p.x += dx / d * st; p.y += dy / d * st; p.yaw = Math.atan2(dx, -dy) + Math.PI; moving = true; }
    }
    const bob = moving ? Math.abs(Math.sin(time * 7.5 * p.sp + p.ph)) * 0.05 : 0;
    C.q.setFromAxisAngle(C.up, moving ? p.yaw : p.yaw + Math.sin(time * 0.3 + p.ph) * 0.4);
    C.m.compose(C.p.set(p.x, C.g + bob, -p.y), C.q, C.sv.set(p.s, p.s, p.s)); C.im.setMatrixAt(i, C.m);
  }
  C.im.instanceMatrix.needsUpdate = true;
}
// places you can visit: their names over the city, pressable
const placeTags = PLACES.map((p) => {
  const el = document.createElement('button'); el.type = 'button'; el.className = 'tag place k-' + (p.kind || 'place'); el.textContent = p.name; document.body.appendChild(el);
  el.onclick = () => visit(p);
  let top = p.g + 14;
  return { el, p, pos: new THREE.Vector3(p.xy[0], top, -p.xy[1]) };
});
function placeTagHeights() {   // over the roof of the building a place is in, once the city stands
  for (const T of placeTags) {
    let roof = null;
    for (const b of BLD) { const [x0, y0] = T.p.xy; if (Math.hypot(b.c[0] - x0, b.c[1] - y0) < 60 && pointIn(T.p.xy, b.pts)) { roof = b; break; } }
    T.pos.y = (roof ? roof.top : T.p.g) + (roof ? 6 : 12);
    T.p.roof = roof;
  }
}
function pointIn([x, y], poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [x1, y1] = poly[i], [x2, y2] = poly[j]; if ((y1 > y) !== (y2 > y) && x < (x2 - x1) * (y - y1) / ((y2 - y1) || 1e-9) + x1) c = !c; } return c; }
function visit(p) {
  const T = new THREE.Vector3(p.xy[0], p.g + 4, -p.xy[1]);
  let pos;
  if (p.top && p.roof) {   // up on the roof, looking out over the crossing
    const look = scramble ? new THREE.Vector3(scramble.xy[0], scramble.g, -scramble.xy[1]) : T.clone().add(new THREE.Vector3(0, 0, -200));
    pos = new THREE.Vector3(p.xy[0], p.roof.top + 2.5, -p.xy[1]);
    const d = look.clone().sub(pos).setY(0).normalize(); pos.addScaledVector(d, 12);
    fly = { t: 0, p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: look };
  } else {
    const from = camera.position.clone().sub(T).setY(0); if (from.lengthSq() < 4) from.set(1, 0, 1);
    from.normalize();
    pos = T.clone().addScaledVector(from, 46).add(new THREE.Vector3(0, 24, 0));
    fly = { t: 0, p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: T };
  }
  if (meeting) meeting.until = 0;
  showPlace(p);
  if (!SOUND.on) { soundOn().then(() => { document.getElementById('sound').textContent = 'Listening… (press to quiet)'; document.getElementById('mix').classList.add('on'); }); }
}
function showPlace(p) {
  const card = document.getElementById('placecard'), esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const hears = (p.sounds || []).map((id) => (CM.recordings || []).find((r) => r.id === id)?.label || (id === 'walk-tones' ? 'the walk tones' : null)).filter(Boolean);
  card.innerHTML = (p.img ? `<div class="ph" style="background-image:url('${fileUrl(p.img)}')"></div>` : '') +
    `<div class="tx"><b>${esc(p.name)}</b><span class="k">${esc(p.kind || '')}</span><p>${esc(p.blurb)}</p>` +
    (hears.length ? `<p class="hear">Listen for ${esc(hears.join(', '))}</p>` : '') +
    (p.img_credit ? `<a href="${esc(p.img_credit)}" target="_blank" rel="noopener">Wikipedia</a>` : '') + '</div><button type="button" class="x" aria-label="Close">×</button>';
  card.hidden = false; card.querySelector('.x').onclick = () => { card.hidden = true; };
  document.querySelectorAll('#life figure.place').forEach((f) => f.classList.toggle('on', f.dataset.name === p.name));
}
// ── the city's sound: recordings where they happen, and the signals synthesised ──
async function cityAudioOn(ctx) {
  await Promise.all((CM.recordings || []).map(async (r) => {
    try { REC[r.id] = await ctx.decodeAudioData(await (await fetch(fileUrl(r.file))).arrayBuffer()); } catch (_) { /* stays quiet */ }
  }));
  const pan = (ref, at) => { const p = ctx.createPanner(); Object.assign(p, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: ref, rolloffFactor: 1.15, maxDistance: 4000 }); p.positionX.value = at.x; p.positionY.value = at.y; p.positionZ.value = at.z; return p; };
  CITYSND.pan = pan;
  // people: each place's talking and crowd, looping where it is
  for (const p of PLACES) for (const id of p.sounds || []) {
    const r = (CM.recordings || []).find((q) => q.id === id), buf = REC[id];
    if (!r || !buf || !r.loop) continue;
    const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
    const g = ctx.createGain(); g.gain.value = id === 'crowd-large' ? 0.55 : 0.7;
    s.connect(g).connect(pan(id === 'crowd-large' ? 30 : 14, new THREE.Vector3(p.xy[0], p.g + 2, -p.xy[1]))).connect(SOUND.layers[r.layer] || SOUND.master);
    s.start(0, Math.random() * buf.duration);
    CITYSND.loops.push({ p, id, g });
  }
  CITYSND.nextTrain = ctx.currentTime + 8;
}
const CITYSND = { loops: [], nextTone: 0, toneK: 0, nextTrain: 0, events: [], pan: null };
function tone(ctx, at, kind, when) {   // Tokyo's walk tones: an electronic cuckoo one way, a chick's peep the other
  const out = ctx.createGain(); out.gain.value = 0.5; out.connect(CITYSND.pan(9, at)).connect(SOUND.layers.crossing || SOUND.master);
  const note = (f0, f1, t0, len, type = 'square') => {
    const o = ctx.createOscillator(), e = ctx.createGain(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3800;
    o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.linearRampToValueAtTime(f1, t0 + len);
    e.gain.setValueAtTime(0, t0); e.gain.linearRampToValueAtTime(0.16, t0 + 0.012); e.gain.setValueAtTime(0.16, t0 + len - 0.02); e.gain.linearRampToValueAtTime(0, t0 + len);
    o.connect(lp).connect(e).connect(out); o.start(t0); o.stop(t0 + len + 0.05);
  };
  if (kind === 'cuckoo') { note(1250, 1250, when, 0.13, 'triangle'); note(1000, 1000, when + 0.2, 0.3, 'triangle'); }
  else { note(3000, 2150, when, 0.075, 'sine'); note(2650, 2050, when + 0.11, 0.08, 'sine'); }
}
function melody(ctx, at, when) {   // an original departure melody in the style of Tokyo's, from a platform's speakers
  const out = ctx.createGain(); out.gain.value = 0.42;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.5;
  const dl = ctx.createDelay(); dl.delayTime.value = 0.17; const fb = ctx.createGain(); fb.gain.value = 0.32; dl.connect(fb).connect(dl);
  out.connect(bp); bp.connect(dl); const p = CITYSND.pan(16, at); bp.connect(p); dl.connect(p); p.connect(SOUND.layers.station || SOUND.master);
  const N = [74, 78, 81, 83, 81, 78, 76, 78, 81, 86, 85, 81, 83, 86, 88, 86];   // D major, a phrase and its answer
  N.forEach((m, i) => {
    const f = 440 * 2 ** ((m - 69) / 12), t0 = when + i * 0.27 + (i >= 8 ? 0.2 : 0);
    for (const [mul, amp, dec] of [[1, 0.5, 0.7], [4, 0.12, 0.18], [2.76, 0.08, 0.25]]) {
      const o = ctx.createOscillator(), e = ctx.createGain(); o.type = 'sine'; o.frequency.value = f * mul;
      e.gain.setValueAtTime(0, t0); e.gain.linearRampToValueAtTime(amp, t0 + 0.006); e.gain.exponentialRampToValueAtTime(0.001, t0 + dec);
      o.connect(e).connect(out); o.start(t0); o.stop(t0 + dec + 0.05);
    }
  });
  return when + N.length * 0.27 + 0.4;
}
function playRec(ctx, id, at, ref = 16, gain = 0.9) {
  const buf = REC[id]; if (!buf) return 0;
  const s = ctx.createBufferSource(); s.buffer = buf; const g = ctx.createGain(); g.gain.value = gain;
  const r = (CM.recordings || []).find((q) => q.id === id);
  s.connect(g).connect(CITYSND.pan(ref, at)).connect(SOUND.layers[r?.layer] || SOUND.master); s.start();
  return buf.duration;
}
function cityAudio(c, now) {
  const ctx = SOUND.ctx; if (!ctx || !CITYSND.pan) return;
  const phase = sigPhase();
  // walk tones: at the Scramble on its own cycle, and at the nearest few signalled crossings on theirs
  if (now > CITYSND.nextTone) {
    CITYSND.nextTone = now + 0.62;
    const spots = [];
    if (scramble && phase === 'walk') spots.push(scramble.xy);
    const near = (CM.crossings || []).map((x) => [x, Math.hypot(x.at[0] - c.x, x.at[1] + c.z)]).filter(([x, d]) => d < 160 && (!scramble || Math.hypot(x.at[0] - scramble.xy[0], x.at[1] - scramble.xy[1]) > 50)).sort((a, b) => a[1] - b[1]).slice(0, 3);
    for (const [x] of near) { const tt = (SIG.t + x.at[0] * 0.7 + x.at[1] * 1.3) % 90; if (tt < 30) spots.push(x.at); }
    CITYSND.toneK++;
    for (const xy of spots) tone(ctx, new THREE.Vector3(xy[0], sampleHeight(xy[0], xy[1]) + 3, -xy[1]), CITYSND.toneK % 4 < 2 ? 'cuckoo' : 'peep', now + 0.02);
  }
  // the crowd swells while it crosses; the traffic hushes while every car waits
  for (const L of CITYSND.loops) if (L.id === 'crowd-large') L.g.gain.setTargetAtTime(phase === 'cars' ? 0.35 : 0.85, now, 1.5);
  if (SOUND.layers.traffic && scramble) {
    const d = Math.hypot(c.x - scramble.xy[0], -c.z - scramble.xy[1]), hush = phase !== 'cars' && d < 300 ? 0.3 : 1;
    SOUND.layers.traffic.gain.setTargetAtTime((SOUND.muted.traffic ? 0 : SOUND.level.traffic) * hush, now, 1.2);
  }
  // the station: a train comes in to one of the platforms near you, an announcement, the melody, the doors
  const plats = CM.platforms || [];
  if (plats.length && now > CITYSND.nextTrain) {
    CITYSND.nextTrain = now + 38 + Math.random() * 40;
    const byNear = plats.map((p) => [p, Math.hypot(p.at[0] - c.x, p.at[1] + c.z)]).sort((a, b) => a[1] - b[1]);
    const [p] = byNear[Math.floor(Math.random() * Math.min(3, byNear.length))];
    const at = new THREE.Vector3(p.at[0], sampleHeight(p.at[0], p.at[1]) + 8, -p.at[1]);
    const ann = ['announce-tennoji', 'announce-323'].filter((id) => REC[id]);
    let t = now + 0.5;
    if (ann.length) { const id = ann[Math.floor(Math.random() * ann.length)]; CITYSND.events.push([t, () => playRec(ctx, id, at, 20, 0.8)]); t += Math.min(14, REC[id].duration) + 3; }
    CITYSND.events.push([t, () => melody(ctx, at, ctx.currentTime + 0.05)]);
    CITYSND.events.push([t + 5.4, () => playRec(ctx, 'door', at, 14, 1)]);
    CITYSND.events.push([t + 7.5, () => { const line = AMB.lines.filter((L) => L.mover && !L.run && L.s.kind === 'train').sort((a, b) => nearestOn(a.pts, at, ambAt) - nearestOn(b.pts, at, ambAt))[0]; if (line) startMover(line, ctx.currentTime); }]);
  }
  CITYSND.events = CITYSND.events.filter(([t, fn]) => { if (now >= t) { fn(); return false; } return true; });
}
function cityTick(dt, time) {
  SIG.t += dt;
  moveCrowd(dt, time);
  drawScreens(time);
}

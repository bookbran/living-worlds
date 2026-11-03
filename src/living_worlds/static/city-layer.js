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
// PAINT (2026-11-01, Dan: 'here is what our house looks like'): a building's own wall and roof colours
// A BUILDING the map is missing (2026-11-01, Dan: 'we have twin garages in the back of the driveway'):
// a footprint size_m [east-west, north-south] round its point, turned by yaw (radians), in its own colours
if (Array.isArray(meta.buildings)) for (const t of TOUCHES.filter((q) => q.kind === 'building' && q.building && Array.isArray(q.xy))) {
  const B = t.building, [w, d] = B.size_m || [4, 4], c = Math.cos(+B.yaw || 0), sn = Math.sin(+B.yaw || 0);
  const p = Array.isArray(t.footprint) && t.footprint.length > 2 ? t.footprint : [[w / 2, d / 2], [-w / 2, d / 2], [-w / 2, -d / 2], [w / 2, -d / 2]].map(([x, y]) => [t.xy[0] + x * c - y * sn, t.xy[1] + x * sn + y * c]);
  meta.buildings.push({ id: 'touch:' + t.id, p, h: +B.h || 3.5, k: B.k || 'yes', wall: B.wall, roof: B.roof, roof_form: B.roof_form, roof_shape: B.roof_shape, ridge: B.ridge, eave: B.eave, siding: B.siding, force_pitch: B.force_pitch, trim: B.trim, door: B.door, front: B.front, touch: true });
}
// PORCHES (2026-11-01, Dan: "the front part of our house is actually a covered front porch, with
// stairs going up from the driveway side to it, and we have a light orange door"): the part of a
// footprint that juts out on one side is carved out of the house and becomes an open porch, a
// raised deck under its own roof on posts, a railing, steps down one side, the front door behind it
const PORCHES = [];
if (Array.isArray(meta.buildings)) for (const t of TOUCHES.filter((q) => q.kind === 'porch' && q.porch)) {
  const b = meta.buildings.find((x) => x.id === t.anchor.building || (Array.isArray(x.also) && x.also.includes(t.anchor.building)));
  if (!b || !Array.isArray(b.p)) continue;
  const P = t.porch, side = P.side || 'east';
  // turn the footprint so the porch side faces +x, carve, and turn back
  const rot = { east: [1, 0], north: [0, 1], west: [-1, 0], south: [0, -1] }[side] || [1, 0];
  const fwd = ([x, y]) => [x * rot[0] + y * rot[1], -x * rot[1] + y * rot[0]];
  const back = ([u, v]) => [u * rot[0] - v * rot[1], u * rot[1] + v * rot[0]];
  const loc = b.p.map(fwd), xs = [...new Set(loc.map((q) => Math.round(q[0] * 10) / 10))].sort((a, c) => c - a);
  if (xs.length < 2) continue;
  const front = xs[0], wall = xs[1], ys = loc.filter((q) => Math.abs(q[0] - front) < 0.15).map((q) => q[1]);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (front - wall < 1 || y1 - y0 < 1.5) continue;
  const body = [];
  for (const q of loc) { const c = [Math.min(q[0], wall), q[1]]; const l = body[body.length - 1]; if (!l || Math.hypot(l[0] - c[0], l[1] - c[1]) > 0.05) body.push(c); }
  if (body.length > 2 && Math.hypot(body[0][0] - body[body.length - 1][0], body[0][1] - body[body.length - 1][1]) < 0.05) body.pop();
  b.p = body.map(back);
  PORCHES.push({ t, b, back, wall, front, y0, y1, rot, stairs: P.stairs, rise: +P.rise || 1.0, door: P.door || '#5a4636', doorAt: P.door_at, roofForm: P.roof || 'hip', peak: +P.peak_m || 0 });
}
const WINDOWED = new Map(TOUCHES.filter((t) => (t.kind === 'windows' || t.kind === 'storefront') && t.anchor && t.anchor.building).map((t) => [t.anchor.building, t]));
const sidingCode = (v) => (v === 'shingle' ? 3.6 : v === 'batten' ? 4.2 : 3);
const PAINTS = new Map(TOUCHES.filter((t) => t.kind === 'paint' && t.anchor && t.anchor.building).map((t) => [t.anchor.building, t.paint || {}]));
// a touch hung on a building finds it by its own id or an id it replaced (Portland's city footprints
// stand in for OpenStreetMap's, 2026-11-01, and keep the old ids in also)
const touchOn = (map, b) => map.get(b.id) || (Array.isArray(b.also) ? b.also.map((x) => map.get(x)).find(Boolean) : undefined);
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
  // a 2016 Mazda CX-5 (2026-11-01, Dan's own car): 4.55 m long, 1.84 wide, 1.67 tall, a long low
  // bonnet, a raked windscreen and a sloping tailgate, the crossover's shape rather than a box
  cx5:    { L: 4.55, W: 1.84, body: [[-2.27, .34], [2.27, .34], [2.3, .6], [2.18, .78], [1.3, .96], [-1.85, 1.04], [-2.2, .98], [-2.3, .64]],
            glass: [[1.3, .96], [.42, 1.5], [-1.2, 1.6], [-1.85, 1.42], [-2.12, 1.0]] },
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

const PORCH_GLOW = [];
function touchPorches() {
  const GATES = TOUCHES.filter((t) => (t.kind === 'gate' || t.kind === 'fence') && (t.gate || t.fence) && Array.isArray(t.xy)).map((t) => Object.assign({}, t, { gate: t.gate || t.fence }));
  const DRESSED = (meta.buildings || []).filter((b) => b.touch && (b.trim || b.door));
  if (!PORCHES.length && !GATES.length && !DRESSED.length) return 0;
  const parts = [], col = new THREE.Color();
  const add = (g, colour) => { g = g.index ? g.toNonIndexed() : g; if (g.attributes.uv) g.deleteAttribute('uv'); col.set(colour);
    const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(g); };
  for (const K of PORCHES) {
    const { b, back, wall, front, y0, y1, rise } = K, ang = Math.atan2(K.rot[1], K.rot[0]);
    let base = Infinity; for (const [x, y] of b.p) base = Math.min(base, sampleHeight(x, y));
    const [mx, my] = back([(wall + front) / 2, (y0 + y1) / 2]), D = front - wall, Wd = y1 - y0;
    const roofC = (touchOn(PAINTS, b) || {}).roof || b.roof || '#6d7176', trim = '#f2efe8', deck = '#8d8379';
    const eave = base + Math.max(2.6, b.eave || 3.0);
    // everything is drawn in the porch's own frame: u out from the wall, v along it, then placed
    const put = (g, u, v, y) => { g.rotateY(ang); const [x, z] = back([u, v]); g.translate(x, y, -z); return g; };
    const box = (du, h, dv, u, v, y, c) => add(put(new THREE.BoxGeometry(du, h, dv), u, v, y), c);
    box(D, 0.18, Wd, (wall + front) / 2, (y0 + y1) / 2, base + rise - 0.09, deck);                 // the deck
    box(D - 0.1, rise - 0.18, Wd - 0.1, (wall + front) / 2, (y0 + y1) / 2, base + (rise - 0.18) / 2, '#d9d4c8');   // its skirt
    const postH = eave - (base + rise);
    const PO = K.t.porch || {};
    if (PO.columns === 'square') for (const v of [y0 + 0.22, y1 - 0.22]) { box(0.32, postH, 0.32, front - 0.22, v, base + rise + postH / 2, trim); box(0.42, 0.14, 0.42, front - 0.22, v, base + rise + 0.07, trim); box(0.4, 0.1, 0.4, front - 0.22, v, base + rise + postH - 0.05, trim); }   // square craftsman columns
    else for (const v of [y0 + 0.12, (y0 + y1) / 2, y1 - 0.12]) box(0.16, postH, 0.16, front - 0.12, v, base + rise + postH / 2, trim);   // posts
    for (const v of [y0 + 0.12, y1 - 0.12]) box(0.16, postH, 0.16, wall + 0.12, v, base + rise + postH / 2, trim);
    // railing on the front and the side without stairs, low and white
    const rail = (du, dv, u, v) => { box(du, 0.07, dv, u, v, base + rise + 0.9, trim); box(du, 0.05, dv, u, v, base + rise + 0.12, trim);
      if (PO.balusters) { const along = du > dv, len = along ? du : dv, n = Math.floor(len / 0.13);   // the white balusters (Dan's porch photo)
        for (let k = 1; k < n; k++) { const o = -len / 2 + k * len / n; box(along ? 0.045 : 0.045, 0.74, 0.045, u + (along ? o : 0), v + (along ? 0 : o), base + rise + 0.51, trim); } } };
    rail(0.06, Wd, front - 0.12, (y0 + y1) / 2);
    const stairV = K.stairs === 'left' ? y1 : y0, otherV = K.stairs === 'left' ? y0 : y1;
    rail(D, 0.06, (wall + front) / 2, otherV + (otherV > stairV ? -0.12 : 0.12));
    // the roof: a low hip on the eave, in the house's roof colour, with a white fascia
    if (K.roofForm === 'gable') {
      // A FRONT GABLE (2026-11-01, Dan's street view: the porch roof peaks toward the street): a ridge
      // running out from the house, the gable end filled in the house's own colour behind a white rake
      const L = D + 0.6, half = (Wd + 0.7) / 2, peak = K.peak || Math.min(1.2, half * 0.4);
      const tri = (hw, pk) => new THREE.Shape([new THREE.Vector2(-hw, 0), new THREE.Vector2(hw, 0), new THREE.Vector2(0, pk)]);
      const roof = new THREE.ExtrudeGeometry(tri(half, peak), { depth: L, bevelEnabled: false }).translate(0, 0, -L / 2).rotateY(-Math.PI / 2);
      add(put(roof, (wall + front) / 2 + 0.15, (y0 + y1) / 2, eave), roofC);
      const end = new THREE.ExtrudeGeometry(tri(half - 0.25, peak - 0.18), { depth: 0.06, bevelEnabled: false }).translate(0, 0.06, 0).rotateY(-Math.PI / 2);
      add(put(end, front + 0.52, (y0 + y1) / 2, eave), (touchOn(PAINTS, b) || {}).wall || b.wall || '#d8d2c4');
    } else {
      const rg = new THREE.ConeGeometry(Math.hypot(D + 0.6, Wd + 0.6) / 2, 1.1, 4, 1).rotateY(Math.PI / 4);
      rg.scale((D + 0.6) / Math.hypot(D + 0.6, Wd + 0.6) * Math.SQRT2, 1, (Wd + 0.6) / Math.hypot(D + 0.6, Wd + 0.6) * Math.SQRT2);
      add(put(rg, (wall + front) / 2 + 0.15, (y0 + y1) / 2, eave + 0.55), roofC);
    }
    box(D + 0.6, 0.22, Wd + 0.6, (wall + front) / 2 + 0.15, (y0 + y1) / 2, eave - 0.05, trim);
    // the steps, down the stairs side, near the front, to the ground
    const n = Math.max(3, Math.round(rise / 0.18)), tread = 0.28, sw = Math.min(1.4, D - 0.4), su = front - 0.2 - sw / 2;
    const dir = stairV === y0 ? -1 : 1;
    for (let i = 0; i < n; i++) {
      const top = base + rise - (i + 1) * (rise / n);
      box(sw, top - base + 0.1, tread, su, stairV + dir * (tread * (i + 0.5)), base + (top - base + 0.1) / 2 - 0.05, i % 2 ? '#857b71' : deck);
    }
    // the front door, on the house wall behind the porch, with a white frame
    const dv = K.doorAt != null ? y0 + (y1 - y0) * K.doorAt : (y0 + y1) / 2;
    box(0.06, 2.2, 1.1, wall + 0.02, dv, base + rise + 1.1, trim);
    box(0.08, 2.05, 0.92, wall + 0.05, dv, base + rise + 1.03, K.door);
    box(0.1, 0.06, 0.06, wall + 0.1, dv + 0.32, base + rise + 1.0, '#c9b27a');   // the handle
    const fl = base + rise;
    // TWO WHITE ROCKING CHAIRS AND A PLANTER (2026-11-01, Dan's porch photo): facing the street, in
    // front of the porch window, a pot of white flowers between them
    for (const at of (Array.isArray(PO.chairs) ? PO.chairs : [])) {
      const cv = y0 + (y1 - y0) * at, cu = wall + 0.75, c = PO.chair_colour || '#f3f1ea';
      box(0.5, 0.05, 0.5, cu, cv, fl + 0.45, c);                                                      // the seat
      for (const dvv of [-0.22, 0.22]) {
        box(0.04, 0.45, 0.04, cu + 0.2, cv + dvv, fl + 0.24, c); box(0.04, 0.45, 0.04, cu - 0.2, cv + dvv, fl + 0.24, c);   // legs
        box(0.85, 0.035, 0.035, cu, cv + dvv, fl + 0.035, c);                                         // the rockers
        box(0.5, 0.035, 0.06, cu + 0.02, cv + dvv, fl + 0.68, c); box(0.035, 0.22, 0.035, cu + 0.22, cv + dvv, fl + 0.57, c);   // arms
      }
      for (let k = 0; k < 5; k++) box(0.03, 0.62, 0.05, cu - 0.24, cv - 0.18 + k * 0.09, fl + 0.78, c);   // the back's spindles
      box(0.05, 0.07, 0.52, cu - 0.24, cv, fl + 1.11, c);                                            // its top rail
    }
    if (PO.planter != null) {
      const pv = y0 + (y1 - y0) * PO.planter, pu = wall + 0.75;
      add(put(new THREE.CylinderGeometry(0.17, 0.13, 0.3, 14), pu, pv, fl + 0.15), '#e9e4da');
      add(put(new THREE.IcosahedronGeometry(0.2, 1).scale(1, 0.75, 1), pu, pv, fl + 0.4), '#4f7a3a');
      for (let k = 0; k < 9; k++) { const a = k * 2.4; add(put(new THREE.IcosahedronGeometry(0.045, 0), pu + Math.cos(a) * 0.14, pv + Math.sin(a) * 0.14, fl + 0.43 + (k % 3) * 0.05), '#fbfaf5'); }
    }
    if (PO.lantern) {   // a dark wall lantern beside the door, lit at night
      const lv = dv + (PO.lantern === 'left' ? -0.75 : 0.75);
      box(0.12, 0.26, 0.16, wall + 0.08, lv, fl + 1.95, '#2b2a28'); box(0.16, 0.04, 0.2, wall + 0.1, lv, fl + 2.1, '#2b2a28');
      PORCH_GLOW.push(put(new THREE.BoxGeometry(0.1, 0.17, 0.12), wall + 0.1, lv, fl + 1.94));
    }
    if (PO.downspout) {   // the white downspout at the porch's front corner on the stairs side
      const sv = (K.stairs === 'left' ? y1 - 0.05 : y0 + 0.05), su = front + 0.18;
      add(put(new THREE.CylinderGeometry(0.045, 0.045, eave - base + 0.1, 8), su, sv, base + (eave - base) / 2), '#f3f1ea');
      box(0.3, 0.1, Wd + 0.7, (wall + front) / 2 + 0.15, (y0 + y1) / 2, eave + 0.02, '#f3f1ea');   // the gutter's line along the eave side
    }
  }
  // A WOODEN GATE (2026-11-01, Dan: "there's a wooden gate between their garage and ours"): vertical
  // boards with a little gap between them, two rails across the back, facing the way yaw says
  for (const t of GATES) {
    const G = t.gate, w = +G.width_m || 1, h = +G.height_m || 1.8, yaw = +G.yaw || 0, g0 = sampleHeight(t.xy[0], t.xy[1]);
    const n = Math.max(4, Math.round(w / 0.14)), bw = w / n;
    for (let i = 0; i < n; i++) {
      const v = -w / 2 + bw * (i + 0.5), bh = h - (i % 2) * 0.04;
      const g = new THREE.BoxGeometry(0.03, bh, bw - 0.012).translate(0, g0 + bh / 2 + 0.04, v);
      add(g.rotateY(yaw).translate(t.xy[0], 0, -t.xy[1]), i % 3 ? G.colour || '#8a6a48' : '#7c5e3f');
    }
    for (const y of [0.35, h - 0.35]) add(new THREE.BoxGeometry(0.05, 0.1, w).translate(-0.04, g0 + y, 0).rotateY(yaw).translate(t.xy[0], 0, -t.xy[1]), '#6e5238');
  }
  // TRIM AND DOORS (2026-11-01, Dan's street view: the neighbours' white garage has blue trim; each
  // garage has its own door facing the driveway): a band round the eaves, a door on the front wall
  for (const b of DRESSED) {
    let base = Infinity, A = 0;
    for (let i = 0; i < b.p.length; i++) { const [x1, y1] = b.p[i], [x2, y2] = b.p[(i + 1) % b.p.length]; A += x1 * y2 - x2 * y1; base = Math.min(base, sampleHeight(x1, y1)); }
    base -= 0.4; const top = base + Math.max(3, b.h) + 0.4, wallTop = top - Math.min(3.6, Math.max(1.5, Math.sqrt(Math.abs(A)) * 0.24));
    const cxm = b.p.reduce((s, q) => s + q[0], 0) / b.p.length, cym = b.p.reduce((s, q) => s + q[1], 0) / b.p.length;
    const want = { east: [1, 0], west: [-1, 0], north: [0, 1], south: [0, -1] }[b.front || 'east'];
    let best = null;
    for (let i = 0; i < b.p.length; i++) {
      const [ax, ay] = b.p[i], [bx, by] = b.p[(i + 1) % b.p.length], L = Math.hypot(bx - ax, by - ay); if (L < 0.3) continue;
      const mx = (ax + bx) / 2, my = (ay + by) / 2, ox = mx - cxm, oy = my - cym, ol = Math.hypot(ox, oy) || 1, nx = ox / ol, ny = oy / ol, ang = Math.atan2(by - ay, bx - ax);
      if (b.trim) add(new THREE.BoxGeometry(L + 0.2, 0.2, 0.06).rotateY(ang).translate(mx + nx * 0.06, wallTop - 0.08, -(my + ny * 0.06)), b.trim);
      const score = nx * want[0] + ny * want[1]; if (!best || score > best.score) best = { score, L, mx, my, nx, ny, ang };
    }
    if (b.door && best) {
      const dw = Math.min(2.6, best.L - 0.7), dh = Math.min(2.15, wallTop - base - 0.6);
      add(new THREE.BoxGeometry(dw, dh, 0.06).rotateY(best.ang).translate(best.mx + best.nx * 0.04, base + 0.4 + dh / 2, -(best.my + best.ny * 0.04)), b.door);
      if (b.trim) add(new THREE.BoxGeometry(dw + 0.24, dh + 0.12, 0.05).rotateY(best.ang).translate(best.mx + best.nx * 0.02, base + 0.4 + dh / 2 + 0.06, -(best.my + best.ny * 0.02)), b.trim);
      for (let k = 1; k < 4; k++) add(new THREE.BoxGeometry(dw - 0.1, 0.025, 0.02).rotateY(best.ang).translate(best.mx + best.nx * 0.075, base + 0.4 + dh * k / 4, -(best.my + best.ny * 0.075)), '#9a9488');   // the door's panel lines
    }
  }
  const mesh = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }));
  mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh);
  if (PORCH_GLOW.length) { const gm = new THREE.MeshStandardMaterial({ color: '#7a6a4a', emissive: new THREE.Color('#ffc978'), emissiveIntensity: 0 });
    const gl = new THREE.Mesh(mergeGeometries(PORCH_GLOW.map((g) => { g = g.index ? g.toNonIndexed() : g; return g; })), gm); gl.onBeforeRender = () => { gm.emissiveIntensity = Math.min(1, NIGHT.value) * 2.2; }; scene.add(gl); }
  return PORCHES.length + GATES.length + DRESSED.length;
}

// PLACED WINDOWS (2026-11-01, Dan: "can you attempt to place our windows so they look as they do in
// the photo?"): a windows touch names each window by its wall (east, south, west, north), how far
// along it (0 to 1, south to north or west to east), its size and sill above the ground, and a style:
// craftsman (divided lites above a clear pane), double (two sashes side by side), single, or vent.
// The shader's own window grid stays off that building, so only these show. Some glow at night.
function touchWindows() {
  const list = TOUCHES.filter((t) => t.kind === 'windows' && Array.isArray(t.windows));
  if (!list.length) return 0;
  const parts = [], lit = [], dark = [], col = new THREE.Color();
  const tint = (g, colour, into) => { g = g.index ? g.toNonIndexed() : g; if (g.attributes.uv) g.deleteAttribute('uv'); col.set(colour);
    const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3)); (into || parts).push(g); };
  let count = 0;
  for (const t of list) {
    const b = (meta.buildings || []).find((x) => x.id === t.anchor.building || (Array.isArray(x.also) && x.also.includes(t.anchor.building)));
    if (!b) continue;
    let ground = Infinity; for (const [x, y] of b.p) ground = Math.min(ground, sampleHeight(x, y));
    const trim = t.trim || '#f2efe8';
    t.windows.forEach((w, i) => {
      const side = w.wall || 'east', ew = side === 'east' || side === 'west';
      const xs = b.p.map((q) => q[0]), ys = b.p.map((q) => q[1]);
      const fixed = side === 'east' ? Math.max(...xs) : side === 'west' ? Math.min(...xs) : side === 'north' ? Math.max(...ys) : Math.min(...ys);
      const on = b.p.filter((q) => Math.abs((ew ? q[0] : q[1]) - fixed) < 0.2).map((q) => (ew ? q[1] : q[0]));
      if (on.length < 2) return;
      const lo = Math.min(...on), hi = Math.max(...on), along = lo + (hi - lo) * (+w.at || 0.5);
      const nrm = { east: [1, 0], west: [-1, 0], north: [0, 1], south: [0, -1] }[side];
      const W = +w.w || 1, H = +w.h || 1.2, sill = ground + (+w.sill || 1.5), cyW = sill + H / 2;
      const place = (g, out, y) => { if (ew) g.rotateY(Math.PI / 2); const X = ew ? fixed : along, Y = ew ? along : fixed;
        return g.translate(X + nrm[0] * out, y, -(Y + nrm[1] * out)); };
      tint(place(new THREE.BoxGeometry(W + 0.18, H + 0.18, 0.05), 0.025, cyW), trim);                 // the frame
      tint(place(new THREE.BoxGeometry(W + 0.3, 0.06, 0.14), 0.07, sill - 0.09), trim);               // the sill
      if (w.style === 'vent') {
        for (let k = 0; k < 4; k++) tint(place(new THREE.BoxGeometry(W - 0.06, 0.03, 0.04), 0.06, sill + 0.08 + k * (H - 0.16) / 3), '#cfcabd');
        tint(place(new THREE.BoxGeometry(W, H, 0.03), 0.04, cyW), '#4a4a46'); count++; return;
      }
      const isLit = w.lit !== undefined ? !!w.lit : i % 2 === 0;
      tint(place(new THREE.BoxGeometry(W, H, 0.03), 0.045, cyW), '#ffffff', isLit ? lit : dark);    // the glass
      const bar = (bw, bh, y) => tint(place(new THREE.BoxGeometry(bw, bh, 0.03), 0.065, y), trim);
      const bars = (x0, x1, y0, y1, n) => { for (let k = 1; k < n; k++) { const x = x0 + (x1 - x0) * k / n;
        const g = new THREE.BoxGeometry(0.035, y1 - y0, 0.03).translate(x, 0, 0); tint(place(g, 0.065, (y0 + y1) / 2), trim); } };
      if (w.style === 'craftsman') {   // divided lites in the top third over one clear pane
        const yb = sill + H * 0.66; bar(W, 0.05, yb); bars(-W / 2, W / 2, yb, sill + H, Math.max(2, Math.round(W / 0.32)));
      } else if (w.style === 'double') { bars(-W / 2, W / 2, sill, sill + H, 2); bar(W, 0.05, cyW); }
      else bar(W, 0.05, cyW);   // a single sash: the meeting rail
      count++;
    });
  }
  const frames = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }));
  frames.castShadow = frames.receiveShadow = true; scene.add(frames);
  const glassDark = new THREE.MeshStandardMaterial({ color: '#1f2529', roughness: 0.12, metalness: 0.4 });
  const glassLit = new THREE.MeshStandardMaterial({ color: '#1f2529', roughness: 0.12, metalness: 0.4, emissive: new THREE.Color('#ffcf8f'), emissiveIntensity: 0 });
  if (dark.length) scene.add(new THREE.Mesh(mergeGeometries(dark), glassDark));
  if (lit.length) { const m = new THREE.Mesh(mergeGeometries(lit), glassLit); m.onBeforeRender = () => { glassLit.emissiveIntensity = Math.min(1, NIGHT.value) * 1.1; }; scene.add(m); }
  return count;
}

// A GARDEN BED (2026-11-01, Dan's porch photo: a smoke bush, a rhododendron in flower, ornamental
// grass and leafy shrubs in front of the house): plants placed by wall, how far along it (0 to 1)
// and how far out from it, each a shrub (a soft leafy mound, flowers if it has them) or a grass
let GARDEN_MESH = null, GARDEN_SEASON = 'summer';
function rebuildGarden(season) { GARDEN_SEASON = season || 'summer'; if (GARDEN_MESH) { scene.remove(GARDEN_MESH); GARDEN_MESH.geometry.dispose(); GARDEN_MESH = null; } touchGarden(); }
function touchGarden() {
  const list = TOUCHES.filter((t) => t.kind === 'garden' && Array.isArray(t.plants));
  if (!list.length) return 0;
  const inSeason = (pl, key) => (GARDEN_SEASON !== 'summer' && pl[GARDEN_SEASON] !== undefined ? pl[GARDEN_SEASON] : pl[key]);
  const geos = [], col = new THREE.Color(), tmp = new THREE.Color();
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const paint = (g, colour, vary) => { g = g.index ? g.toNonIndexed() : g; if (g.attributes.uv) g.deleteAttribute('uv'); col.set(colour);
    const pos = g.attributes.position, n = pos.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 3) { const k = 1 - vary / 2 + vary * rnd(); tmp.copy(col).multiplyScalar(k); for (let j = 0; j < 3; j++) { a[(i + j) * 3] = tmp.r; a[(i + j) * 3 + 1] = tmp.g; a[(i + j) * 3 + 2] = tmp.b; } }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3)); geos.push(g); };
  let count = 0;
  for (const t of list) {
    const b = t.anchor.building ? (meta.buildings || []).find((x) => x.id === t.anchor.building || (Array.isArray(x.also) && x.also.includes(t.anchor.building))) : null;
    if (!b && !Array.isArray(t.xy)) continue;
    for (const pl of t.plants) {
      const colour = inSeason(pl, 'colour');
      if (colour === 'bare' || colour === 'gone') continue;
      if (!b || pl.dx !== undefined) {   // a plant placed by metres east (dx) and north (dy) of the touch's point
        const X = t.xy[0] + (+pl.dx || 0), Y = t.xy[1] + (+pl.dy || 0), g0 = sampleHeight(X, Y);
        if (pl.kind === 'bed') {   // A RAISED BED (Dan's fall photo, the one in the parking strip): plank sides, soil, a few tufts
          const w = +pl.w || 1.1, l = +pl.l || 3, h = +pl.h || 0.4, wood = pl.wood || '#7d6650';
          for (const sx of [-1, 1]) { paint(new THREE.BoxGeometry(0.08, h, l).translate(X + sx * (w / 2 - 0.04), g0 + h / 2, -Y), wood, 0.25); paint(new THREE.BoxGeometry(w, h, 0.08).translate(X, g0 + h / 2, -(Y + sx * (l / 2 - 0.04))), wood, 0.25); }
          paint(new THREE.BoxGeometry(w - 0.16, 0.04, l - 0.16).translate(X, g0 + h - 0.08, -Y), '#4a3a2c', 0.3);
          for (let k = 0; k < (pl.tufts || 5); k++) { const ty = -l / 2 + 0.4 + k * (l - 0.8) / Math.max(1, (pl.tufts || 5) - 1); paint(new THREE.IcosahedronGeometry(0.2, 1).scale(1, 0.7, 1).translate(X + (rnd() - 0.5) * 0.4, g0 + h + 0.05, -(Y + ty)), inSeason(pl, 'plants') || '#7a8a4a', 0.45); }
        } else if (pl.kind === 'trellis') {   // a tall metal grid frame
          const w = +pl.w || 1.1, h = +pl.h || 2, m = pl.metal || '#5d6366', rot = pl.across === 'ns' ? Math.PI / 2 : 0;
          const bar = (bw, bh, ox, oy) => paint(new THREE.BoxGeometry(bw, bh, 0.025).translate(ox, oy, 0).rotateY(rot).translate(X, g0, -Y), m, 0.15);
          for (const sx of [-1, 1]) bar(0.03, h, sx * w / 2, h / 2);
          for (let k = 1; k <= 5; k++) bar(w, 0.02, 0, h * k / 5);
          for (let k = 1; k < 4; k++) bar(0.015, h, -w / 2 + w * k / 4, h / 2);
        } else if (pl.kind === 'stake') {
          paint(new THREE.CylinderGeometry(0.025, 0.025, +pl.h || 1.8, 6).translate(X + 0.15, g0 + (+pl.h || 1.8) / 2, -Y), '#8a7558', 0.2);
        } else plantAt(pl, X, Y, g0, colour);
        count++; continue;
      }
      const side = pl.wall || 'east', ew = side === 'east' || side === 'west';
      const xs = b.p.map((q) => q[0]), ys = b.p.map((q) => q[1]);
      const fixed = side === 'east' ? Math.max(...xs) : side === 'west' ? Math.min(...xs) : side === 'north' ? Math.max(...ys) : Math.min(...ys);
      const on = b.p.filter((q) => Math.abs((ew ? q[0] : q[1]) - fixed) < 0.2).map((q) => (ew ? q[1] : q[0]));
      if (on.length < 2) continue;
      const along = Math.min(...on) + (Math.max(...on) - Math.min(...on)) * (+pl.at || 0.5);
      const nrm = { east: [1, 0], west: [-1, 0], north: [0, 1], south: [0, -1] }[side], out = +pl.out || 1;
      const X = (ew ? fixed : along) + nrm[0] * out, Y = (ew ? along : fixed) + nrm[1] * out, g0 = sampleHeight(X, Y);
      plantAt(pl, X, Y, g0, colour);
      count++;
    }
  }
  function plantAt(pl, X, Y, g0, colour) {
      const r = +pl.r || 0.6, h = +pl.h || 1;
      if (pl.kind === 'grass') {   // a fountain of thin blades
        for (let k = 0; k < 60; k++) {
          const a = rnd() * Math.PI * 2, lean = 0.25 + rnd() * 0.5, bh = h * (0.6 + rnd() * 0.5);
          const g = new THREE.ConeGeometry(0.018, bh, 3).translate(0, bh / 2, 0).rotateZ(lean * Math.cos(a)).rotateX(lean * Math.sin(a));
          paint(g.translate(X + Math.cos(a) * r * 0.15, g0, -(Y + Math.sin(a) * r * 0.15)), colour || '#7d9a4f', 0.35);
        }
      } else {   // a leafy mound: a lumpy sphere, a few smaller lumps around it
        for (let k = 0; k < (pl.lumps || 4); k++) {
          const lr = r * (k ? 0.45 + rnd() * 0.3 : 0.85), a = rnd() * Math.PI * 2, d = k ? r * 0.5 : 0;
          const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position;
          for (let i = 0; i < p.count; i++) { const f = 0.82 + 0.3 * Math.abs(Math.sin(p.getX(i) * 5.1 + p.getY(i) * 3.7 + p.getZ(i) * 4.3 + k)); p.setXYZ(i, p.getX(i) * f, p.getY(i) * f, p.getZ(i) * f); }
          const sy = (h / 2) / r * (k ? 0.8 : 1);
          g.scale(lr, lr * sy, lr).translate(X + Math.cos(a) * d, g0 + lr * sy * (k ? 0.85 : 0.95), -(Y + Math.sin(a) * d));
          paint(g, colour || '#4f7a3a', 0.4);
        }
        const fl = inSeason(pl, 'flowers'), blooming = Array.isArray(pl.bloom) ? pl.bloom.includes(GARDEN_SEASON) : GARDEN_SEASON === 'summer' || GARDEN_SEASON === 'spring';
        if (fl && fl !== 'none' && blooming) for (let k = 0; k < (pl.blooms || 26); k++) {   // flower heads on the upper surface
          const a = rnd() * Math.PI * 2, el = rnd() * 1.1, rr = r * 0.95;
          paint(new THREE.IcosahedronGeometry(0.06 + rnd() * 0.04, 0).translate(X + Math.cos(a) * Math.cos(el) * rr, g0 + h * 0.5 + Math.sin(el) * h * 0.48, -(Y + Math.sin(a) * Math.cos(el) * rr)), fl, 0.25);
        }
      }
  }
  if (!geos.length) return 0;
  const mesh = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: true }));
  mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh); GARDEN_MESH = mesh;
  return count;
}

// A NEIGHBOURHOOD LANDMARK'S OWN PIECES (2026-11-02, Dan: "there's a tribal church in our neighborhood
// ... let's add a few nice touches to it"; Great Spirit United Methodist Church, 3917 NE Shaver St, from
// Dan's street view and 3D view): a steeple (a square tower, a flared louvred belfry, a spire and its
// cross), fins standing off a wall, an A-frame sign on the lawn, a bench
function touchLandmarks() {
  const list = TOUCHES.filter((t) => ['steeple', 'fins', 'sign', 'bench'].includes(t.kind) && Array.isArray(t.xy));
  if (!list.length) return 0;
  const parts = [], col = new THREE.Color();
  const add = (g, colour) => { g = g.index ? g.toNonIndexed() : g; if (g.attributes.uv) g.deleteAttribute('uv'); col.set(colour);
    const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(g); };
  const at = (g, x, y, z) => g.translate(x, y, -z);
  for (const t of list) {
    const [X, Y] = t.xy, g0 = sampleHeight(X, Y);
    if (t.kind === 'steeple') {
      const S = t.steeple || {}, w = +S.size_m || 3.4, th = +S.tower_m || 9.5, wall = S.colour || '#f1f0ea';
      add(at(new THREE.BoxGeometry(w, th, w), X, g0 + th / 2, Y), wall);                                   // the tower
      for (let k = 0; k < Math.round(w / 0.42); k++) for (const sd of [-1, 1]) {   // its battens, on all four faces
        const o = -w / 2 + 0.21 + k * 0.42;
        add(at(new THREE.BoxGeometry(0.05, th, 0.03), X + o, g0 + th / 2, Y + sd * (w / 2 + 0.015)), '#e2e1da');
        add(at(new THREE.BoxGeometry(0.03, th, 0.05), X + sd * (w / 2 + 0.015), g0 + th / 2, Y + o), '#e2e1da');
      }
      const face = S.windows_face === 'north' ? 1 : -1;   // the small paired windows near the top, on the street side
      for (const dx of [-0.32, 0.32]) {
        add(at(new THREE.BoxGeometry(0.62, 0.95, 0.04), X + dx, g0 + th - 1.6, Y + face * (w / 2 + 0.03)), '#f8f7f2');
        add(at(new THREE.BoxGeometry(0.48, 0.8, 0.05), X + dx, g0 + th - 1.6, Y + face * (w / 2 + 0.04)), '#262a2e');
        add(at(new THREE.BoxGeometry(0.48, 0.03, 0.06), X + dx, g0 + th - 1.6, Y + face * (w / 2 + 0.05)), '#f8f7f2');
      }
      // the belfry, flaring out as it rises, its louvres in white slats with shadow between
      const bh = +S.belfry_m || 2.4, b0 = g0 + th;
      add(at(new THREE.CylinderGeometry(w * 0.82, w * 0.56, bh, 4, 1).rotateY(Math.PI / 4), X, b0 + bh / 2, Y), '#3a3e42');
      for (let k = 0; k < 7; k++) { const u = (k + 0.5) / 7, r = w * (0.56 + 0.26 * u) + 0.03;
        add(at(new THREE.CylinderGeometry(r, r - 0.02, 0.16, 4, 1, true).rotateY(Math.PI / 4), X, b0 + u * bh, Y), wall); }
      for (const [cx, cz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) add(at(new THREE.BoxGeometry(0.16, bh, 0.16).rotateZ(-cx * 0.13).rotateX(cz * 0.13), X + cx * w * 0.48, b0 + bh / 2, Y + cz * w * 0.48), wall);   // corner posts
      add(at(new THREE.BoxGeometry(w * 1.25, 0.18, w * 1.25), X, b0 + bh + 0.09, Y), wall);               // its cornice
      add(at(new THREE.CylinderGeometry(0.05, w * 0.7, 0.8, 4, 1).rotateY(Math.PI / 4), X, b0 + bh + 0.58, Y), S.cap || '#8c9497');   // a low cap
      const sh = +S.spire_m || 6.5, s0 = b0 + bh + 0.5;
      add(at(new THREE.CylinderGeometry(0.03, w * 0.3, sh, 4, 1).rotateY(Math.PI / 4), X, s0 + sh / 2, Y), S.spire_colour || '#5e9086');   // the copper spire, gone to verdigris
      add(at(new THREE.BoxGeometry(0.07, 0.75, 0.07), X, s0 + sh + 0.3, Y), S.cross || '#3a3a38');          // the cross
      add(at(new THREE.BoxGeometry(0.42, 0.07, 0.07), X, s0 + sh + 0.42, Y), S.cross || '#3a3a38');
    } else if (t.kind === 'fins') {
      // fins along a building's wall: white boards standing off it at an angle, the height of the eave
      const F = t.fins || {}, b = (meta.buildings || []).find((x) => x.id === t.anchor.building || (Array.isArray(x.also) && x.also.includes(t.anchor.building)));
      if (!b) continue;
      const side = F.wall || 'south', ew = side === 'east' || side === 'west';
      const xs = b.p.map((q) => q[0]), ys = b.p.map((q) => q[1]);
      const fixed = side === 'east' ? Math.max(...xs) : side === 'west' ? Math.min(...xs) : side === 'north' ? Math.max(...ys) : Math.min(...ys);
      const on = b.p.filter((q) => Math.abs((ew ? q[0] : q[1]) - fixed) < 0.2).map((q) => (ew ? q[1] : q[0])), lo = Math.min(...on), hi = Math.max(...on);
      const nrm = { east: [1, 0], west: [-1, 0], north: [0, 1], south: [0, -1] }[side], n = F.count || 6, [f0, f1] = F.span || [0.05, 0.95];
      let gb = Infinity; for (const [x, y] of b.p) gb = Math.min(gb, sampleHeight(x, y));
      const fh = +F.height_m || 5, dep = +F.depth_m || 0.8;
      for (let k = 0; k < n; k++) {
        const along = lo + (hi - lo) * (f0 + (f1 - f0) * k / Math.max(1, n - 1));
        const fx = (ew ? fixed : along) + nrm[0] * dep / 2, fy = (ew ? along : fixed) + nrm[1] * dep / 2;
        const g = new THREE.BoxGeometry(ew ? dep : 0.24, fh, ew ? 0.24 : dep).rotateY(F.angle_deg ? F.angle_deg * Math.PI / 180 : 0.35);
        add(at(g, fx, gb + fh / 2 - 0.3, fy), F.colour || '#f3f2ec');
      }
    } else if (t.kind === 'sign') {
      const G = t.sign || {}, yaw = +G.yaw || 0, w = +G.w || 1.0, h = +G.h || 0.75;
      for (const sd of [-1, 1]) {   // the two legs of the A-frame
        const leg = new THREE.BoxGeometry(w, h + 0.25, 0.04).translate(0, (h + 0.25) / 2, 0).rotateX(sd * 0.22).translate(0, 0, sd * 0.12).rotateY(yaw);
        add(at(leg, X, g0, Y), G.board || '#f4f2ea');
      }
      SIGNS.push({ x: X, y: Y, g: g0, yaw, w, h, text: G.text || [], mark: G.mark });
    } else if (t.kind === 'bench') {
      const B = t.bench || {}, yaw = +B.yaw || 0, L = +B.length_m || 1.6, c = B.colour || '#7a5a3c';
      const piece = (g) => add(at(g.rotateY(yaw), X, g0, Y), c);
      piece(new THREE.BoxGeometry(L, 0.05, 0.42).translate(0, 0.45, 0));
      piece(new THREE.BoxGeometry(L, 0.32, 0.05).translate(0, 0.72, -0.2));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) piece(new THREE.BoxGeometry(0.06, 0.45, 0.06).translate(sx * (L / 2 - 0.08), 0.22, sz * 0.17));
    }
  }
  if (parts.length) { const m = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 })); m.castShadow = m.receiveShadow = true; scene.add(m); }
  for (const S of SIGNS) {   // the sign's face, painted: the mark and the words, both sides
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 384; const x = cv.getContext('2d');
    x.fillStyle = '#f6f3ea'; x.fillRect(0, 0, 512, 384);
    if (S.mark === 'diamond') {   // Great Spirit's mark: a diamond within a diamond
      x.save(); x.translate(130, 192); x.rotate(Math.PI / 4);
      x.fillStyle = '#c8452d'; x.fillRect(-62, -62, 124, 124); x.fillStyle = '#f2b23a'; x.fillRect(-36, -36, 72, 72); x.fillStyle = '#2d2a26'; x.fillRect(-13, -13, 26, 26); x.restore();
    }
    x.fillStyle = '#2b2824'; x.font = 'bold 74px Georgia, serif'; x.textBaseline = 'middle';
    (S.text.length ? S.text : ['']).forEach((line, i, all) => x.fillText(line, S.mark ? 230 : 40, 192 + (i - (all.length - 1) / 2) * 86));
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
    for (const sd of [-1, 1]) {
      const face = new THREE.Mesh(new THREE.PlaneGeometry(S.w * 0.92, S.h * 0.86), mat);
      face.position.set(0, S.h / 2 + 0.2, 0); face.rotation.x = -sd * 0.22; face.position.z = sd * (0.12 + 0.025);
      if (sd < 0) face.rotation.y = Math.PI;
      const holder = new THREE.Group(); holder.add(face); holder.rotation.y = S.yaw + (sd < 0 ? 0 : 0); holder.position.set(S.x, S.g, -S.y);
      if (sd > 0) { face.rotation.y = 0; } else { face.rotation.y = Math.PI; face.rotation.x = 0.22; }
      scene.add(holder);
    }
  }
  return list.length;
}
const SIGNS = [];

// STOREFRONTS (2026-11-02, Dan: "let's work on Everest M Market and Bosk", 3734-3746 NE 42nd Ave at
// Beech): a storefront touch dresses one wall of a building in segments, south to north or west to
// east (from and to, 0 to 1): shop glass in a frame, a grid of windows over a bulkhead, a door, barrel
// awnings, painted signs and banners, wall lights, neon, a row of little marks; a clay tile skirt can
// run round the roof's edge; and props stand out front (an ice chest, a picnic table, planters)
function paintCanvas(spec, pw, ph) {   // a sign's face: its ground, its words, and any marks
  const cv = document.createElement('canvas'), k = 128; cv.width = Math.max(64, Math.round(pw * k)); cv.height = Math.max(32, Math.round(ph * k));
  const x = cv.getContext('2d'); x.fillStyle = spec.bg || '#ffffff'; x.fillRect(0, 0, cv.width, cv.height);
  if (spec.border) { x.strokeStyle = spec.border; x.lineWidth = Math.max(4, cv.height * 0.06); x.strokeRect(0, 0, cv.width, cv.height); }
  const lines = Array.isArray(spec.text) ? spec.text : [spec.text || ''];
  const sizes = spec.sizes || lines.map(() => 1);
  const total = sizes.reduce((a, b) => a + b, 0), unit = cv.height * (spec.fill || 0.78) / total;
  let y = (cv.height - unit * total) / 2;
  lines.forEach((ln, i) => {
    const fs = unit * sizes[i] * 0.86; x.font = (spec.weight || 'bold') + ' ' + fs + 'px ' + (spec.font || 'Arial, Helvetica, sans-serif');
    x.fillStyle = (spec.colours && spec.colours[i]) || spec.fg || '#ffffff'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const wmax = cv.width * 0.92, m = x.measureText(ln).width; x.save(); x.translate(cv.width / 2, y + unit * sizes[i] / 2); if (m > wmax) x.scale(wmax / m, 1); x.fillText(ln, 0, 0); x.restore();
    y += unit * sizes[i];
  });
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; return tex;
}
function touchStorefronts() {
  const list = TOUCHES.filter((t) => t.kind === 'storefront' && t.storefront);
  if (!list.length) return 0;
  const parts = [], lit = [], col = new THREE.Color();
  const tint = (g, colour, into) => { g = g.index ? g.toNonIndexed() : g; if (g.attributes.uv) g.deleteAttribute('uv'); col.set(colour);
    const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3)); (into || parts).push(g); };
  for (const t of list) {
    const S = t.storefront, b = (meta.buildings || []).find((x) => x.id === t.anchor.building || (Array.isArray(x.also) && x.also.includes(t.anchor.building)));
    if (!b) continue;
    let ground = Infinity, A = 0; for (let i = 0; i < b.p.length; i++) { const [x1, y1] = b.p[i], [x2, y2] = b.p[(i + 1) % b.p.length]; ground = Math.min(ground, sampleHeight(x1, y1)); A += x1 * y2 - x2 * y1; }
    const top = ground + Math.max(3, b.h);   // the building's own roof line
    const xs = b.p.map((q) => q[0]), ys = b.p.map((q) => q[1]), X0 = Math.min(...xs), X1 = Math.max(...xs), Y0 = Math.min(...ys), Y1 = Math.max(...ys);
    // a frame for each wall: u out from the wall, v along it (south to north, or west to east), y up
    const frameOf = (side) => {
      const ew = side === 'east' || side === 'west', fixed = { east: X1, west: X0, north: Y1, south: Y0 }[side], nrm = { east: [1, 0], west: [-1, 0], north: [0, 1], south: [0, -1] }[side];
      const lo = ew ? Y0 : X0, hi = ew ? Y1 : X1;
      const box = (du, dh, dv, u, v, y, c, into) => { const g = ew ? new THREE.BoxGeometry(du, dh, dv) : new THREE.BoxGeometry(dv, dh, du);
        const wx = ew ? fixed + nrm[0] * u : v, wy = ew ? v : fixed + nrm[1] * u; tint(g.translate(wx, y, -wy), c, into); };
      const geo = (g, u, v, y, c, into) => { if (ew) g.rotateY(Math.PI / 2); const wx = ew ? fixed + nrm[0] * u : v, wy = ew ? v : fixed + nrm[1] * u; tint(g.translate(wx, y, -wy), c, into); };
      const face = (tex, w, h, u, v, y, emissive) => {   // a painted plane facing out of the wall
        const m = new THREE.MeshStandardMaterial(Object.assign({ map: tex, roughness: 0.55 }, emissive ? { emissive: new THREE.Color(emissive), emissiveMap: tex, emissiveIntensity: 0.9 } : {}));
        const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); p.rotation.y = { west: -Math.PI / 2, east: Math.PI / 2, south: 0, north: Math.PI }[side];
        const wx = ew ? fixed + nrm[0] * u : v, wy = ew ? v : fixed + nrm[1] * u; p.position.set(wx, y, -wy); scene.add(p); return m; };
      const orient = (g, v, y, c, into) => { if (ew) { if (nrm[0] < 0) g.rotateY(Math.PI); } else g.rotateY(nrm[1] > 0 ? Math.PI / 2 : -Math.PI / 2);
        const wx = ew ? fixed : v, wy = ew ? v : fixed; tint(g.translate(wx, y, -wy), c, into); };
      return { orient, ew, fixed, nrm, lo, hi, L: hi - lo, at: (f) => lo + (hi - lo) * f, box, geo, face };
    };
    // the clay tile skirt round the roof's edge
    if (S.tile_skirt) {
      const T = S.tile_skirt, c = T.colour || '#b0533c', hgt = +T.height_m || 0.9, out = +T.out_m || 0.55;
      for (const side of ['north', 'south', 'east', 'west']) {
        const F = frameOf(side), slope = Math.atan2(hgt, out + 0.25), len = Math.hypot(hgt, out + 0.25);
        const ym = top - hgt / 2 + 0.15, um = (out - 0.25) / 2;
        const slab = new THREE.BoxGeometry(F.L + 2 * out, 0.07, len).rotateX(slope);   // along x, sloping up toward the wall
        if (F.ew) slab.rotateY(F.nrm[0] > 0 ? Math.PI / 2 : -Math.PI / 2); else if (F.nrm[1] > 0) slab.rotateY(Math.PI);
        tint(slab.translate(F.ew ? F.fixed + F.nrm[0] * um : (F.lo + F.hi) / 2, ym, -(F.ew ? (F.lo + F.hi) / 2 : F.fixed + F.nrm[1] * um)), c);
        const n = Math.floor((F.L + 2 * out) / 0.24);
        for (let k = 0; k < n; k++) {   // the barrels of the tiles, each catching the light a little differently
          const v = F.lo - out + 0.12 + k * 0.24, rib = new THREE.CylinderGeometry(0.07, 0.07, len, 6, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).rotateX(slope);
          if (F.ew) rib.rotateY(F.nrm[0] > 0 ? Math.PI / 2 : -Math.PI / 2); else if (F.nrm[1] > 0) rib.rotateY(Math.PI);
          col.set(c).offsetHSL(0, 0, ((k * 37) % 9 - 4) * 0.012);
          tint(rib.translate(F.ew ? F.fixed + F.nrm[0] * um : v, ym + 0.05, -(F.ew ? v : F.fixed + F.nrm[1] * um)), '#' + col.getHexString());
        }
        tint(new THREE.BoxGeometry(F.ew ? 0.12 : F.L + 2 * out, 0.12, F.ew ? F.L + 2 * out : 0.12).translate(F.ew ? F.fixed - F.nrm[0] * 0.25 : (F.lo + F.hi) / 2, top + 0.2, -(F.ew ? (F.lo + F.hi) / 2 : F.fixed - F.nrm[1] * 0.25)), '#9c4632');   // the ridge cap
      }
    }
    for (const seg of S.segments || []) {
      const F = frameOf(seg.wall || S.wall || 'west'), v0 = F.at(seg.from), v1 = F.at(seg.to), w = v1 - v0, vm = (v0 + v1) / 2;
      if (seg.wall_colour) F.box(0.03, top - ground - 0.6, w, 0.015, vm, ground + (top - ground - 0.6) / 2, seg.wall_colour);
      const semi = (r, depth) => new THREE.ExtrudeGeometry(new THREE.Shape().absarc(0, 0, r, 0, Math.PI, false), { depth, bevelEnabled: false, curveSegments: 18 }).rotateY(Math.PI / 2);
      const ring = (r, t2, depth) => { const sh = new THREE.Shape().absarc(0, 0, r + t2, 0, Math.PI, false); sh.lineTo(-r, 0); const hole = new THREE.Path().absarc(0, 0, r, Math.PI, 0, true); sh.holes.push(hole);
        return new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 18 }).rotateY(Math.PI / 2); };
      if (seg.crown) {   // a stucco piece rising above the eave with a rounded top
        const C = seg.crown, cy0 = ground + (+C.y || 3.9), ch = +C.h || 1.2, cw = +C.w || w;
        F.box(+C.depth || 0.35, ch, cw, -(+C.depth || 0.35) / 2 + 0.05, vm, cy0 + ch / 2, C.colour || '#f3f1ea');   // its body, set into the roof
        F.orient(semi(cw / 2, +C.depth || 0.35).scale(1, Math.min(1, (+C.rise || 0.8) / (cw / 2)), 1).translate(-(+C.depth || 0.35) + 0.05, 0, 0), vm, cy0 + ch, C.colour || '#f3f1ea');
      }
      if (seg.band) {   // a band of brick (or any facing) across the lower wall, with mortar courses
        const bh = +seg.band.h || 3.5, c = seg.band.colour || '#8a5a3e';
        F.box(0.06, bh, w, 0.03, vm, ground + bh / 2, c);
        for (let k = 1; k < bh / 0.3; k++) F.box(0.065, 0.02, w, 0.035, vm, ground + k * 0.3, seg.band.mortar || '#a07656');
        F.box(0.16, 0.14, w, 0.07, vm, ground + bh + 0.04, seg.band.cap || '#7a4c34');
      }
      if (seg.pent) {   // a pent roof of tile between the storeys
        const P = seg.pent, dep = +P.depth || 0.9, py = ground + (+P.y || 3.7);
        F.orient(new THREE.BoxGeometry(dep / Math.cos(0.42), 0.08, w).rotateZ(-0.42).translate(dep / 2, dep * Math.tan(0.42) / 2, 0), vm, py, P.colour || '#8a5a46');
      }
      for (const G of seg.gables || []) {   // a steep front gable in stucco with a dark rake, rising through the roof
        const gv = F.at(G.at), gw = +G.w || 6, gh = +G.h || 6, gy = ground + (+G.y || 3.7), out = +G.out || 0.35;
        const tri = (hw, hh) => new THREE.Shape([new THREE.Vector2(-hw, 0), new THREE.Vector2(hw, 0), new THREE.Vector2(0, hh)]);
        const back = +G.back || 6, ang = Math.atan2(gh, gw / 2), rake = Math.hypot(gw / 2 + 0.4, gh + 0.3);
        F.orient(new THREE.ExtrudeGeometry(tri(gw / 2, gh), { depth: back + out, bevelEnabled: false }).rotateY(Math.PI / 2).translate(-back, 0, 0), gv, gy, G.colour || '#f3f1ea');   // the gable's own body, reaching back
        for (const sd of [-1, 1]) {   // its two roof slopes, tiled, and the dark rake boards at their edges
          F.orient(new THREE.BoxGeometry(back + out + 0.3, 0.14, rake).rotateX(sd * ang).translate(out + 0.15 - (back + out + 0.3) / 2, gh / 2 + 0.12, sd * (gw / 4 + 0.1)), gv, gy, G.roof || '#74493a');
          F.orient(new THREE.BoxGeometry(0.1, 0.22, rake).rotateX(sd * ang).translate(out + 0.32, gh / 2 + 0.06, sd * (gw / 4 + 0.1)), gv, gy, G.trim || '#2b2622');
        }
        F.orient(new THREE.BoxGeometry(0.12, 0.16, gw + 0.4).translate(out + 0.06, 0.02, 0), gv, gy, G.trim || '#2b2622');   // the dark band at its foot
      }
      if (seg.fan) {   // a half-round fan window in a dormer on the roof
        const R = seg.fan, fv = F.at(R.at), fy = ground + (+R.y || 6.3), r = +R.r || 1.4, out = +R.out || 0.4;
        F.orient(semi(r + 0.25, out + 0.8).translate(-0.8, 0, 0), fv, fy, R.roof || '#8a5a46');
        F.orient(semi(r, 0.08).translate(out + 0.02, 0, 0), fv, fy, '#ffffff', lit);
        F.orient(ring(r, 0.12, 0.1).translate(out + 0.04, 0, 0), fv, fy, R.frame || '#1c1c1c');
        for (let k = 1; k < 8; k++) F.orient(new THREE.BoxGeometry(0.04, r, 0.035).translate(out + 0.1, r / 2, 0).rotateX(-Math.PI / 2 + k * Math.PI / 8), fv, fy, R.bars || '#f4f3ee');
        F.orient(new THREE.BoxGeometry(0.05, 0.05, 2 * r).translate(out + 0.1, 0.03, 0), fv, fy, R.bars || '#f4f3ee');
      }
      if (seg.medallions) for (const mf of seg.medallions.at) {   // terracotta medallions on the brick piers
        const M = seg.medallions, mv = F.at(mf), my = ground + (+M.y || 2.9);
        F.box(0.05, 0.36, 0.36, 0.08, mv, my, M.colour || '#c9643a');
        F.orient(new THREE.CylinderGeometry(0.12, 0.12, 0.04, 14).rotateZ(Math.PI / 2).translate(0.12, 0, 0), mv, my, M.inner || '#e8b88a');
        F.orient(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 14).rotateZ(Math.PI / 2).translate(0.13, 0, 0), mv, my, M.colour || '#c9643a');
      }
      if (seg.bulkhead) { const bh = +seg.bulkhead.h || 0.95; F.box(0.05, bh, w - 0.1, 0.03, vm, ground + bh / 2, seg.bulkhead.colour || '#a8b2ba');
        for (let k = 1; k < bh / 0.12; k++) F.box(0.06, 0.012, w - 0.1, 0.035, vm, ground + k * 0.12, '#8f9aa3'); }
      if (seg.glass) {   // a storefront: a frame, dark glass that glows warm at night, mullions
        const G = seg.glass, g0 = ground + (+G.sill || 0.4), gh = +G.h || 2.2, gw = w - 2 * (+G.margin || 0.3), fc = G.frame || '#1c1c1c';
        F.box(0.06, gh + 0.14, gw + 0.14, 0.03, vm, g0 + gh / 2, fc);
        F.box(0.04, gh, gw, 0.06, vm, g0 + gh / 2, '#ffffff', lit);
        const nv = Math.max(1, Math.round(gw / (+G.pane || 0.9)));
        for (let k = 1; k < nv; k++) F.box(0.05, gh, 0.06, 0.08, v0 + (+G.margin || 0.3) + gw * k / nv, g0 + gh / 2, fc);
        for (const hy of G.rails || [0.62]) F.box(0.05, 0.06, gw, 0.08, vm, g0 + gh * hy, fc);
        if (G.base) F.box(0.06, g0 - ground, gw + 0.14, 0.03, vm, ground + (g0 - ground) / 2, G.base);
        if (G.arch) { const k = Math.min(1, (+G.arch_rise || 0.75) / (gw / 2));   // a segmental arch: its rise kept within the brick
          F.orient(semi(gw / 2, 0.04).scale(1, k, 1).translate(0.06, 0, 0), vm, g0 + gh, '#ffffff', lit); F.orient(ring(gw / 2, 0.08, 0.06).scale(1, k, 1).translate(0.07, 0, 0), vm, g0 + gh, fc);
          F.orient(ring(gw / 2 + 0.08, 0.24, 0.09).scale(1, k, 1).translate(0.04, 0, 0), vm, g0 + gh, G.arch_ring || '#7a4c34'); }
      }
      if (seg.door) {
        const D = seg.door, dv = F.at(D.at), dw = +D.w || 0.95, dh = +D.h || 2.1, fc = D.frame || '#f4f3ee';
        F.box(0.07, dh + 0.1, dw + 0.12, 0.06, dv, ground + 0.05 + dh / 2, fc);
        F.box(0.05, dh - 0.24, dw - 0.24, 0.1, dv, ground + 0.07 + dh / 2, '#ffffff', lit);
        if (D.text) F.face(paintCanvas({ text: D.text, bg: '#1e2226', fg: D.text_colour || '#e9e6dd', weight: '300', font: 'Georgia, serif' }, 0.3, 1.2), 0.3, 1.2, 0.14, dv, ground + 1.15);
      }
      if (seg.awnings) for (const a of seg.awnings) {   // barrel awnings: a quarter-round of cloth, with a valance
        const av0 = F.at(a.from), av1 = F.at(a.to), aw = av1 - av0, dep = +a.depth || 0.95, ay = ground + (+a.y || 2.55), c = a.colour || '#9e2a33';
        for (let k = 0; k < 8; k++) {   // the curve, in eight slats from the wall out and down
          const q0 = k / 8 * Math.PI / 2, q1 = (k + 1) / 8 * Math.PI / 2, rise = +a.rise || 0.75;
          const u0 = dep * Math.sin(q0), y0 = rise * Math.cos(q0), u1 = dep * Math.sin(q1), y1 = rise * Math.cos(q1), len = Math.hypot(u1 - u0, y1 - y0) + 0.01;
          const g = new THREE.BoxGeometry(len, 0.03, aw).rotateZ(Math.atan2(y1 - y0, u1 - u0)).translate((u0 + u1) / 2, (y0 + y1) / 2, 0);
          F.orient(g, (av0 + av1) / 2, ay, c);
        }
        F.box(0.03, 0.22, aw, dep, (av0 + av1) / 2, ay - 0.11, c);
        for (let k = 0; k <= Math.floor(aw / 0.6); k++) F.box(0.05, 0.05, 0.04, dep * 0.5, av0 + Math.min(aw, k * 0.6), ay + 0.5, '#7d1e27');
      }
      for (const sg of seg.signs || []) {
        const sw = +sg.w || 3, sh = +sg.h || 0.5, sv = F.at(sg.at ?? 0.5), su = +sg.out || 0.04;
        F.box(0.04, sh + 0.04, sw + 0.04, su - 0.02, sv, ground + sg.y, sg.edge || '#ffffff');
        F.face(paintCanvas(sg, sw, sh), sw, sh, su + 0.005, sv, ground + sg.y);
      }
      for (const nn of seg.neon || []) {
        const m = F.face(paintCanvas({ text: nn.text, bg: '#101114', fg: nn.colour || '#c86cff', weight: '400', font: 'Arial, sans-serif', fill: 0.7 }, +nn.w || 0.6, +nn.h || 0.2), +nn.w || 0.6, +nn.h || 0.2, 0.1, F.at(nn.at), ground + nn.y, '#ffffff');
        m.emissiveIntensity = 1.1;
      }
      for (const lt of seg.lights || []) {   // a black barn light on a gooseneck
        const lv = F.at(lt.at), ly = ground + (+lt.y || 2.8);
        F.box(0.25, 0.04, 0.04, 0.12, lv, ly + 0.12, '#1a1a1a');
        F.geo(new THREE.CylinderGeometry(0.06, 0.16, 0.14, 12).translate(0, 0, 0), 0.26, lv, ly, '#1a1a1a');
        F.geo(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 12), 0.26, lv, ly - 0.08, '#ffffff', lit);
      }
      if (seg.marks) {   // a row of little marks, a diamond in the middle
        const M = seg.marks, mv = F.at(M.at ?? (seg.from + seg.to) / 2), my = ground + (+M.y || 3.3), n = M.count || 2;
        for (let k = 1; k <= n; k++) for (const sd of [-1, 1]) F.box(0.03, 0.12, 0.12, 0.03, mv + sd * k * 0.32, my, M.colour || '#151515');
        F.geo(new THREE.BoxGeometry(0.03, 0.2, 0.2).rotateX(Math.PI / 4), 0.03, mv, my, M.colour || '#151515');
        if (M.corners) for (const [dv, dy] of M.corners) F.box(0.03, 0.12, 0.12, 0.03, F.at(dv), ground + dy, M.colour || '#151515');
      }
      for (const bn of seg.banners || []) {
        const bw = +bn.w || 1.6, bh = +bn.h || 2, bv = F.at(bn.at);
        F.face(paintCanvas(bn, bw, bh), bw, bh, 0.03, bv, ground + bn.y);
      }
      for (const wn of seg.windows || []) {
        const wv = F.at(wn.at), ww = +wn.w || 0.7, wh = +wn.h || 0.5;
        F.box(0.05, wh + 0.1, ww + 0.1, 0.025, wv, ground + wn.y, wn.frame || '#f4f3ee'); F.box(0.04, wh, ww, 0.05, wv, ground + wn.y, '#ffffff', lit);
        F.box(0.05, wh, 0.04, 0.07, wv, ground + wn.y, wn.frame || '#f4f3ee'); F.box(0.05, 0.04, ww, 0.07, wv, ground + wn.y + wh * 0.15, wn.frame || '#f4f3ee');
        if (wn.arch) { F.orient(semi(ww / 2, 0.04).translate(0.05, 0, 0), wv, ground + wn.y + wh / 2, '#ffffff', lit); F.orient(ring(ww / 2, 0.06, 0.05).translate(0.04, 0, 0), wv, ground + wn.y + wh / 2, wn.frame || '#f4f3ee'); }
        if (wn.shutters) for (const sd of [-1, 1]) F.box(0.05, wh + (wn.arch ? ww / 2 : 0), ww * 0.45, 0.04, wv + sd * (ww * 0.5 + ww * 0.27), ground + wn.y + (wn.arch ? ww / 4 : 0), wn.shutters);
        if (wn.sill_box) F.box(0.25, 0.06, ww + 0.2, 0.12, wv, ground + wn.y - wh / 2 - 0.05, wn.frame || '#f4f3ee');
      }
    }
    for (const pr of S.props || []) {   // what stands out front
      const F = frameOf(pr.wall || S.wall || 'west'), pv = F.at(pr.at), pu = +pr.out || 0.6;
      if (pr.kind === 'ice_chest') {
        F.box(0.8, 1.15, 1.9, pu, pv, ground + 0.6, pr.colour || '#2f5fae');
        F.box(0.82, 0.08, 1.92, pu, pv, ground + 1.2, '#e9eef5');
        F.face(paintCanvas({ text: ['ARCTIC GLACIER', 'PREMIUM ICE'], sizes: [1, 0.55], bg: pr.colour || '#2f5fae', fg: '#ffffff' }, 1.4, 0.45), 1.4, 0.45, pu + 0.41, pv, ground + 0.5);
      } else if (pr.kind === 'picnic_table') {
        const c = pr.colour || '#3b3633', L = +pr.length || 1.8;
        F.box(0.75, 0.05, L, pu, pv, ground + 0.74, c);
        for (const sd of [-1, 1]) { F.box(0.28, 0.05, L, pu + sd * 0.58, pv, ground + 0.45, c); F.box(0.06, 0.74, 0.06, pu + sd * 0.25, pv - L / 2 + 0.2, ground + 0.37, c); F.box(0.06, 0.74, 0.06, pu + sd * 0.25, pv + L / 2 - 0.2, ground + 0.37, c); }
      } else if (pr.kind === 'planter_box') {
        const s2 = +pr.size || 0.7; F.box(s2, s2 * 0.85, s2, pu, pv, ground + s2 * 0.43, pr.colour || '#1c1c1c');
        if (pr.plant === 'cypress') F.geo(new THREE.ConeGeometry(0.3, +pr.plant_h || 1.4, 9), pu, pv, ground + s2 * 0.85 + (+pr.plant_h || 1.4) / 2, pr.plant_colour || '#c9b54a');
      } else if (pr.kind === 'pot') {
        F.geo(new THREE.CylinderGeometry(0.26, 0.2, 0.55, 14), pu, pv, ground + 0.28, pr.colour || '#f1f0ec');
        F.geo(new THREE.IcosahedronGeometry(0.22, 1).scale(1, 0.6, 1), pu, pv, ground + 0.62, '#5e8a3e');
        for (let k = 0; k < 6; k++) F.geo(new THREE.IcosahedronGeometry(0.05, 0), pu + Math.cos(k) * 0.13, pv + Math.sin(k) * 0.13, ground + 0.7, pr.flowers || '#d9475a');
      }
    }
  }
  if (parts.length) { const m = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65 })); m.castShadow = m.receiveShadow = true; scene.add(m); }
  if (lit.length) {   // shop glass and lamps: dark by day, warm after dusk
    const gm = new THREE.MeshStandardMaterial({ color: '#1f2428', roughness: 0.12, metalness: 0.4, emissive: new THREE.Color('#ffd49a'), emissiveIntensity: 0 });
    const gl = new THREE.Mesh(mergeGeometries(lit), gm); gl.onBeforeRender = () => { gm.emissiveIntensity = Math.min(1, NIGHT.value) * 1.2; }; scene.add(gl);
  }
  return list.length;
}

// A CLAY TILE ROOF, MODELLED (2026-11-02, Dan: "after getting the roof tile well modeled"): a hipped or
// half-hipped roof over a rectangle, every course of barrel tiles laid down each slope as its own
// short barrels, each tile a little its own colour (the reds, browns and the odd mossy one of an old
// Portland tile roof), hips and ridge capped. A fan dormer can sit in the front slope.
function touchTileRoofs() {
  const list = TOUCHES.filter((t) => t.kind === 'tileroof' && t.tileroof && Array.isArray(t.xy));
  if (!list.length) return 0;
  const parts = [], lit = [], col = new THREE.Color(), up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion();
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const tint = (g, colour, into) => { g = g.index ? g.toNonIndexed() : g; if (g.attributes.uv) g.deleteAttribute('uv'); col.set(colour);
    const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3)); (into || parts).push(g); };
  let W = (x, h, y) => new THREE.Vector3(x, h, -y);   // plan (x, y) and a height, to the world (each roof sets its own, below)
  const rod = (a, b, r, colour, segs) => { const d = new THREE.Vector3().subVectors(b, a), L = d.length(); if (L < 0.02) return;
    const g = new THREE.CylinderGeometry(r, r, L, segs || 6, 1, true); q.setFromUnitVectors(up, d.clone().normalize()); g.applyQuaternion(q);
    const m = a.clone().add(b).multiplyScalar(0.5); tint(g.translate(m.x, m.y, m.z), colour); };
  for (const t of list) {
    // a roof works in its own frame, ridge along its x; axis 'ns' turns that frame a quarter turn, so the
    // east end of the frame faces north (a cross gable facing the street, 2026-11-02)
    const R = t.tileroof, ns = R.axis === 'ns', [cx, cy] = t.xy, [sw, sd] = R.size_m || [10, 10], w = ns ? sd : sw, d = ns ? sw : sd, o = +R.overhang || 0.4;
    W = ns ? (x, h, y) => new THREE.Vector3(cx - (y - cy), h, -(cy + (x - cx))) : (x, h, y) => new THREE.Vector3(x, h, -y);
    let ground = sampleHeight(cx, cy); for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) ground = Math.min(ground, sampleHeight(cx + dx * w / 2, cy + dy * d / 2));
    const eave = ground + (+R.eave || 4), ridge = ground + (+R.ridge || 9);
    const pal = R.palette || ['#9a5a43', '#8a4e3a', '#a4664a', '#7d4b3a', '#93573f', '#b0704f', '#6f4636'], moss = R.moss || ['#6f6a4a', '#7a7356'];
    // the roof in its own plan frame: ridge along x (east-west); hips at the ends named in hips
    const x0 = cx - w / 2 - o, x1 = cx + w / 2 + o, y0 = cy - d / 2 - o, y1 = cy + d / 2 + o, ym = (y0 + y1) / 2, run = (y1 - y0) / 2;
    const k = (ridge - eave) / (run - o), eo = eave - o * k;   // rise per metre of run, and the eave's height at the overhang's edge
    const hips = R.hips || ['west', 'east'], rx0 = hips.includes('west') ? x0 + run : x0, rx1 = hips.includes('east') ? x1 - run : x1;
    const facets = [   // plan polygons (x, y) with their height function
      { pts: [[x0, y1], [x1, y1], [rx1, ym], [rx0, ym]], fall: [0, 1] },    // north (front)
      { pts: [[x1, y0], [x0, y0], [rx0, ym], [rx1, ym]], fall: [0, -1] },   // south
    ];
    if (hips.includes('west')) facets.push({ pts: [[x0, y0], [x0, y1], [rx0, ym]], fall: [-1, 0] });
    if (hips.includes('east')) facets.push({ pts: [[x1, y1], [x1, y0], [rx1, ym]], fall: [1, 0] });
    const hAt = (x, y) => ridge - Math.max(Math.abs(y - ym), hips.includes('west') && x < rx0 ? rx0 - x : 0, hips.includes('east') && x > rx1 ? x - rx1 : 0) * k;
    for (const F of facets) {
      // the underlayer, dark, so the gaps between the barrels read
      const P = F.pts.map(([x, y]) => W(x, hAt(x, y) - 0.03, y)), g = new THREE.BufferGeometry();
      const v = []; for (let i = 1; i < P.length - 1; i++) v.push(...P[0].toArray(), ...P[i].toArray(), ...P[i + 1].toArray());
      g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals();
      tint(g, R.under || '#4e3026');
      // the barrels: rows from the eave edge up the fall line until they leave the facet
      const [fx, fy] = F.fall, inside = (x, y) => { let c = false; for (let i = 0, j = F.pts.length - 1; i < F.pts.length; j = i++) { const [xi, yi] = F.pts[i], [xj, yj] = F.pts[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
      const [ea, eb] = [F.pts[0], F.pts[1]], elen = Math.hypot(eb[0] - ea[0], eb[1] - ea[1]), ex = (eb[0] - ea[0]) / elen, ey = (eb[1] - ea[1]) / elen;
      const pitch = +R.barrel_m || 0.24, course = +R.course_m || 0.38;
      for (let s2 = pitch / 2; s2 < elen; s2 += pitch) {
        const px = ea[0] + ex * s2, py = ea[1] + ey * s2;
        for (let r = 0.01; ; r += course) {
          const ax = px - fx * r, ay = py - fy * r, bx = px - fx * (r + course - 0.03), by = py - fy * (r + course - 0.03);
          if (!inside(ax - fx * 0.01, ay - fy * 0.01) || !inside(bx, by)) break;
          const u = rnd(), c = u < 0.06 ? moss[Math.floor(rnd() * moss.length)] : pal[Math.floor(rnd() * pal.length)];
          rod(W(ax, hAt(ax, ay) + 0.035, ay), W(bx, hAt(bx, by) + 0.035, by), 0.075, c);
        }
      }
    }
    // the ridge and the hips, capped
    const cap = R.cap || '#7a4434';
    rod(W(rx0, ridge + 0.06, ym), W(rx1, ridge + 0.06, ym), 0.12, cap, 8);
    for (const [hx, ex2] of [[rx0, x0], [rx1, x1]]) if ((hx === rx0 && hips.includes('west')) || (hx === rx1 && hips.includes('east')))
      for (const ey2 of [y0, y1]) rod(W(hx, ridge + 0.06, ym), W(ex2, eo + 0.06, ey2), 0.11, cap, 8);
    // a gable end where there is no hip, in the wall's colour
    for (const [has, gx] of [[hips.includes('west'), x0 + o], [hips.includes('east'), x1 - o]]) if (!has) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([...W(gx, eave, y0 + o).toArray(), ...W(gx, eave, y1 - o).toArray(), ...W(gx, ridge, ym).toArray()], 3)); g.computeVertexNormals();
      tint(g, R.gable || '#f3f1ea');
      if (R.rake) for (const ey of [y0, y1]) rod(W(gx + (gx > cx ? 0.12 : -0.12), eo + 0.02, ey), W(gx + (gx > cx ? 0.12 : -0.12), ridge + 0.1, ym), 0.1, R.rake, 4);   // the dark rake boards
    }
    // the gutter along the front
    rod(W(x0, eo - 0.05, y1), W(x1, eo - 0.05, y1), 0.06, R.gutter || '#f3f1ea', 8);
    // a fan dormer in the front slope: a half-round window under a curved tile hood
    const course = +R.course_m || 0.38;
    for (const D of R.dormers || []) {
      const dx = x0 + o + (w * (+D.at || 0.5)), r = +D.r || 1.3, sb = +D.setback || 1.4, fyw = y1 - o - sb, base = eave + sb * k + (+D.lift || 0.15);
      const semi = (rr, depth) => new THREE.ExtrudeGeometry(new THREE.Shape().absarc(0, 0, rr, 0, Math.PI, false), { depth, bevelEnabled: false, curveSegments: 22 });
      // the hood: a half-cylinder of tile running back into the roof
      for (let a2 = 0; a2 < 14; a2++) {
        const th0 = a2 / 14 * Math.PI, th1 = (a2 + 1) / 14 * Math.PI, rr = r + 0.28;
        for (let z = 0; z < 3.2; z += course) {
          const c = pal[Math.floor(rnd() * pal.length)];
          const p0 = W(dx + Math.cos((th0 + th1) / 2) * rr, base + Math.sin((th0 + th1) / 2) * rr, fyw + 0.2 - z), p1 = W(dx + Math.cos((th0 + th1) / 2) * rr, base + Math.sin((th0 + th1) / 2) * rr, fyw + 0.2 - z - course + 0.03);
          rod(p0, p1, 0.07, c);
        }
      }
      tint(semi(r + 0.22, 3.2).translate(dx, base, -fyw), R.under || '#4e3026');   // the hood's body, back into the roof
      const band = new THREE.Shape().absarc(0, 0, r + 0.3, 0, Math.PI, false); band.lineTo(-r, 0); band.holes.push(new THREE.Path().absarc(0, 0, r, Math.PI, 0, true));
      tint(new THREE.ExtrudeGeometry(band, { depth: 0.1, bevelEnabled: false, curveSegments: 22 }).translate(dx, base, -fyw - 0.06), R.gable || '#f3f1ea');   // the white face round the window
      tint(semi(r, 0.03).translate(dx, base, -fyw - 0.02), '#ffffff', lit);                            // the glass
      const ring = new THREE.Shape().absarc(0, 0, r + 0.1, 0, Math.PI, false); ring.lineTo(-r, 0); ring.holes.push(new THREE.Path().absarc(0, 0, r, Math.PI, 0, true));
      tint(new THREE.ExtrudeGeometry(ring, { depth: 0.1, bevelEnabled: false, curveSegments: 22 }).translate(dx, base, -fyw - 0.1), D.frame || '#1c1c1c');
      for (let k2 = 1; k2 < 8; k2++) { const a3 = k2 * Math.PI / 8; tint(new THREE.BoxGeometry(0.035, r, 0.03).translate(0, r / 2, 0).rotateZ(a3 - Math.PI / 2).translate(dx, base, -fyw - 0.12), D.bars || '#f4f3ee'); }
      tint(new THREE.BoxGeometry(2 * r, 0.05, 0.03).translate(dx, base + 0.03, -fyw - 0.12), D.bars || '#f4f3ee');
      tint(new THREE.TorusGeometry(r * 0.32, 0.025, 6, 16, Math.PI).translate(dx, base, -fyw - 0.13), D.bars || '#f4f3ee');   // the small inner arc of a fan light
    }
  }
  if (parts.length) { const m = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, side: THREE.DoubleSide })); m.castShadow = m.receiveShadow = true; scene.add(m); }
  if (lit.length) { const gm = new THREE.MeshStandardMaterial({ color: '#1f2428', roughness: 0.12, metalness: 0.4, emissive: new THREE.Color('#ffd49a'), emissiveIntensity: 0 });
    const gl = new THREE.Mesh(mergeGeometries(lit), gm); gl.onBeforeRender = () => { gm.emissiveIntensity = Math.min(1, NIGHT.value) * 1.2; }; scene.add(gl); }
  return list.length;
}
function cityVehicles() {
  // a member's own car (a vehicle touch) stands where they park it, in its exact colour
  const own = TOUCHES.filter((t) => t.kind === 'vehicle' && t.vehicle && Array.isArray(t.xy)).map((t) => ({ at: t.xy, yaw: +t.vehicle.yaw || 0, colour: t.vehicle.colour || '#a01c28', kind: t.vehicle.model || 'car', exact: true, len: (VEHICLE[t.vehicle.model] || VEHICLE.car).L, wid: (VEHICLE[t.vehicle.model] || VEHICLE.car).W }));
  const list = (Array.isArray(meta.vehicles) ? meta.vehicles : []).concat(own);
  if (!list.length) return 0;
  const byKind = {};
  for (const v of list) (byKind[v.kind] = byKind[v.kind] || []).push(v);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
  for (const [kind, vs] of Object.entries(byKind)) {
    const im = new THREE.InstancedMesh(vehicleGeometry(kind), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.35 }), vs.length);
    vs.forEach((v, i) => {
      // the photo's colour of a car is lit from above and a little washed out: deepen it a touch
      col.set(v.colour); const hsl = {}; col.getHSL(hsl); if (!v.exact) col.setHSL(hsl.h, Math.min(1, hsl.s * 1.25), Math.max(0.06, Math.min(0.9, hsl.l * 0.92)));
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
    if (r.replaces) for (let i = plan.length - 1; i >= 0; i--) if (Math.hypot(plan[i].x - t.xy[0], plan[i].y - t.xy[1]) < r.replaces) plan.splice(i, 1);   // the surveyed tree this one really is
    plan.push({ x: t.xy[0], y: t.xy[1], g: sampleHeight(t.xy[0], t.xy[1]), h: r.height_m || 9, sp, rot: hash1(t.xy[0], t.xy[1]) * 6.283, wide: r.wide || 1, tint: 0.5, own: r });
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
    if ((touchOn(PAINTS, b) || {}).remove) continue;   // a building the member says is not there (2026-11-01)
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
    const PT = touchOn(PAINTS, b) || {};
    const wallFlag = touchOn(WINDOWED, b) ? 2 : 1;   // 2: a wall whose windows are placed by hand, so the shader draws none
    try { wc.set(PT.wall || b.wall || (ownWalls ? ownWalls[Math.floor(seed * ownWalls.length)] : PAL[style][Math.floor(seed * PAL[style].length)])); } catch (_) { wc.set(PAL[style][0]); }
    try { rc.set(PT.roof || b.roof || (ownRoofs ? ownRoofs[Math.floor(hash1(seed * 7) * ownRoofs.length)] : '#6d7176')); } catch (_) { rc.set('#6d7176'); }
    if (!b.roof && !ownRoofs) rc.multiplyScalar(0.8 + 0.35 * hash1(seed * 91));
    // a building that knows its own eave (the city's laser survey: average and peak height) pitches to its real ridge
    const pitched = b.roof_form === 'flat' ? false : (b.roof_form === 'pitched' || ST.roof_form === 'pitched') && style === 0 && h < 14 && (b.force_pitch || Math.abs(A) < 1200);
    const roofH = !pitched ? 0 : b.eave ? THREE.MathUtils.clamp(h - b.eave, 0.8, 6) : Math.min(3.6, Math.max(1.5, Math.sqrt(Math.abs(A)) * 0.24)), wallTop = top - roofH;
    wc.multiplyScalar(0.92 + 0.16 * hash1(seed * 13));
    const rec = { id: b.id, pts, h, base, top, c: [cx, cy], style, seed, name: b.name, edges: [] };
    const T = b.id && touchOn(FACADES, b);
    const G = T ? (own.get(T.id) || own.set(T.id, { T, P: [], N: [], UV: [], rings: [] }).get(T.id)) : null;
    if (G) G.rings.push(rec);
    let u = 0;
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
      if (L < 0.05) continue;
      const nx = dy / L, nz = dx / L;   // outward, in world x and z
      const quad = [[ax, base, -ay, u, 0], [bx, base, -by, u + L, 0], [bx, wallTop, -by, u + L, wallTop - base], [ax, base, -ay, u, 0], [bx, wallTop, -by, u + L, wallTop - base], [ax, wallTop, -ay, u, wallTop - base]];
      for (const [x, y, z, uu, vv] of quad) { if (G) { G.P.push(x, y, z); G.N.push(nx, 0, nz); G.UV.push(uu, vv); continue; } P.push(x, y, z); N.push(nx, 0, nz); C.push(wc.r, wc.g, wc.b); UV.push(uu, vv); B.push(pitched ? sidingCode(PT.siding || b.siding) : style, seed, wallFlag); }
      rec.edges.push({ a: [ax, ay], b: [bx, by], L, n: [dy / L, -dx / L], used: 0 });
      u += L;
    }
    const shape = PT.roof_shape || b.roof_shape;
    if (pitched && shape === 'gable' && !G) {
      // A GABLE ROOF (2026-11-01, Dan's street view: the bungalow's gable faces the street)
      const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
      let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const ns = (PT.ridge || b.ridge) === 'ns';
      // work in a frame where the ridge runs along a (east-west by default)
      const toW = ns ? ([a, c]) => [c, a] : ([a, c]) => [a, c];
      const [a0, a1, c0, c1] = ns ? [y0, y1, x0, x1] : [x0, x1, y0, y1];
      const o = 0.45, half = (c1 - c0) / 2, cm = (c0 + c1) / 2, drop = roofH * o / half;
      const tri = (A, Bq, Cq, col, wallish, uvs) => {
        const v = [A, Bq, Cq], e1 = new THREE.Vector3(Bq[0] - A[0], Bq[1] - A[1], Bq[2] - A[2]), e2 = new THREE.Vector3(Cq[0] - A[0], Cq[1] - A[1], Cq[2] - A[2]);
        const n = new THREE.Vector3().crossVectors(e1, e2).normalize();
        const out = wallish ? wallish : null;
        if ((out && n.x * out[0] + n.z * out[1] < 0) || (!out && n.y < 0)) { v.reverse(); n.negate(); if (uvs) uvs.reverse(); }
        v.forEach((q, i) => { P.push(...q); N.push(n.x, n.y, n.z); C.push(col.r, col.g, col.b); UV.push(...(uvs ? uvs[i] : [q[0], -q[2]])); B.push(wallish ? sidingCode(PT.siding || b.siding) : style, seed, wallish ? wallFlag : 0); });
      };
      const W3 = (a, c, y) => { const [x, yy] = toW([a, c]); return [x, y, -yy]; };
      for (const side of [-1, 1]) {   // the two slopes
        const ce = side < 0 ? c0 - o : c1 + o, R0 = W3(a0 - o, cm, top), R1 = W3(a1 + o, cm, top), E0 = W3(a0 - o, ce, wallTop - drop), E1 = W3(a1 + o, ce, wallTop - drop);
        tri(R0, R1, E1, rc, null); tri(R0, E1, E0, rc, null);
      }
      for (const end of [a0, a1]) {   // the gable ends, siding up to the ridge
        const outN = toW([end === a0 ? -1 : 1, 0]), out = [outN[0], -outN[1]];
        tri(W3(end, c0, wallTop), W3(end, c1, wallTop), W3(end, cm, top), wc, out, [[0, wallTop - base], [c1 - c0, wallTop - base], [half, top - base]]);
      }
      BLD.push(rec);
      continue;
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
        if (vB.z < 0.5 || vB.z > 1.5) return vec3(0.0);
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
          if (vB.x < 3.3) diffuseColor.rgb *= 1.0 - 0.13 * smoothstep(0.0, 0.18, fract(vUV.y / 0.2)) * (1.0 - smoothstep(0.18, 0.3, fract(vUV.y / 0.2)));   // the shadow line under each board
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.76, 0.71), trim * 0.85);
          diffuseColor.rgb *= 1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.5, vUV.y));   // the foundation, darker at the foot
          if (vB.x > 4.0) diffuseColor.rgb *= 1.0 - 0.15 * step(0.86, fract(vUV.x / 0.42)) * (1.0 - W.x);   // BOARD AND BATTEN (Great Spirit UMC, 2026-11-02): a batten every 42 cm
          if (vB.x > 3.5 && vB.x < 4.0) {   // SHINGLES (2026-11-01, Dan's street view): the gaps between shingles, staggered row to row
            float row = floor(vUV.y / 0.2), jx = fract((vUV.x + hb(vec2(row, 7.0)) * 0.4) / (0.2 + 0.1 * hb(vec2(row, 3.0))));
            diffuseColor.rgb *= 1.0 - 0.16 * step(0.9, jx) * (1.0 - W.x);
          }
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

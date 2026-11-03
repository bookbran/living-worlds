// ══ HAPPENS HERE (2026-11-01, Dan: "a special event button like for this kind of event in all living
// worlds, that simulates that event happening, so here it's the crows, other places it might be a
// sporting event with crowd roar and people, or migrations of other birds ... and the agent would
// suggest what it'd be based on the map location"). A profile's events, each a button in the panel
// that sets the time, takes you to watch, and plays it. Kinds the page can play:
//   roost      { species, count, hours: [from, to], toward: [lon, lat] }          birds gather, then stream to a roost
//   migration  { species, skeins, birds, heading_deg | toward, altitude_m, hours } V formations cross the sky
//   crowd      { place | at: [lon, lat], radius_m, count, colours, hours, duration_s }  a crowd fills a place and roars
// The agent studying a place writes them (living-world skill, "Happens here").
const EVENTS = (() => {
  const list = Array.isArray(PROFILE.events) ? PROFILE.events.filter((e) => e && e.kind) : [];
  if (PROFILE.roost && !list.some((e) => e.kind === 'roost')) list.unshift({ kind: 'roost', title: 'Crows go to roost', ...PROFILE.roost });
  return list;
})();
const toLocal = ([lon, lat]) => { const [lon0, lat0] = meta.centre_lonlat; return [(lon - lon0) * 111320 * Math.cos(lat0 * Math.PI / 180), (lat - lat0) * 110570]; };
const headingVec = (e) => {
  if (e.toward) { const [x, y] = toLocal(e.toward); return new THREE.Vector2(x, y).normalize(); }
  const a = (e.heading_deg ?? 200) * Math.PI / 180; return new THREE.Vector2(Math.sin(a), Math.cos(a));   // compass degrees: 0 north, 90 east
};
const EV = { active: null, mig: null, crowd: null };
function setEventHour(e) { if (!e.hours) return; if (typeof setFollowNow === 'function') setFollowNow(false); tod.value = e.hours[0] + 0.05; setSun(Number(tod.value)); }
function playEvent(e) {
  setEventHour(e);
  // a press opens the evening partway in, at real speed (2026-11-01, Dan: "in regular time but in a way that is
  // immediately rewarding"): half the flock already in the firs and more arriving, the swirl within
  // about half a minute, the streams joining and the flight downtown a minute after that
  if (e.kind === 'roost' && ROOST) { watchRoost(); ROOST.clock = 52; ROOST.speed = 1; }
  else if (e.kind === 'migration') startMigration(e);
  else if (e.kind === 'crowd') startCrowd(e);
  EV.active = e;
  if (!SOUND.on) soundOn().then(() => { document.getElementById('sound').textContent = 'Listening… (press to quiet)'; document.getElementById('mix').classList.add('on'); });
}
// ── migration: skeins in V formation crossing the sky, calling ──
function startMigration(e) {
  if (EV.mig) { scene.remove(EV.mig.im); EV.mig = null; }
  const info = BIRDS.find((b) => new RegExp(e.species || 'goose', 'i').test(b.name)) ||
    { name: e.species || 'Cackling Goose', wingspan: e.wingspan_m || 1.3, colour: '#4a4038', plumage: { back: '#5c4e40', belly: '#b9ad9c', head: '#141414', wing: '#4f4336', underwing: '#6b5d4e', tail: '#1c1c1c', beak: '#141414' } };
  const dir = headingVec(e), perp = new THREE.Vector2(-dir.y, dir.x), skeins = Math.min(8, e.skeins || 4), per = Math.min(40, e.birds || 24), n = skeins * per;
  const im = new THREE.InstancedMesh(flyingBird(info), living(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }), false), n);
  im.frustumCulled = false; scene.add(im);
  const c = controls.target, base = sampleHeight(c.x, -c.z), alt = e.altitude_m || 140;
  // a press: the skeins come over within a minute, at a goose's real cruising speed
  const sk = Array.from({ length: skeins }, (_, k) => ({ off: (k - (skeins - 1) / 2) * (90 + rand() * 60), start: k * (3 + rand() * 5), alt: alt + (rand() - 0.5) * 40, rows: per, spd: 19 + rand() * 4 }));
  EV.mig = { e, info, im, dir, perp, sk, per, t: 0, origin: new THREE.Vector2(c.x, -c.z), base, s: info.wingspan / 2, nextCall: 0 };
  // stand under the flight line, looking up toward where they come from
  const C = new THREE.Vector3(c.x, base + 2, c.z);
  fly = { t: 0, p0: camera.position.clone(), t0: controls.target.clone(), p1: C.clone().add(new THREE.Vector3(perp.x * 60, 0, -perp.y * 60)), t1: C.clone().add(new THREE.Vector3(-dir.x * 400, alt * 0.8, dir.y * 400)) };
}
const evP = new THREE.Vector3(), evQ = new THREE.Quaternion(), evM = new THREE.Matrix4(), evZ = new THREE.Matrix4().makeScale(0, 0, 0);
function migrationTick(dt) {
  const M = EV.mig; if (!M) return;
  M.t += dt; let alive = 0;
  M.sk.forEach((k, si) => {
    const run = (M.t - k.start) * k.spd - 700;
    for (let r = 0; r < M.per; r++) {
      const i = si * M.per + r;
      if (M.t < k.start || run > 900) { M.im.setMatrixAt(i, evZ); continue; }
      alive++;
      const rank = Math.ceil(r / 2), side = r === 0 ? 0 : (r % 2 ? 1 : -1), sp = 2.6 * M.s * 2;
      const along = run - rank * sp * 0.9, across = k.off + side * rank * sp * 0.8;
      const x = M.origin.x + M.dir.x * along + M.perp.x * across, y = M.origin.y + M.dir.y * along + M.perp.y * across;
      evP.set(x, M.base + k.alt + Math.sin(M.t * 0.6 + r) * 0.8, -y);
      evQ.setFromAxisAngle(birdUp, Math.atan2(M.dir.x, -M.dir.y));
      evM.compose(evP, evQ, birdS.set(M.s, M.s, M.s)); M.im.setMatrixAt(i, evM);
    }
  });
  M.im.instanceMatrix.needsUpdate = true;
  if (SOUND.on && SOUND.ctx && M.t > M.nextCall && alive) {   // their calls overhead
    const k = M.sk[Math.floor(Math.random() * M.sk.length)], run = (M.t - k.start) * k.spd - 700;
    evP.set(M.origin.x + M.dir.x * run + M.perp.x * k.off, M.base + k.alt, -(M.origin.y + M.dir.y * run + M.perp.y * k.off));
    if (SOUND.buf[M.info.name]) voice(M.info.name, evP, 60); else honk(evP);
    M.nextCall = M.t + 0.4 + Math.random() * 0.9;
  }
  if (!alive && M.t > 30) { scene.remove(M.im); EV.mig = null; }
}
function honk(at) {   // a goose's call, when no recording of the bird is to hand
  const ctx = SOUND.ctx, o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), p = ctx.createPanner();
  Object.assign(p, { distanceModel: 'inverse', refDistance: 60, rolloffFactor: 1, maxDistance: 6000 }); p.positionX.value = at.x; p.positionY.value = at.y; p.positionZ.value = at.z;
  o.type = 'sawtooth'; const f0 = 380 + Math.random() * 160, t = ctx.currentTime; o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * 1.25, t + 0.12); o.frequency.linearRampToValueAtTime(f0 * 0.9, t + 0.22);
  f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.2;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.25, t + 0.02); g.gain.linearRampToValueAtTime(0, t + 0.24);
  o.connect(f).connect(g).connect(p).connect(SOUND.layers.birds || SOUND.master); o.start(t); o.stop(t + 0.3);
}
// ── crowd: people fill a place, and its roar swells ──
function startCrowd(e) {
  if (EV.crowd) { scene.remove(EV.crowd.im); try { EV.crowd.src.stop(); } catch (_) {} EV.crowd = null; }
  const pl = e.place ? (typeof PLACES !== 'undefined' ? PLACES : []).find((p) => p.name === e.place) : null;
  const xy = pl ? pl.xy : e.at ? toLocal(e.at) : [controls.target.x, -controls.target.z];
  const R = e.radius_m || 45, n = Math.min(900, e.count || 500), g0 = sampleHeight(xy[0], xy[1]);
  const body = new THREE.CapsuleGeometry(0.21, 1.15, 3, 6).translate(0, 0.79, 0), head = new THREE.SphereGeometry(0.12, 8, 6).translate(0, 1.6, 0.02);
  const im = new THREE.InstancedMesh(mergeGeometries([body, head].map((q) => { q.deleteAttribute('uv'); return q.index ? q.toNonIndexed() : q; })), new THREE.MeshStandardMaterial({ roughness: 0.85 }), n);
  const cols = (e.colours && e.colours.length ? e.colours : ['#15161a', '#2d3240', '#6d6a63', '#e8e4dc', '#8a1f24', '#1e2a44', '#c9b48a']).map((h) => new THREE.Color(h));
  const ppl = Array.from({ length: n }, (_, i) => { const a = rand() * 6.283, r = Math.sqrt(rand()) * R; im.setColorAt(i, cols[i % cols.length]); return { x: xy[0] + Math.cos(a) * r, y: xy[1] + Math.sin(a) * r, tx: 0, ty: 0, ph: rand() * 6.283, rest: rand() * 4 }; });
  ppl.forEach((p) => { p.tx = p.x; p.ty = p.y; });
  im.frustumCulled = false; im.castShadow = true; scene.add(im);
  let src = null, gain = null;
  if (SOUND.ctx) {   // the roar: a crowd's broad noise, swelling now and then into a cheer
    const ctx = SOUND.ctx, len = ctx.sampleRate * 3, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let l = 0; for (let k = 0; k < len; k++) { l = 0.96 * l + 0.04 * (Math.random() * 2 - 1); d[k] = l * 5 + (Math.random() * 2 - 1) * 0.2; }
    src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 800; bp.Q.value = 0.5;
    gain = ctx.createGain(); gain.gain.value = 0.4;
    const p = ctx.createPanner(); Object.assign(p, { distanceModel: 'inverse', refDistance: R, rolloffFactor: 1, maxDistance: 8000 }); p.positionX.value = xy[0]; p.positionY.value = g0 + 3; p.positionZ.value = -xy[1];
    src.connect(bp).connect(gain).connect(p).connect(SOUND.layers.crowd || SOUND.layers.people || SOUND.master); src.start();
  }
  EV.crowd = { e, im, ppl, xy, R, g0, t: 0, dur: e.duration_s || 60, src, gain, nextCheer: 3 };   // a press: about a minute, then they drift home
  const C = new THREE.Vector3(xy[0], g0, -xy[1]);
  fly = { t: 0, p0: camera.position.clone(), t0: controls.target.clone(), p1: C.clone().add(new THREE.Vector3(R * 1.3, Math.max(14, R * 0.5), R * 1.3)), t1: C.clone().add(new THREE.Vector3(0, 2, 0)) };
}
function crowdTick(dt, time) {
  const Q = EV.crowd; if (!Q) return;
  Q.t += dt;
  const leaving = Q.t > Q.dur, cheer = Q.t > Q.nextCheer && Q.t < Q.nextCheer + 2.5;
  if (Q.t > Q.nextCheer + 2.5) Q.nextCheer = Q.t + 6 + Math.random() * 14;
  if (Q.gain && SOUND.ctx) Q.gain.gain.setTargetAtTime(leaving ? 0 : cheer ? 1.1 : 0.4, SOUND.ctx.currentTime, cheer ? 0.25 : 0.8);
  let gone = 0;
  Q.ppl.forEach((p, i) => {
    if (leaving) { const a = Math.atan2(p.y - Q.xy[1], p.x - Q.xy[0]); p.tx = p.x + Math.cos(a) * 40; p.ty = p.y + Math.sin(a) * 40; }
    const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
    if (d < 0.3 && !leaving) { p.rest -= dt; if (p.rest < 0) { const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * Q.R; p.tx = Q.xy[0] + Math.cos(a) * r; p.ty = Q.xy[1] + Math.sin(a) * r; p.rest = 2 + Math.random() * 8; } }
    else if (d >= 0.3) { const st = Math.min(d, 1.3 * dt); p.x += dx / d * st; p.y += dy / d * st; }
    if (leaving && Math.hypot(p.x - Q.xy[0], p.y - Q.xy[1]) > Q.R + 35) { Q.im.setMatrixAt(i, evZ); gone++; return; }
    const jump = cheer ? Math.max(0, Math.sin(time * 9 + p.ph)) * 0.25 : 0;
    evM.compose(evP.set(p.x, Q.g0 + jump, -p.y), evQ.setFromAxisAngle(birdUp, p.ph), birdS.set(1, 1, 1)); Q.im.setMatrixAt(i, evM);
  });
  Q.im.instanceMatrix.needsUpdate = true;
  if (leaving && gone >= Q.ppl.length) { scene.remove(Q.im); try { Q.src && Q.src.stop(); } catch (_) {} EV.crowd = null; }
}
function eventsTick(dt, time) { migrationTick(dt); crowdTick(dt, time); }
function eventsHtml(esc) {
  if (!EVENTS.length) return '';
  const when = (e) => e.hours ? (' · ' + [e.hours[0], e.hours[1]].map((h) => { const hh = Math.floor(h), mm = Math.round((h - hh) * 60); return (hh % 12 || 12) + ':' + String(mm).padStart(2, '0') + (hh < 12 ? 'a' : 'p'); }).join(' to ')) : '';
  // each with a fitting open-licence photo of its kind of event (2026-11-01, event_photos.py), credited below
  const credits = EVENTS.filter((e) => e.img && e.img_credit).map((e) => '<a href="' + esc(e.img_credit.url) + '" target="_blank" rel="noopener">' + esc(e.title) + '</a> (' + esc(e.img_credit.licence || 'Commons') + ')');
  return '<div class="set events"><b>Happens here · press one to watch it</b>' + EVENTS.map((e, i) =>
    '<button type="button" class="event' + (e.img ? ' has-ph' : '') + '" data-i="' + i + '">' + (e.img ? '<span class="ep" style="background-image:url(&quot;' + fileUrl(e.img) + '&quot;)"></span>' : '') +
    '<span class="etx"><span class="et">' + esc(e.title || e.kind) + '</span><span class="ew">' + esc((e.blurb || '') + when(e)) + '</span></span></button>').join('') +
    (credits.length ? '<div class="credit">photos, Wikimedia Commons: ' + credits.join(' · ') + '</div>' : '') + '</div>';
}

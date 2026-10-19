import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut, reauthenticateWithCredential, EmailAuthProvider, verifyBeforeUpdateEmail, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";
import { ref, get, onValue, set, update, remove } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js";
const $ = id => document.getElementById(id);
const LOW = 20, RANGE = 1000, digits = s => s.replace(/\D/g, "");
// Tag de demonstração: ao cadastrar uma tag com este ID, ela é posicionada no endereço abaixo.
const DEMO_ID = "gabigolis", DEMO_ADDR = "Colégio São José, Limeira, SP, Brasil", DEFAULT = { lat: -22.5645, lng: -47.4017 };
let user, uid, data = {}, loaded = false, me = null, ipInfo = null, sel = "me", brModal, tagModal, synced = false, curSrc = "";
let gps = null, gpsDenied = false, search = null, lastKey = "", pushT, flashT, geoCache;

onAuthStateChanged(auth, u => {
  if (!u) return location.replace("auth.html");
  user = u; uid = u.uid;
  brModal = new bootstrap.Modal($("m-br")); tagModal = new bootstrap.Modal($("m-tag"));
  onValue(ref(db, "users/" + uid), s => { data = s.val() || {}; loaded = true; render(); syncEmail(); });
  locateByIP(); locateByGPS();
});
$("gps").onclick = locateByGPS;
$("out").onclick = () => signOut(auth);

// Localização aproximada da máquina pelo endereço IP (precisão de cidade/bairro).
async function locateByIP() {
  const tries = [
    async () => { const j = await (await fetch("https://ipwho.is/")).json(); if (!j.success) throw 0; return { ip: j.ip, city: j.city, region: j.region_code || j.region, lat: j.latitude, lng: j.longitude }; },
    async () => { const j = await (await fetch("https://ipapi.co/json/")).json(); if (j.error) throw 0; return { ip: j.ip, city: j.city, region: j.region_code, lat: j.latitude, lng: j.longitude }; }
  ];
  for (const t of tries) { try { const r = await t(); if (!gps) me = { lat: r.lat, lng: r.lng }; ipInfo = r; render(); return; } catch { /* tenta o próximo serviço */ } }
  ipInfo = { failed: true }; render();
}

// Localização exata pelo navegador (Wi-Fi/GPS). Pede permissão e, quando concedida, substitui a do IP.
function locateByGPS() {
  if (!navigator.geolocation) { gpsDenied = true; return render(); }
  navigator.geolocation.getCurrentPosition(
    p => { gps = { acc: Math.round(p.coords.accuracy) }; gpsDenied = false; me = { lat: p.coords.latitude, lng: p.coords.longitude }; render(); },
    () => { gpsDenied = true; render(); },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
}

// Converte um endereço em coordenadas (OpenStreetMap/Nominatim) para calcular distâncias.
async function geocode() {
  if (geoCache) return geoCache;
  for (const q of [DEMO_ADDR, "Colégio São José Limeira"]) {
    try { const j = await (await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=" + encodeURIComponent(q))).json();
      if (j[0]) return geoCache = { lat: +j[0].lat, lng: +j[0].lon }; } catch { /* tenta a próxima consulta */ }
  }
  return null;
}
async function demoPlace() { const g = await geocode(); return { address: DEMO_ADDR, battery: 64, lastSeen: Date.now(), ...(g || {}) }; }

// Se o e-mail foi confirmado após a troca, atualiza perfil e índice de login.
async function syncEmail() {
  const p = data.profile; if (synced || !p || !user.email || user.email.toLowerCase() === p.email) return; synced = true;
  const email = user.email.toLowerCase(), e = { email, uid };
  await update(ref(db, `users/${uid}/profile`), { email });
  await set(ref(db, "logins/user_" + p.username.toLowerCase()), e); await set(ref(db, "logins/tel_" + p.phone), e);
}

const R = x => x * Math.PI / 180;
const dist = (a, b) => { const dLa = R(b.lat - a.lat), dLo = R(b.lng - a.lng), h = Math.sin(dLa / 2) ** 2 + Math.cos(R(a.lat)) * Math.cos(R(b.lat)) * Math.sin(dLo / 2) ** 2; return 12742e3 * Math.asin(Math.sqrt(h)); };
const fmtD = m => m < 1000 ? `~${Math.round(m)} m` : `~${(m / 1000).toFixed(1)} km`;
const fmtT = t => t ? new Date(t).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "sem sinal";
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const batt = b => `<span class="bat ${b < LOW ? "low" : ""}" title="${b}%"><i style="width:${b}%"></i></span><small>${b}%</small>`;
const info = d => { const off = d.battery === 0; return { off, d: !off && me && d.lat != null ? dist(me, d) : null, last: "Último sinal: " + fmtT(d.lastSeen) }; };
function flash(t, warn) { const f = $("flash"); clearTimeout(flashT); f.textContent = t; f.classList.remove("d-none"); f.style.cssText = warn ? "background:rgba(255,92,108,.12);border-color:rgba(255,92,108,.35);color:#ffb3bb" : ""; flashT = setTimeout(() => f.classList.add("d-none"), 7000); }

function render() {
  if (!loaded) return;
  const br = data.bracelet, tags = data.tags || {}, ids = Object.keys(tags), name = data.profile?.username || "";
  if (search && !tags[search.id]) return endSearch(false);
  $("hello").textContent = name ? `Olá, ${name}` : "Olá"; $("avatar").textContent = (name[0] || "?").toUpperCase();
  $("gps").classList.toggle("d-none", !!gps);
  $("ipinfo").textContent = gps ? `Sua localização: pelo navegador (precisão de cerca de ${gps.acc} m).` : !ipInfo ? "Descobrindo sua localização pelo IP…" : ipInfo.failed ? "Não foi possível descobrir sua localização pelo IP." : `Sua localização aproximada (pelo IP ${ipInfo.ip}): ${[ipInfo.city, ipInfo.region].filter(Boolean).join(", ") || "região desconhecida"}.${gpsDenied ? " O IP costuma apontar para a sede da operadora ou da rede (por isso pode aparecer outra cidade). Permita a localização do navegador para ficar exato." : ""}`;
  if (!br?.id) { $("bracelet").innerHTML = "<p class='mb-0'>Nenhuma pulseira conectada.</p>"; $("rm-br").classList.add("d-none"); brModal.show(); }
  else { brModal.hide(); $("rm-br").classList.remove("d-none"); const s = info(br);
    $("bracelet").innerHTML = `<div class="d-flex align-items-center gap-3"><div class="flex-grow-1"><strong>${esc(br.id)}</strong><div class="small text-muted">${s.off ? "Sem bateria. " : ""}${s.last}${s.d != null ? " · " + fmtD(s.d) : ""}</div></div>${batt(br.battery ?? 0)}</div>`; }
  $("tags").innerHTML = ids.length ? ids.map(id => { const t = tags[id], s = info(t), on = search?.id === id;
    return `<div class="tag-row"><div class="info"><strong>${esc(t.name)}</strong> <span class="pill ${s.off ? "off" : ""}">${s.off ? "Sem bateria" : s.d != null ? fmtD(s.d) : "Sem localização"}</span><div class="small text-muted text-truncate">ID ${esc(id)} · ${s.last}</div></div>${batt(t.battery ?? 0)}<button class="btn btn-line btn-sm ${on ? "on" : ""}" data-search="${esc(id)}">${on ? "Parar" : "Buscar"}</button><button class="btn-close" data-rm="${esc(id)}" aria-label="Remover"></button></div>`; }).join("") : "<p class='mb-0'>Nenhuma tag ainda. Adicione a primeira para começar.</p>";
  // resumo
  const lows = [br, ...Object.values(tags)].filter(x => x && x.battery != null && x.battery < LOW).length;
  const near = Object.values(tags).map(t => info(t).d).filter(d => d != null).sort((a, b) => a - b)[0];
  $("k-br").textContent = br?.battery != null ? br.battery + "%" : "—"; $("k-tags").textContent = ids.length;
  $("k-low").innerHTML = `<span class="${lows ? "bad" : "ok"}">${lows}</span>`; $("k-near").textContent = near != null ? fmtD(near) : "—";
  alerts(br, tags); drawMap(br, tags); renderSearch();
}

function alerts(br, tags) {
  const items = [br && { n: "Pulseira " + br.id, b: br.battery, k: "bracelet" }, ...Object.entries(tags).map(([id, t]) => ({ n: t.name, b: t.battery, k: "tag_" + id }))].filter(x => x && x.b != null && x.b < LOW);
  $("alerts").innerHTML = items.map(x => `<div class="alert-fo">${esc(x.n)}: bateria em ${x.b}%. Recarregue ou troque a bateria.</div>`).join("");
  // Registro para envio de SMS por uma Cloud Function (um aviso por item, até a bateria subir).
  const sent = data.alerts || {};
  items.forEach(x => { if (!sent[x.k]) set(ref(db, `users/${uid}/alerts/${x.k}`), { name: x.n, battery: x.b, phone: data.profile?.phone || "", at: Date.now(), sent: false }); });
  Object.keys(sent).forEach(k => { if (!items.find(x => x.k === k)) remove(ref(db, `users/${uid}/alerts/${k}`)); });
}

// Google Maps sem chave de API: usa o modo "embed" por URL (aceita coordenadas ou endereço).
function drawMap(br, tags) {
  const pts = [me && { id: "me", label: "Você", d: me, me: true }, br?.id && { id: "br", label: "Pulseira", d: br }, ...Object.entries(tags).map(([id, d]) => ({ id, label: d.name, d }))].filter(Boolean);
  $("chips").innerHTML = pts.map(p => `<button class="chip ${p.id === sel ? "on" : ""}" data-sel="${esc(p.id)}">${esc(p.label)}</button>`).join("");
  const cur = pts.find(p => p.id === sel) || pts[0], ok = cur && (cur.d.lat != null || cur.d.address);
  $("mapempty").classList.toggle("d-none", !!ok); $("route").classList.toggle("d-none", !ok || !!cur.me);
  if (!ok) { $("cap").textContent = ""; return; }
  const q = cur.d.address ? encodeURIComponent(cur.d.address) : `${cur.d.lat},${cur.d.lng}`;
  const src = `https://maps.google.com/maps?q=${q}&z=${cur.me && !gps ? 13 : 17}&output=embed`;
  if (src !== curSrc) { $("mapframe").src = curSrc = src; }
  $("route").href = `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=walking${me ? `&origin=${me.lat},${me.lng}` : ""}`;
  if (cur.me) { $("cap").textContent = gps ? "Sua localização, obtida pelo navegador." : "Sua localização aproximada, obtida pelo IP. Pode variar vários quilômetros."; return; }
  const s = info(cur.d);
  $("cap").textContent = s.off ? `${cur.label}: sem bateria. Mostrando a última localização conhecida. ${s.last}.` : `${cur.label} · ${s.last}${s.d != null ? " · " + fmtD(s.d) + " de você" : ""}${cur.d.address ? " · " + cur.d.address : ""}`;
}
$("chips").onclick = e => { if (e.target.dataset.sel) { sel = e.target.dataset.sel; render(); } };

// ---- Busca e intensidade da vibração ----
// Intensidade: 0% a RANGE metros (ou mais) de distância, 100% ao lado da tag.
const meters = () => { if (!search) return null; if (search.demo) return search.m; const t = data.tags?.[search.id]; return t && t.battery !== 0 && me && t.lat != null ? dist(me, t) : null; };
const pctOf = d => d == null ? 0 : Math.round(100 * (1 - Math.min(d, RANGE) / RANGE));
const levelOf = (p, d) => d != null && d <= 2 ? "Encontrado!" : p >= 75 ? "Muito forte" : p >= 50 ? "Forte" : p >= 25 ? "Média" : p > 0 ? "Fraca" : "Sem vibração";
let buzzT = null, buzzP = -1;
function buzz(p) { if (p === buzzP) return; buzzP = p; clearInterval(buzzT); navigator.vibrate?.(0); if (!p || !navigator.vibrate) return;
  buzzT = setInterval(() => navigator.vibrate(Math.round(40 + p * 4)), Math.round(1800 - 1500 * p / 100)); }
function stopBuzz() { clearInterval(buzzT); buzzP = -1; navigator.vibrate?.(0); }
function push(p) { const key = search.id + ":" + p; if (key === lastKey) return; clearTimeout(pushT);
  pushT = setTimeout(() => { if (!search) return; lastKey = key; update(ref(db, `users/${uid}/bracelet`), { searching: search.id, intensity: p }).catch(() => {}); }, 350); }

function renderSearch() {
  $("s-panel").classList.toggle("d-none", !search);
  if (!search) return stopBuzz();
  const t = data.tags?.[search.id] || {}, d = meters(), p = pctOf(d);
  $("s-name").textContent = t.name || search.id;
  $("s-demo").checked = search.demo; $("s-sim").disabled = !search.demo;
  $("s-level").textContent = levelOf(p, d); $("s-pct").textContent = p + "%";
  $("s-dist").textContent = d != null ? "Distância: " + fmtD(d) + (search.demo ? " (simulada)" : "") : t.battery === 0 ? "Tag sem bateria: sem sinal." : "Distância desconhecida. Ative o modo demonstração.";
  $("s-fill").style.width = p + "%"; $("s-bar").setAttribute("aria-valuenow", p);
  const v = $("s-vib"); v.classList.toggle("idle", p === 0); v.style.setProperty("--spd", (1.8 - 1.5 * p / 100).toFixed(2) + "s");
  buzz(p); push(p);
}
function startSearch(id) { sel = id; $("s-sim").value = RANGE; search = { id, demo: true, m: RANGE }; lastKey = ""; $("flash").classList.add("d-none"); render(); }
async function endSearch(found) {
  const name = data.tags?.[search?.id]?.name; search = null; lastKey = ""; clearTimeout(pushT); stopBuzz();
  try { await update(ref(db, `users/${uid}/bracelet`), { searching: null, intensity: null }); } catch { /* sem pulseira */ }
  if (found) flash(`Busca encerrada: ${name || "objeto"} encontrado!`); render();
}
$("s-sim").oninput = e => { if (search) { search.m = +e.target.value; renderSearch(); } };
$("s-demo").onchange = e => { if (search) { search.demo = e.target.checked; renderSearch(); } };
$("s-stop").onclick = () => endSearch(false);
$("s-found").onclick = () => endSearch(true);

$("f-br").onsubmit = async e => { e.preventDefault(); await update(ref(db, `users/${uid}/bracelet`), { id: $("br-id").value.trim(), battery: 100, lastSeen: Date.now() }); };
$("rm-br").onclick = () => confirm("Remover a pulseira?") && remove(ref(db, `users/${uid}/bracelet`));
$("f-tag").onsubmit = async e => { e.preventDefault(); let id = $("tg-id").value.trim(); if (id.toLowerCase() === DEMO_ID) id = DEMO_ID;
  const extra = id === DEMO_ID ? await demoPlace() : {};
  await update(ref(db, `users/${uid}/tags/${id}`), { name: $("tg-name").value.trim(), ...extra });
  if (id === DEMO_ID) { sel = id; if (extra.lat == null) flash("Tag posicionada pelo endereço no mapa, mas não consegui as coordenadas para calcular a distância. Use o modo demonstração.", true); }
  e.target.reset(); tagModal.hide(); };
$("tags").onclick = e => { const b = e.target.closest("[data-rm],[data-search]"); if (!b) return;
  if (b.dataset.rm && confirm("Remover esta tag?")) remove(ref(db, `users/${uid}/tags/${b.dataset.rm}`));
  if (b.dataset.search) search?.id === b.dataset.search ? endSearch(false) : startSearch(b.dataset.search); };

// Dados de teste: pulseira na sua localização (IP), tag "gabigolis" no Colégio São José e as demais tags por perto.
$("sim").onclick = async () => { if (!me) await locateByIP();
  const base = me || DEFAULT, j = () => (Math.random() - .5) * 0.004, now = Date.now(), P = `users/${uid}/`;
  const up = { [P + "bracelet/lat"]: base.lat, [P + "bracelet/lng"]: base.lng, [P + "bracelet/battery"]: 78, [P + "bracelet/lastSeen"]: now };
  Object.keys(data.tags || {}).filter(id => id !== DEMO_ID).forEach((id, i) => { const b = [64, 15, 0][i % 3];
    Object.assign(up, { [`${P}tags/${id}/lat`]: base.lat + j(), [`${P}tags/${id}/lng`]: base.lng + j(), [`${P}tags/${id}/battery`]: b, [`${P}tags/${id}/lastSeen`]: b === 0 ? now - 3.6e6 : now }); });
  const d = await demoPlace();
  Object.entries({ name: data.tags?.[DEMO_ID]?.name || "Gabigolis", ...d }).forEach(([k, v]) => up[`${P}tags/${DEMO_ID}/${k}`] = v);
  await update(ref(db), up); sel = DEMO_ID;
  if (d.lat == null) flash("Não consegui as coordenadas do colégio: o mapa usa o endereço, e a distância fica no modo demonstração.", true); render(); };

// Configurações
const smsg = (t, ok) => { const m = $("set-msg"); m.textContent = t; m.classList.toggle("d-none", !t); m.style.cssText = ok ? "background:rgba(0,207,193,.12);border-color:rgba(0,207,193,.4);color:#7ff0e6" : ""; };
$("m-set").addEventListener("show.bs.modal", () => { smsg(""); $("c-user").value = data.profile?.username || ""; $("c-tel").value = data.profile?.phone || ""; $("c-cur").textContent = user.email; });
$("p-perfil").onsubmit = async e => { e.preventDefault(); smsg("");
  const p = data.profile, nu = $("c-user").value.trim(), nt = digits($("c-tel").value), entry = { email: p.email, uid };
  try {
    if (nu.toLowerCase() !== p.username.toLowerCase()) { const t = await get(ref(db, "logins/user_" + nu.toLowerCase())); if (t.exists() && t.val().uid !== uid) return smsg("Nome de usuário já em uso."); }
    if (nt !== p.phone) { const t = await get(ref(db, "logins/tel_" + nt)); if (t.exists() && t.val().uid !== uid) return smsg("Telefone já cadastrado."); }
    await set(ref(db, "logins/user_" + nu.toLowerCase()), entry); await set(ref(db, "logins/tel_" + nt), entry);
    if (nu.toLowerCase() !== p.username.toLowerCase()) await remove(ref(db, "logins/user_" + p.username.toLowerCase()));
    if (nt !== p.phone) await remove(ref(db, "logins/tel_" + p.phone));
    await update(ref(db, `users/${uid}/profile`), { username: nu, phone: nt }); smsg("Alterações salvas.", true);
  } catch (err) { smsg(err.message); } };
$("p-mail").onsubmit = async e => { e.preventDefault(); smsg("");
  try { await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, $("c-pw").value));
    await verifyBeforeUpdateEmail(user, $("c-mail").value.trim()); $("c-pw").value = ""; smsg("Link de confirmação enviado ao novo e-mail. A troca vale após confirmar.", true);
  } catch (err) { smsg(err.code === "auth/invalid-credential" ? "Senha atual incorreta." : err.message); } };
$("b-pw").onclick = async () => { smsg(""); try { await sendPasswordResetEmail(auth, user.email); smsg("Enviamos o link de redefinição para " + user.email + ".", true); } catch (err) { smsg(err.message); } };

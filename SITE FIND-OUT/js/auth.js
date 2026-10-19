import { auth, db } from "./firebase.js";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";
import { ref, get, set } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js";
const $ = id => document.getElementById(id);
const msg = t => { $("msg").textContent = t; $("msg").classList.toggle("d-none", !t); };
const digits = s => s.replace(/\D/g, "");
const errs = { "auth/invalid-credential": "Dados de acesso incorretos.", "auth/email-already-in-use": "Este e-mail já está cadastrado.", "auth/weak-password": "Use uma senha com pelo menos 6 caracteres.", "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos." };
const showErr = e => msg(errs[e.code] || e.message);

if (new URLSearchParams(location.search).get("m") === "signup") $("tab-signup").click();
let busy = false;
onAuthStateChanged(auth, u => { if (u && !busy) location.replace("app.html"); });

$("t-login").addEventListener("submit", async e => {
  e.preventDefault(); msg("");
  try {
    let id = $("l-id").value.trim(), email = id;
    if (!id.includes("@")) {
      const key = /^[\d\s()+-]+$/.test(id) ? "tel_" + digits(id) : "user_" + id.toLowerCase();
      const s = await get(ref(db, "logins/" + key));
      if (!s.exists()) return msg("Usuário não encontrado.");
      email = s.val().email;
    }
    await signInWithEmailAndPassword(auth, email, $("l-pw").value);
  } catch (err) { showErr(err); }
});

$("t-signup").addEventListener("submit", async e => {
  e.preventDefault(); msg("");
  busy = true;
  const username = $("s-user").value.trim(), email = $("s-mail").value.trim().toLowerCase(), phone = digits($("s-tel").value);
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, $("s-pw").value);
    const uid = cred.user.uid, entry = { email, uid };
    const taken = await get(ref(db, "logins/user_" + username.toLowerCase()));
    if (taken.exists() && taken.val().uid !== uid) { await cred.user.delete(); busy = false; return msg("Nome de usuário já em uso."); }
    await set(ref(db, "logins/user_" + username.toLowerCase()), entry);
    await set(ref(db, "logins/tel_" + phone), entry);
    await set(ref(db, `users/${uid}/profile`), { username, email, phone });
    location.replace("app.html");
  } catch (err) { busy = false; showErr(err); }
});

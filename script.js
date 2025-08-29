// ================================
// Resume Optimizer - script.js
// Consolidated, production-ready
// ================================

// ---------- Config ----------
const BASE_REWRITES_PER_DAY = 5;
const EMAIL_BONUS_REWRITES = 5; // total becomes 10/day if email provided
const AUTOSAVE_DEBOUNCE_MS = 400;

// ---- LocalStorage keys
const LS_KEYS = {
  resume: "ro.resume",
  jd: "ro.jd",
  savedAt: "ro.savedAt",
  rewritesDate: "ro.rewrites.date",
  rewritesCount: "ro.rewrites.count",
  email: "ro.email"
};

// ---------- Utilities ----------
function debounce(fn, wait=300){
  let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), wait); };
}

const STOPWORDS = new Set([
  "the","and","or","to","a","of","in","for","on","with","is","are","as","at","by",
  "an","be","this","that","from","it","you","your","we","our","their","they",
  "will","can","ability","responsible","responsibilities","experience","years"
]);
function tokenize(text){
  return (text||"").toLowerCase()
    .replace(/[^a-z0-9\s\-+.#]/g," ")
    .split(/\s+/).filter(Boolean);
}
function keywordCounts(text){
  const m = new Map();
  for(const tok of tokenize(text)){
    if (STOPWORDS.has(tok)) continue;
    if (tok.length<3) continue;
    m.set(tok, (m.get(tok)||0)+1);
  }
  return m;
}
function topTerms(counts, limit=20){
  return [...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,limit)
         .map(([term,count])=>({term,count}));
}
function missingTerms(jdTop, resumeCounts){
  const miss=[];
  for(const {term,count} of jdTop){
    if(!resumeCounts.has(term)) miss.push({term, jdCount: count});
  }
  return miss;
}
function renderList(el, items, format=(x)=>x){
  if(!el) return;
  el.innerHTML="";
  for(const item of items){
    const li=document.createElement("li");
    li.textContent = format(item);
    el.appendChild(li);
  }
}

// ---------- Messaging UI ----------
function showMessage(type, text){
  // type: info | success | warn | error
  let box = document.getElementById("messages");
  if(!box){ box = document.getElementById("summary"); }
  if(!box) return;
  const div = document.createElement("div");
  div.className = `alert ${type}`;
  div.textContent = text;
  box.prepend(div);
  setTimeout(()=>{ if(div && div.parentNode) div.parentNode.removeChild(div); }, 5000);
}

function spinnerHTML(text="Working…"){
  return `<span class="spinner"></span>${text}`;
}

// Friendly error mapping (backend + network)
function friendlyError(err){
  const raw = (typeof err === "string") ? err : (err?.message || "");
  const s = raw.toLowerCase();

  if (s.includes("invalid_api_key")) return "API key is missing or invalid on the server.";
  if (s.includes("rate limit")) return "The AI is busy (rate limit). Please try again in a bit.";
  if (s.includes("429")) return "Too many requests. Please try again soon.";
  if (s.includes("function_invocation_failed")) return "Server function error. Please retry.";
  if (s.includes("cannot find module") || s.includes("module not found")) return "Server is missing a dependency.";
  if (s.includes("no file uploaded")) return "No file was received. Please pick a DOCX, PDF, or TXT and try again.";
  if (s.includes("extraction failed")) return "We couldn’t read that file. Try a different format.";
  return err?.message || "Something went wrong.";
}

// ---------- Character counters ----------
function updateCounterFrom(el, counterEl){
  if(!el || !counterEl) return;
  counterEl.textContent = `${(el.value||"").length} characters`;
}
function wireCounters(){
  const resumeEl = document.getElementById("resume");
  const jdEl = document.getElementById("jobDesc") || document.getElementById("jd");
  const resumeCount = document.getElementById("resumeCount");
  const jdCount = document.getElementById("jobDescCount");

  if (resumeEl && resumeCount){
    updateCounterFrom(resumeEl, resumeCount);
    resumeEl.addEventListener("input", ()=>updateCounterFrom(resumeEl, resumeCount));
  }
  if (jdEl && jdCount){
    updateCounterFrom(jdEl, jdCount);
    jdEl.addEventListener("input", ()=>updateCounterFrom(jdEl, jdCount));
  }
}

// ---------- Draft save/load ----------
function saveDraft(){
  const resumeEl = document.getElementById("resume");
  const jdEl = document.getElementById("jobDesc") || document.getElementById("jd");
  if(!resumeEl || !jdEl) return;
  localStorage.setItem(LS_KEYS.resume, resumeEl.value||"");
  localStorage.setItem(LS_KEYS.jd, jdEl.value||"");
  localStorage.setItem(LS_KEYS.savedAt, new Date().toISOString());
  showMessage("success", "Draft saved.");
}
function loadDraft(){
  const resumeEl = document.getElementById("resume");
  const jdEl = document.getElementById("jobDesc") || document.getElementById("jd");
  if(!resumeEl || !jdEl) return;

  const resume = localStorage.getItem(LS_KEYS.resume)||"";
  const jd = localStorage.getItem(LS_KEYS.jd)||"";
  resumeEl.value = resume;
  jdEl.value = jd;

  const rc = document.getElementById("resumeCount");
  const jc = document.getElementById("jobDescCount");
  if (rc) updateCounterFrom(resumeEl, rc);
  if (jc) updateCounterFrom(jdEl, jc);

  if (resume || jd){
    const when = localStorage.getItem(LS_KEYS.savedAt);
    showMessage("info", when ? `Draft loaded (saved ${new Date(when).toLocaleString()}).` : "Draft loaded.");
  }else{
    showMessage("warn", "No saved draft found.");
  }
}
function clearDraft(){
  localStorage.removeItem(LS_KEYS.resume);
  localStorage.removeItem(LS_KEYS.jd);
  localStorage.removeItem(LS_KEYS.savedAt);
}

// Restore banner logic
function maybeShowRestoreBanner(){
  const banner = document.getElementById("restoreBanner");
  const resumeEl = document.getElementById("resume");
  const jdEl = document.getElementById("jobDesc") || document.getElementById("jd");
  if (!banner || !resumeEl || !jdEl) return;

  const savedResume = localStorage.getItem(LS_KEYS.resume)||"";
  const savedJd = localStorage.getItem(LS_KEYS.jd)||"";
  const bothEmpty = !(resumeEl.value||"").trim() && !(jdEl.value||"").trim();
  if ((savedResume || savedJd) && bothEmpty){
    banner.hidden = false;
  }else{
    banner.hidden = true;
  }
}

// ---------- Usage limits ----------
function todayStr(){ return new Date().toISOString().slice(0,10); }
function getEmail(){ return localStorage.getItem(LS_KEYS.email)||""; }
function maxPerDay(){ return BASE_REWRITES_PER_DAY + (getEmail() ? EMAIL_BONUS_REWRITES : 0); }

function getRewritesUsed(){
  const d = localStorage.getItem(LS_KEYS.rewritesDate);
  const c = parseInt(localStorage.getItem(LS_KEYS.rewritesCount)||"0",10);
  if (d !== todayStr()){
    localStorage.setItem(LS_KEYS.rewritesDate, todayStr());
    localStorage.setItem(LS_KEYS.rewritesCount, "0");
    return 0;
  }
  return isNaN(c) ? 0 : c;
}
function incrementRewrites(){
  const d = localStorage.getItem(LS_KEYS.rewritesDate);
  if (d !== todayStr()){
    localStorage.setItem(LS_KEYS.rewritesDate, todayStr());
    localStorage.setItem(LS_KEYS.rewritesCount, "1");
    return 1;
  }
  const c = getRewritesUsed()+1;
  localStorage.setItem(LS_KEYS.rewritesCount, String(c));
  return c;
}
function updateUsageCounter(){
  const el = document.getElementById("usageCounter");
  if (el) el.textContent = `${getRewritesUsed()} / ${maxPerDay()} rewrites used today`;
}

// Email modal
function showEmailModal(){ const m=document.getElementById("emailModal"); if(m) m.hidden=false; }
function hideEmailModal(){ const m=document.getElementById("emailModal"); if(m) m.hidden=true; }
function captureEmail(){
  const input = document.getElementById("emailInput");
  const email = (input?.value||"").trim();
  if (!email || !email.includes("@")){
    showMessage("warn","Please enter a valid email.");
    return false;
  }
  localStorage.setItem(LS_KEYS.email, email);
  updateUsageCounter();
  hideEmailModal();
  showMessage("success", "Thanks! Daily limit increased.");
  return true;
}

// ---------- API calls ----------
async function callRewriteAPI(resume, jd, opts={}){
  const r = await fetch("/api/rewrite", {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ resume, jd, ...opts })
  });
  if(!r.ok) throw new Error(await r.text());
  const data = await r.json();
  return data.bullets || "";
}

async function callAnalyzeAPI(resume, jobDesc){
  const r = await fetch("/api/analyze", {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ resume, jobDesc })
  });
  if(!r.ok) throw new Error(await r.text());
  return r.json();
}

// Generic loading wrapper
function withLoading(btn, labelWhileLoading, fn){
  return async function(...args){
    let original;
    if(btn){ btn.disabled=true; original=btn.textContent; btn.textContent=labelWhileLoading; }
    try{
      return await fn(...args);
    }finally{
      if(btn){ btn.disabled=false; btn.textContent=original; }
    }
  }
}

// ---------- Sample content (Step D) ----------
const SAMPLE_RESUME = `
TODD PFAHLER — Operations Lead
Email: todd@example.com · Portland, OR

EXPERIENCE
Acme Co — Operations Manager (2021–Present)
• Led cross-functional projects to reduce order cycle time by 28%.
• Built dashboards in Google Sheets + Looker; automated weekly reporting.
• Managed 6 direct reports; introduced SOPs that cut rework by 18%.

Globex — Senior Coordinator (2018–2021)
• Owned vendor onboarding; negotiated SLAs and tracked KPIs.
• Partnered with HR to revamp onboarding materials; NPS +22 pts.

EDUCATION
B.S., Business Administration
`;

const SAMPLE_JD = `
Job Title: Operations Program Manager

About the Role
We need a data-driven program manager to improve fulfillment operations,
optimize SOPs, and report KPIs to leadership. You’ll run cross-functional
projects, build dashboards, and drive continuous improvement.

Qualifications
• 5+ years in operations / program management
• Experience with KPI reporting, dashboards, and process optimization
• Strong stakeholder management; excellent written communication
• Bonus: SQL, Looker, or similar BI tools

Responsibilities
• Lead cross-functional initiatives to reduce cycle time and defects
• Define and maintain SOPs; ensure compliance
• Build weekly/monthly KPI dashboards and present insights
`;

// Sample loaders
function loadSampleResume(){
  const el=document.getElementById("resume");
  if(!el) return;
  el.value = SAMPLE_RESUME.trim();
  saveDraft();
  const c=document.getElementById("resumeCount");
  if(c) updateCounterFrom(el,c);
}
function loadSampleJD(){
  const el=document.getElementById("jobDesc") || document.getElementById("jd");
  if(!el) return;
  el.value = SAMPLE_JD.trim();
  saveDraft();
  const c=document.getElementById("jobDescCount");
  if(c) updateCounterFrom(el,c);
}
function loadBothSamples(){
  const resumeEl=document.getElementById("resume");
  const jdEl=document.getElementById("jobDesc") || document.getElementById("jd");
  if(!resumeEl || !jdEl) return;
  const hasAny = (resumeEl.value||"").trim() || (jdEl.value||"").trim();
  if(hasAny && !confirm("This will replace existing text in both fields. Continue?")) return;
  loadSampleResume();
  loadSampleJD();
  showMessage("success","Sample Resume + Job Description loaded.");
}

// ---------- Handlers ----------
document.addEventListener("DOMContentLoaded", () => {
  wireCounters();
  updateUsageCounter();
  maybeShowRestoreBanner();

  // Autosave on input
  const resumeEl = document.getElementById("resume");
  const jdEl = document.getElementById("jobDesc") || document.getElementById("jd");
  const debouncedSave = debounce(saveDraft, AUTOSAVE_DEBOUNCE_MS);
  if(resumeEl) resumeEl.addEventListener("input", debouncedSave);
  if(jdEl) jdEl.addEventListener("input", debouncedSave);

  // Restore banner buttons
  const restoreYesBtn = document.getElementById("restoreYesBtn");
  const restoreNoBtn = document.getElementById("restoreNoBtn");
  if(restoreYesBtn) restoreYesBtn.addEventListener("click", () => { loadDraft(); maybeShowRestoreBanner(); });
  if(restoreNoBtn) restoreNoBtn.addEventListener("click", () => {
    const b=document.getElementById("restoreBanner"); if(b) b.hidden=true;
  });

  // Analyze Alignment (server) + local stats render
  const analyzeBtn = document.getElementById("analyzeBtn");
  if (analyzeBtn){
    const handler = withLoading(analyzeBtn, "Analyzing…", async () => {
      const resume = (document.getElementById("resume")?.value || "").trim();
      const jobDesc = (document.getElementById("jobDesc")?.value || document.getElementById("jd")?.value || "").trim();
      if (!resume || !jobDesc){ showMessage("warn","Please paste both Resume and Job Description."); return; }

      // local stats for lists
      const resumeCounts = keywordCounts(resume);
      const jdCounts = keywordCounts(jobDesc);
      const jdTop = topTerms(jdCounts, 20);
      const miss = missingTerms(jdTop, resumeCounts);
      const sugg = miss.slice(0, 10).map(({term}) => `Add a bullet using “${term}” in context (e.g., quantified impact or tool usage).`);

      renderList(document.getElementById("topJd"), jdTop, x=>`${x.term} (${x.count})`);
      renderList(document.getElementById("missing"), miss, x=>x.term);
      renderList(document.getElementById("suggestions"), sugg);

      // server-side analysis
      const summary = document.getElementById("summary");
      if (summary) summary.innerHTML = spinnerHTML("Analyzing alignment…");

      try{
        const data = await callAnalyzeAPI(resume, jobDesc);
        if (summary){
          const analysis = (data.analysis || "").replace(/\n/g,"<br>");
          summary.innerHTML = `<div class="card"><p>${analysis}</p></div>`;
        }
        showMessage("success","Alignment analysis complete.");
      }catch(err){
        if(summary) summary.innerHTML="";
        showMessage("error", friendlyError(err));
      }
    });
    analyzeBtn.addEventListener("click", handler);
  }

  // AI Rewrite (with limits + optional email unlock)
  const rewriteBtn = document.getElementById("rewriteBtn");
  if (rewriteBtn){
    const handler = withLoading(rewriteBtn, "Rewriting…", async () => {
      const resume = (document.getElementById("resume")?.value||"").trim();
      const jd = (document.getElementById("jobDesc")?.value || document.getElementById("jd")?.value || "").trim();
      if (!resume || !jd){ showMessage("warn","Please paste both Resume and Job Description."); return; }

      // Check limits
      const used = getRewritesUsed();
      const max = maxPerDay();
      if (used >= max){
        // if no email yet and already at base limit, offer unlock
        if (!getEmail() && used >= BASE_REWRITES_PER_DAY){
          showEmailModal();
          return;
        }
        showMessage("warn", "Daily limit reached. Please come back tomorrow.");
        return;
      }

      // Optional Lesson 7 controls (safe fallbacks)
      const tone = (document.getElementById("tone")?.value || "Professional").toLowerCase();
      const seniority = (document.getElementById("seniority")?.value || "Mid").toLowerCase();
      const role = (document.getElementById("role")?.value || "General").toLowerCase();

      const summary = document.getElementById("summary");
      if (summary) summary.innerHTML = spinnerHTML("Rewriting with AI…");

      try{
        const bullets = await callRewriteAPI(resume, jd, { tone, seniority, role });
        const html = bullets
          .split("\n").map(l=>l.trim()).filter(Boolean)
          .map(l=>l.replace(/^[-•*\d.)\s]+/,""))
          .map(l=>`<li>${l}</li>`).join("");
        if (summary) summary.innerHTML = `<h3>AI Suggested Bullets</h3><ul>${html}</ul>`;

        incrementRewrites();
        updateUsageCounter();
        showMessage("success", `AI rewrite complete. (${getRewritesUsed()}/${maxPerDay()} used today)`);
      }catch(err){
        if(summary) summary.innerHTML="";
        showMessage("error", friendlyError(err));
      }
    });
    rewriteBtn.addEventListener("click", handler);
  }

  // Email modal wiring
  const emailSubmitBtn = document.getElementById("emailSubmitBtn");
  const emailCancelBtn = document.getElementById("emailCancelBtn");
  if(emailSubmitBtn) emailSubmitBtn.addEventListener("click", ()=>{ if(captureEmail()){ const rb=document.getElementById("rewriteBtn"); rb?.click(); } });
  if(emailCancelBtn) emailCancelBtn.addEventListener("click", hideEmailModal);

  // ---------- Draft builder helpers ----------
function buildDraftResume(resumeText, jdText, bullets) {
  const nameLine = "NAME LASTNAME • City, ST • email@example.com • (555) 555-5555 • linkedin.com/in/you";
  const titleLine = "TARGET ROLE — Tailored for the provided job description";
  const summary = [
    "SUMMARY",
    "Impact-driven professional. Highlights aligned to role requirements:",
    ...bullets.map(b => `• ${b}`)
  ].join("\n");

  const keywords = (() => {
    // quick skim of JD terms, reuse what you already count if available
    const top7 = [];
    const jdCounts = (typeof keywordCounts === "function") ? keywordCounts(jdText) : new Map();
    const top = (typeof topTerms === "function") ? topTerms(jdCounts, 7) : [];
    for (const t of top) top7.push(t.term);
    return top7.length ? `KEYWORDS: ${top7.join(", ")}` : "";
  })();

  return [
    nameLine,
    titleLine,
    "",
    summary,
    "",
    "EXPERIENCE",
    "Company • Role • Dates",
    "• Result-first bullet (you can replace these with AI bullets above)",
    "• Quantify impact where possible (%, $, time saved)",
    "",
    "EDUCATION",
    "School • Degree • Year",
    "",
    keywords
  ].join("\n");
}
  
  // Copy bullets
  const copyBtn = document.getElementById("copyBtn");
  if (copyBtn){
    copyBtn.addEventListener("click", async ()=>{
      const bullets = getCurrentBullets();
      if(!bullets.length){ showMessage("warn","No AI bullets to copy yet!"); return; }
      try{
        await navigator.clipboard.writeText(bullets.join("\n"));
        showMessage("success","Copied AI bullets to your clipboard.");
      }catch(err){ showMessage("error","Copy failed: "+(err?.message||err)); }
    });
  }

  // Download DOCX via backend
  const downloadBtn = document.getElementById("downloadBtn");
  if (downloadBtn){
    const handler = withLoading(downloadBtn, "Preparing DOCX…", async () => {
      const bullets = getCurrentBullets();
      if(!bullets.length){ showMessage("warn","No AI bullets to download yet!"); return; }
      try{
        const r = await fetch("/api/download-docx", {
          method:"POST",
          headers:{ "Content-Type":"application/json" },
          body: JSON.stringify({ title:"AI Suggested Resume Bullets", bullets })
        });
        if(!r.ok) throw new Error(await r.text());
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = "ai_resume_bullets.docx";
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showMessage("success","Downloaded DOCX. Open it in Word/Pages.");
      }catch(err){ showMessage("error", friendlyError(err)); }
    });
    downloadBtn.addEventListener("click", handler);
  }

  // ---------- Draft Resume (beta) actions ----------
const buildDraftBtn = document.getElementById("buildDraftBtn");
const downloadDraftBtn = document.getElementById("downloadDraftBtn");

if (buildDraftBtn) {
  buildDraftBtn.addEventListener("click", () => {
    const resumeEl = document.getElementById("resume");
    const jdEl = document.getElementById("jobDesc") || document.getElementById("jd");
    const draftEl = document.getElementById("draftResume");

    const resume = (resumeEl?.value || "").trim();
    const jd = (jdEl?.value || "").trim();
    const bullets = getCurrentBullets();

    if (!bullets.length) {
      showMessage("warn", "No AI bullets found. Click “Rewrite for Alignment (AI)” first.");
      return;
    }

    const draft = buildDraftResume(resume, jd, bullets);
    if (draftEl) {
      draftEl.value = draft;
      showMessage("success", "Draft built from your AI bullets. Edit freely before downloading.");
    }
  });
}

if (downloadDraftBtn) {
  downloadDraftBtn.addEventListener("click", async () => {
    const draftEl = document.getElementById("draftResume");
    const text = (draftEl?.value || "").trim();
    if (!text) {
      showMessage("warn", "No draft content to download yet. Click “Build Draft from Bullets” first.");
      return;
    }

    try {
      // We’ll send raw text to a lightweight endpoint that builds paragraphs.
      const r = await fetch("/api/download-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Tailored Resume Draft",
          text
        })
      });
      if (!r.ok) throw new Error(await r.text());
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "resume_draft.docx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showMessage("success", "Draft DOCX downloaded.");
    } catch (err) {
      showMessage("error", friendlyError(err));
    }
  });
}

  // Upload → /api/extract
  const uploadBtn = document.getElementById("uploadBtn");
  const resumeFileInput = document.getElementById("resumeFile");
  if(uploadBtn && resumeFileInput){
    uploadBtn.addEventListener("click", ()=>resumeFileInput.click());
    resumeFileInput.addEventListener("change", async ()=>{
      const file = resumeFileInput.files?.[0];
      if(!file){ showMessage("warn","No file selected."); return; }
      const formData = new FormData();
      formData.append("file", file);
      const original = uploadBtn.textContent;
      uploadBtn.disabled=true; uploadBtn.textContent="Extracting…";
      try{
        const r = await fetch("/api/extract", { method:"POST", body: formData });
        if(!r.ok) throw new Error(await r.text());
        const data = await r.json();
        const resumeEl = document.getElementById("resume");
        if(resumeEl) resumeEl.value = data.text || "";
        const c=document.getElementById("resumeCount"); if(c) updateCounterFrom(resumeEl,c);
        saveDraft();
        showMessage("success","File text extracted and added to your resume.");
      }catch(err){
        showMessage("error", friendlyError(err));
      }finally{
        uploadBtn.disabled=false; uploadBtn.textContent=original;
        resumeFileInput.value="";
      }
    });
  }

  // Sample buttons
  const loadResumeSampleBtn = document.getElementById("loadResumeSampleBtn");
  const loadJdSampleBtn = document.getElementById("loadJdSampleBtn");
  const loadBothSamplesBtn = document.getElementById("loadBothSamplesBtn");
  if(loadResumeSampleBtn) loadResumeSampleBtn.addEventListener("click", ()=>{ loadSampleResume(); showMessage("info","Sample Resume loaded."); });
  if(loadJdSampleBtn) loadJdSampleBtn.addEventListener("click", ()=>{ loadSampleJD(); showMessage("info","Sample Job Description loaded."); });
  if(loadBothSamplesBtn) loadBothSamplesBtn.addEventListener("click", loadBothSamples);

  // One-click: load both samples and immediately rewrite
  const tryRewriteSamplesBtn = document.getElementById("tryRewriteSamplesBtn");
  if (tryRewriteSamplesBtn){
    tryRewriteSamplesBtn.addEventListener("click", ()=>{
      const resumeEl=document.getElementById("resume");
      const jdEl=document.getElementById("jobDesc") || document.getElementById("jd");
      if(!resumeEl || !jdEl) return;
      const hasAny = (resumeEl.value||"").trim() || (jdEl.value||"").trim();
      if(hasAny && !confirm("This will replace existing text in both fields. Continue?")) return;
      loadSampleResume(); loadSampleJD();
      showMessage("info","Samples loaded. Running AI rewrite…");
      setTimeout(()=>document.getElementById("rewriteBtn")?.click(), 120);
    });
  }

  // Copy helpers for lists
  const topTermsCopyBtn = document.getElementById("topTermsCopyBtn");
  const missingCopyBtn = document.getElementById("missingCopyBtn");
  const suggestionsCopyBtn = document.getElementById("suggestionsCopyBtn");
  if(topTermsCopyBtn) topTermsCopyBtn.addEventListener("click", ()=>copyListById("topJd","Top JD Terms"));
  if(missingCopyBtn) missingCopyBtn.addEventListener("click", ()=>copyListById("missing","Missing Terms"));
  if(suggestionsCopyBtn) suggestionsCopyBtn.addEventListener("click", ()=>copyListById("suggestions","Suggested Actions"));

  // Clear
  const clearBtn = document.getElementById("clearBtn");
  if(clearBtn){
    clearBtn.addEventListener("click", ()=>{
      const ids=["resume","jobDesc","jd","summary","topJd","missing","suggestions"];
      for(const id of ids){
        const el=document.getElementById(id);
        if(!el) continue;
        if(el.tagName==="TEXTAREA"||el.tagName==="INPUT") el.value="";
        else el.innerHTML="";
      }
      clearDraft();
      const rc=document.getElementById("resumeCount"); if(rc) rc.textContent="0 characters";
      const jc=document.getElementById("jobDescCount"); if(jc) jc.textContent="0 characters";
      showMessage("info","Cleared. Paste your fresh text to continue.");
      maybeShowRestoreBanner();
    });
  }

  // Draft buttons
  document.getElementById("saveBtn")?.addEventListener("click", saveDraft);
  document.getElementById("loadBtn")?.addEventListener("click", ()=>{ loadDraft(); maybeShowRestoreBanner(); });
  document.getElementById("clearDraftBtn")?.addEventListener("click", ()=>{ clearDraft(); showMessage("success","Draft cleared."); maybeShowRestoreBanner(); });
});

// ---------- Small helpers ----------
function getCurrentBullets(){
  const summary=document.getElementById("summary");
  const lis = summary ? summary.querySelectorAll("li") : [];
  return Array.from(lis).map(li=>li.textContent.trim()).filter(Boolean);
}

async function copyListById(id, label){
  const ul=document.getElementById(id);
  if(!ul){ showMessage("error", `Could not find ${label}.`); return; }
  const rows = Array.from(ul.querySelectorAll("li")).map(li=>li.textContent.trim()).filter(Boolean);
  if(!rows.length){ showMessage("warn", `No ${label} to copy.`); return; }
  try{
    await navigator.clipboard.writeText(rows.join("\n"));
    showMessage("success", `${label} copied.`);
  }catch(err){ showMessage("error","Copy failed: "+(err?.message||err)); }
}
const $=s=>document.querySelector(s);
const today=new Date(); const iso=d=>d.toISOString().slice(0,10);
$("#date").value=iso(today); $("#date2").value=iso(today);

let fixtures=[];
function pct(n){return `${Math.round(Number(n)||0)}%`}
function conf(f){
  const p=f.prediction?.poisson||{};
  return Math.max(p.home||0,p.draw||0,p.away||0);
}
function market(f){
  const p=f.prediction?.poisson||{};
  return `<div class="markets">
    <span class="tag">1 <b>${pct(p.home)}</b></span>
    <span class="tag">X <b>${pct(p.draw)}</b></span>
    <span class="tag">2 <b>${pct(p.away)}</b></span>
    <span class="tag">O2.5 <b>${pct(p.over25)}</b></span>
    <span class="tag">U2.5 <b>${pct(p.under25)}</b></span>
    <span class="tag">BTTS <b>${pct(p.btts)}</b></span>
  </div>`
}
function card(f){
 const p=f.prediction?.poisson||{};
 const winner = p.home>=p.draw&&p.home>=p.away ? f.home.name : p.away>=p.draw ? f.away.name : "Draw";
 const top=Math.max(p.home||0,p.draw||0,p.away||0);
 const scores=(p.scores||[]).map(x=>x.score).slice(0,2).join(" · ");
 return `<article class="match" data-id="${f.id}">
  <div class="mhead"><span>${f.league||"Football"} · ${f.country||""}</span><span>${new Date(f.date).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</span></div>
  <div class="teams">
   <div class="team">${f.home.logo?`<img class="logo" src="${f.home.logo}">`:''}<span>${f.home.name}</span></div>
   <div class="score">${f.score?.home!=null?`${f.score.home} - ${f.score.away}`:"VS"}</div>
   <div class="team away"><span>${f.away.name}</span>${f.away.logo?`<img class="logo" src="${f.away.logo}">`:''}</div>
  </div>
  <div class="probbar"><div class="probfill" style="width:${top}%"></div></div>
  <div class="markets">${market(f)}</div>
  <div class="mhead" style="margin-top:10px"><span>Model lean: <b style="color:#fff">${winner}</b></span><span>Correct score: <b style="color:#fff">${scores||"—"}</b></span></div>
 </article>`
}
function render(){
 const q=$("#search").value.toLowerCase(), min=Number($("#confidence").value), mk=$("#market").value;
 let list=fixtures.filter(f=>(`${f.home.name} ${f.away.name} ${f.league} ${f.country}`).toLowerCase().includes(q) && conf(f)>=min);
 if(mk==="1x2") list=list.filter(f=>conf(f)>0);
 if(mk==="ou") list=list.filter(f=>f.prediction?.poisson);
 if(mk==="btts") list=list.filter(f=>f.prediction?.poisson);
 $("#count").textContent=list.length; $("#matches").innerHTML=list.length?list.map(card).join(""):`<div class="empty">No fixtures match your filters.</div>`;
 const top=[...list].sort((a,b)=>conf(b)-conf(a)).slice(0,5);
 $("#topConf").textContent=top[0]?pct(conf(top[0])):"—";
 $("#topPick").textContent=top[0]? (top[0].prediction?.winner || "Model"): "—";
 $("#picks").innerHTML=top.length?top.map(f=>`<div class="pick"><b>${f.home.name} vs ${f.away.name}</b><span class="muted">${f.prediction?.winner||"Model"} · ${pct(conf(f))}</span></div>`).join(""):"<p class='muted'>No picks yet.</p>";
 document.querySelectorAll(".match").forEach(x=>x.onclick=()=>openMatch(x.dataset.id));
}
async function load(){
 $("#status").textContent="Loading…"; $("#matches").innerHTML="<div class='empty'>Fetching football data and predictions…</div>";
 try{
  const d=await fetch(`/api/fixtures?date=${$("#date").value}`).then(r=>r.json());
  if(d.error) throw new Error(d.error);
  fixtures=d.results||[]; $("#updated").textContent=new Date().toLocaleTimeString(); $("#status").textContent=`${fixtures.length} loaded`; render();
 }catch(e){$("#status").textContent="Error";$("#matches").innerHTML=`<div class="empty">${e.message}<br><br>Make sure your API key is configured on the server.</div>`}
}
async function openMatch(id){
 $("#modal").classList.add("show"); $("#modalContent").innerHTML="<p>Loading match details…</p>";
 try{
  const d=await fetch(`/api/match/${id}`).then(r=>r.json()), f=d.fixture, p=d.prediction?.predictions;
  const home=f?.teams?.home?.name||"", away=f?.teams?.away?.name||"";
  $("#modalContent").innerHTML=`<span class="eyebrow">${f?.league?.name||"MATCH PREVIEW"}</span><h2>${home} vs ${away}</h2>
  <p class="muted">${f?.fixture?.venue?.name||""} · ${f?.fixture?.date?new Date(f.fixture.date).toLocaleString():""}</p>
  <div class="detailgrid">
   <div class="detail"><small>Winner</small><b>${p?.winner?.name||"—"}</b></div>
   <div class="detail"><small>Advice</small><b>${p?.advice||"—"}</b></div>
   <div class="detail"><small>Goals</small><b>${p?.goals?.home||"—"} / ${p?.goals?.away||"—"}</b></div>
   <div class="detail"><small>Home</small><b>${p?.percent?.home||"—"}</b></div>
   <div class="detail"><small>Draw</small><b>${p?.percent?.draw||"—"}</b></div>
   <div class="detail"><small>Away</small><b>${p?.percent?.away||"—"}</b></div>
  </div><p class="muted">This page is an analytical preview. Probabilities are estimates and do not guarantee an outcome.</p>`;
 }catch(e){$("#modalContent").innerHTML=`<p>${e.message}</p>`}
}
$("#close").onclick=()=>$("#modal").classList.remove("show");
$("#modal").onclick=e=>{if(e.target.id==="modal")$("#modal").classList.remove("show")};
$("#refresh").onclick=load; $("#search").oninput=render; $("#market").onchange=render; $("#confidence").onchange=render;
$("#loadDate").onclick=()=>{$("#date").value=$("#date2").value; document.querySelector('[data-view="dashboard"]').click(); load()};
document.querySelectorAll(".nav").forEach(n=>n.onclick=()=>{document.querySelectorAll(".nav").forEach(x=>x.classList.remove("active"));n.classList.add("active");document.querySelectorAll(".view").forEach(x=>x.classList.remove("active"));$("#"+n.dataset.view).classList.add("active")});
load();

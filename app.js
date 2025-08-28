// Basit client-side idda analiz (Poisson + implied odds)
function impliedFromDecimal(o){ o = parseFloat(o); if(!o || o<=1) return null; return 1.0/o; }
function poissonP(k, lambda){ return Math.pow(lambda,k)*Math.exp(-lambda)/factorial(k); }
function factorial(n){ if(n<2) return 1; let r=1; for(let i=2;i<=n;i++) r*=i; return r; }

function poissonResultProbs(lambdaHome, lambdaAway, maxGoals=6){
  // compute P(home win), P(draw), P(away win)
  let pHome=0, pDraw=0, pAway=0;
  for(let i=0;i<=maxGoals;i++){
    for(let j=0;j<=maxGoals;j++){
      let prob = poissonP(i,lambdaHome)*poissonP(j,lambdaAway);
      if(i>j) pHome+=prob;
      else if(i===j) pDraw+=prob;
      else pAway+=prob;
    }
  }
  // tail probability approximation for >maxGoals (small)
  return [pHome,pDraw,pAway];
}

// Simple expected goals estimator using team gpm and opponent conceded gpm; if not provided, fallback constants
function estimateExpectedGoals(team_gpm, opp_conceded_gpm, home=true){
  let base = team_gpm || 1.2;
  let oppDef = opp_conceded_gpm || 1.2;
  let homeAdv = home ? 1.15 : 0.95;
  return Math.max(0.1, base * (oppDef / 1.2) * homeAdv);
}

function createMatchCard(data){
  const div = document.createElement('div'); div.className='match';
  div.innerHTML = `
    <div class="row"><label>Ev Sahibi</label><input class="home" type="text" value="${data.home||''}" placeholder="Takım A"></div>
    <div class="row"><label>Deplasman</label><input class="away" type="text" value="${data.away||''}" placeholder="Takım B"></div>
    <div class="row"><label>Home gpm</label><input class="home_gpm" type="number" step="0.1" value="${data.home_gpm||1.2}"></div>
    <div class="row"><label>Away gpm</label><input class="away_gpm" type="number" step="0.1" value="${data.away_gpm||1.1}"></div>
    <div class="row"><label>Home odds (decimal)</label><input class="home_odds" type="number" step="0.01" value="${data.home_odds||2.0}"></div>
    <div class="row"><label>Draw odds</label><input class="draw_odds" type="number" step="0.01" value="${data.draw_odds||3.2}"></div>
    <div class="row"><label>Away odds</label><input class="away_odds" type="number" step="0.01" value="${data.away_odds||3.5}"></div>
    <div class="row"><button class="removeBtn secondary">Sil</button></div>
  `;
  div.querySelector('.removeBtn').addEventListener('click', ()=>{ div.remove(); });
  return div;
}

function addMatch(data={}){ document.getElementById('matches').appendChild(createMatchCard(data)); }

document.getElementById('addMatch').addEventListener('click', ()=> addMatch({}));
document.getElementById('useSample').addEventListener('click', ()=>{
  const samples = [
    {home:'Fenerbahçe', away:'Galatasaray', home_gpm:1.8, away_gpm:1.6, home_odds:1.9, draw_odds:3.4, away_odds:4.0},
    {home:'Beşiktaş', away:'Başakşehir', home_gpm:1.6, away_gpm:1.2, home_odds:2.1, draw_odds:3.2, away_odds:3.5},
  ];
  document.getElementById('matches').innerHTML='';
  samples.forEach(s=>addMatch(s));
});

document.getElementById('clearMatches').addEventListener('click', ()=>{ document.getElementById('matches').innerHTML=''; });

document.getElementById('analyzeBtn').addEventListener('click', ()=>{
  const bankoThreshold = parseFloat(document.getElementById('bankoThreshold').value) || 0.65;
  const valueDiff = parseFloat(document.getElementById('valueDiff').value) || 0.07;
  const matchEls = Array.from(document.querySelectorAll('.match'));
  const results = [];
  matchEls.forEach(el=>{
    const home = el.querySelector('.home').value || 'Home';
    const away = el.querySelector('.away').value || 'Away';
    const home_gpm = parseFloat(el.querySelector('.home_gpm').value) || 1.2;
    const away_gpm = parseFloat(el.querySelector('.away_gpm').value) || 1.2;
    const home_odds = parseFloat(el.querySelector('.home_odds').value) || null;
    const draw_odds = parseFloat(el.querySelector('.draw_odds').value) || null;
    const away_odds = parseFloat(el.querySelector('.away_odds').value) || null;

    // implied probs (simple)
    let implied = {home: impliedFromDecimal(home_odds), draw: impliedFromDecimal(draw_odds), away: impliedFromDecimal(away_odds)};
    // normalize implied
    let s = (implied.home||0)+(implied.draw||0)+(implied.away||0);
    if(s>0){
      implied.home/=s; implied.draw/=s; implied.away/=s;
    }

    const lamHome = estimateExpectedGoals(home_gpm, away_gpm, true);
    const lamAway = estimateExpectedGoals(away_gpm, home_gpm, false);
    const [p_home,p_draw,p_away] = poissonResultProbs(lamHome, lamAway, 6);

    const bets=[];
    if(implied.home && (p_home - implied.home >= valueDiff)) bets.push({pick:'1',type:'home',model_prob:p_home,implied:implied.home,diff:p_home-implied.home});
    if(implied.draw && (p_draw - implied.draw >= valueDiff)) bets.push({pick:'0',type:'draw',model_prob:p_draw,implied:implied.draw,diff:p_draw-implied.draw});
    if(implied.away && (p_away - implied.away >= valueDiff)) bets.push({pick:'2',type:'away',model_prob:p_away,implied:implied.away,diff:p_away-implied.away});

    const banko = bets.filter(b=>b.model_prob >= bankoThreshold);

    results.push({home,away,lamHome,lamAway,p_home,p_draw,p_away,implied,bets,banko});
  });

  // render results
  const out = document.getElementById('results');
  out.innerHTML='';
  if(results.length===0){ out.innerHTML='<p class="muted">Maç yok.</p>'; return; }
  results.forEach(r=>{
    const card = document.createElement('div'); card.className='result-card';
    let html = `<strong>${r.home} vs ${r.away}</strong><br>`;
    html += `Model P: Ev ${round(r.p_home)} / Beraberlik ${round(r.p_draw)} / Deplasman ${round(r.p_away)}<br>`;
    html += `Banko: ${r.banko.length>0 ? r.banko.map(b=>b.type).join(', ') : '-'}<br>`;
    html += `Value Bets: ${r.bets.length>0 ? r.bets.map(b=>b.type+' (+'+round(b.diff)+')').join(', ') : '-'}<br>`;
    card.innerHTML = html;
    out.appendChild(card);
  });

  // save most recent results to localStorage for offline persistence
  localStorage.setItem('lastResults', JSON.stringify(results));
});

function round(x){ return (Math.round(x*1000)/1000).toFixed(3); }

document.getElementById('exportJson').addEventListener('click', ()=>{
  const data = localStorage.getItem('lastResults') || '[]';
  const blob = new Blob([data], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'kupon_gunluk.json'; document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 1000);
});

// on load: restore matches if present
window.addEventListener('load', ()=>{
  const last = localStorage.getItem('lastMatches');
  if(last){
    try{
      const arr = JSON.parse(last);
      document.getElementById('matches').innerHTML='';
      arr.forEach(a=>addMatch(a));
    }catch(e){ /* ignore */ }
  } else {
    // add one empty match by default
    addMatch({});
  }
});

// save matches before unload
window.addEventListener('beforeunload', ()=>{
  const matchEls = Array.from(document.querySelectorAll('.match'));
  const arr = matchEls.map(el=>{
    return {
      home: el.querySelector('.home').value || '',
      away: el.querySelector('.away').value || '',
      home_gpm: parseFloat(el.querySelector('.home_gpm').value)||1.2,
      away_gpm: parseFloat(el.querySelector('.away_gpm').value)||1.2,
      home_odds: parseFloat(el.querySelector('.home_odds').value)||null,
      draw_odds: parseFloat(el.querySelector('.draw_odds').value)||null,
      away_odds: parseFloat(el.querySelector('.away_odds').value)||null,
    };
  });
  localStorage.setItem('lastMatches', JSON.stringify(arr));
});

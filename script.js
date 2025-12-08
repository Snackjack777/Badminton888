// Main logic for Badminton Court Manager (Queue, Elo, Scoreboard, History, Export)

// Utility
function timeToMinutes(t){ if(!t) return 0; const [h,m]=t.split(':').map(Number); return h*60+m; }
function toHM(m){ const h=Math.floor(m/60); const mm=m%60; return String(h).padStart(2,'0')+':'+String(mm).padStart(2,'0'); }
function fmtMoney(x){ return Number(x).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) }

// State
let players = [];
let teams = {}; // name -> {name,elo,w,l,streak}
let queue = [];
let court = {t1:null,t2:null};
let history = []; // {winner,loser,time,score1,score2}

// --- Fee calc UI ---
document.addEventListener('DOMContentLoaded', ()=>{
  // Elements
  const playersTbody = document.querySelector('#playersTable tbody');
  const feeResult = document.getElementById('feeResult');
  const addPlayerBtn = document.getElementById('addPlayerBtn');
  const calcFeesBtn = document.getElementById('calcFees');
  const fillExampleBtn = document.getElementById('fillExample');

  // Add player
  if(addPlayerBtn) addPlayerBtn.addEventListener('click', ()=>{
    const name = document.getElementById('playerName').value.trim();
    const s = document.getElementById('playerStart').value;
    const e = document.getElementById('playerEnd').value;
    if(!name || !s || !e) return alert('กรอกข้อมูลให้ครบ');
    const start = timeToMinutes(s), end = timeToMinutes(e);
    if(end <= start) return alert('เวลาออกต้องมากกว่าเวลาเข้า');
    players.push({name,start,end});
    renderPlayers();
  });

  function renderPlayers(){
    if(!playersTbody) return;
    playersTbody.innerHTML = '';
    players.forEach((p,i)=>{
      const tr = document.createElement('tr');
      const mins = Math.max(0, p.end - p.start);
      tr.innerHTML = `<td>${p.name}</td><td>${toHM(p.start)}</td><td>${toHM(p.end)}</td><td>${mins}</td><td><button data-i="${i}" class="btn-small">ลบ</button></td>`;
      playersTbody.appendChild(tr);
    });
    playersTbody.querySelectorAll('button').forEach(b=> b.addEventListener('click', ()=>{ players.splice(+b.dataset.i,1); renderPlayers(); }));
  }

  if(calcFeesBtn) calcFeesBtn.addEventListener('click', ()=>{
    const hourly = Number(document.getElementById('hourlyRate').value) || 0;
    const bS = timeToMinutes(document.getElementById('bookingStart').value || '00:00');
    const bE = timeToMinutes(document.getElementById('bookingEnd').value || '00:00');
    if(bE <= bS) return alert('ช่วงจองไม่ถูกต้อง');
    const totalBookingMinutes = bE - bS;
    const totalCost = hourly * (totalBookingMinutes/60);
    const details = players.map(p=>{
      const start = Math.max(p.start, bS);
      const end = Math.min(p.end, bE);
      const mins = Math.max(0, end - start);
      return {...p, mins};
    }).filter(d=>d.mins>0);
    const sumMins = details.reduce((s,d)=>s+d.mins,0);
    if(sumMins === 0) return feeResult.innerHTML = '<div class="muted">ไม่มีผู้เล่นในช่วงจอง</div>';
    let html = `<div><strong>รวมค่าเช่า:</strong> ${fmtMoney(totalCost)} บาท (ช่วง ${toHM(bS)} - ${toHM(bE)} = ${totalBookingMinutes} นาที)</div>`;
    html += `<table><thead><tr><th>ชื่อ</th><th>เวลา(นาที)</th><th>สัดส่วน</th><th>ต้องจ่าย(บาท)</th></tr></thead><tbody>`;
    details.forEach(d=>{
      const share = d.mins / sumMins;
      const amt = totalCost * share;
      html += `<tr><td>${d.name}</td><td>${d.mins}</td><td>${(share*100).toFixed(2)}%</td><td>${fmtMoney(amt)}</td></tr>`;
    });
    html += `</tbody></table><div class="muted" style="margin-top:8px">หมายเหตุ: ผู้จอง (ถ้า A จ่ายแล้ว) คนอื่นต้องคืนให้ A ตามจำนวนที่คำนวณ</div>`;
    feeResult.innerHTML = html;
  });

  if(fillExampleBtn) fillExampleBtn.addEventListener('click', ()=>{
    document.getElementById('hourlyRate').value = 100;
    document.getElementById('bookingStart').value = '18:00';
    document.getElementById('bookingEnd').value = '23:00';
    players = [
      {name:'A',start:timeToMinutes('18:00'),end:timeToMinutes('23:00')},
      {name:'B',start:timeToMinutes('18:30'),end:timeToMinutes('20:00')},
      {name:'C',start:timeToMinutes('19:45'),end:timeToMinutes('23:00')},
      {name:'D',start:timeToMinutes('18:00'),end:timeToMinutes('22:00')},
    ];
    renderPlayers();
    calcFeesBtn.click();
  });

  // Queue and Elo wiring
  const addTeamBtn = document.getElementById('addTeamBtn');
  const startQueueBtn = document.getElementById('startQueueBtn');
  const nextMatchBtn = document.getElementById('nextMatchBtn');
  const resetQueueBtn = document.getElementById('resetQueueBtn');
  const recordWinBtn = document.getElementById('recordWinBtn');
  const queueListEl = document.getElementById('queueList');
  const courtEl = document.getElementById('court');
  const winnerSelect = document.getElementById('winnerSelect');
  const ratingBody = document.querySelector('#ratingTable tbody');
  const historyList = document.getElementById('historyList');
  const exportBtn = document.getElementById('exportCsv');

  function ensureTeam(n){ if(!teams[n]) teams[n] = {name:n, elo:1500, w:0, l:0, streak:0}; }

  if(addTeamBtn) addTeamBtn.addEventListener('click', ()=>{
    const name = document.getElementById('teamNameInput').value.trim();
    if(!name) return;
    ensureTeam(name); queue.push(name); saveState(); renderQueue(); renderRatings();
    document.getElementById('teamNameInput').value='';
  });

  if(startQueueBtn) startQueueBtn.addEventListener('click', ()=>{
    if(queue.length < 2) return alert('ต้องมีทีมในคิวอย่างน้อย 2 ทีม');
    if(!court.t1 && !court.t2){
      court.t1 = queue.shift(); court.t2 = queue.shift();
      renderCourt(); renderQueue(); renderRatings();
      updateScoreboardFromCourt();
    }
  });

  if(nextMatchBtn) nextMatchBtn.addEventListener('click', ()=>{
    if(queue.length >=2 && (!court.t1 && !court.t2)){
      court.t1 = queue.shift(); court.t2 = queue.shift(); renderCourt(); renderQueue(); updateScoreboardFromCourt();
    } else {
      alert('หากต้องการบันทึกผล ให้เลือกผู้ชนะแล้วกด บันทึกผล');
    }
  });

  if(resetQueueBtn) resetQueueBtn.addEventListener('click', ()=>{
    if(!confirm('รีเซ็ตคิวและเรตติ้ง?')) return;
    teams = {}; queue = []; court = {t1:null,t2:null}; history = []; saveState(); renderAll(); updateHistory(); updateScoreboardFromCourt();
  });

  function renderQueue(){ if(!queueListEl) return; queueListEl.innerHTML = ''; queue.forEach((t,i)=>{ const d = document.createElement('div'); d.textContent = `${i+1}. ${t}`; d.style.padding='4px 0'; queueListEl.appendChild(d); }); }

  function renderCourt(){
    if(!courtEl) return;
    if(!court.t1 || !court.t2){ courtEl.innerHTML = '(ยังไม่มีทีมเล่น)'; if(winnerSelect) winnerSelect.innerHTML=''; return; }
    courtEl.innerHTML = `<strong>${court.t1}</strong> vs <strong>${court.t2}</strong>`;
    if(winnerSelect) winnerSelect.innerHTML = `<option value="${court.t1}">${court.t1}</option><option value="${court.t2}">${court.t2}</option>`;
  }

  function renderRatings(){ if(!ratingBody) return; ratingBody.innerHTML=''; const arr = Object.values(teams).sort((a,b)=>b.elo-a.elo); arr.forEach(t=>{ const tr = document.createElement('tr'); tr.innerHTML = `<td>${t.name}</td><td>${Math.round(t.elo)}</td><td>${t.w}</td><td>${t.l}</td><td>${t.streak||0}</td>`; ratingBody.appendChild(tr); }); }

  // Elo helpers
  function expectedScore(rA,rB){ return 1/(1+Math.pow(10,(rB-rA)/400)); }
  function applyElo(winner,loser,k){
    const Rw = teams[winner].elo, Rl = teams[loser].elo;
    const Ew = expectedScore(Rw,Rl), El = expectedScore(Rl,Rw);
    teams[winner].elo = Rw + k*(1 - Ew);
    teams[loser].elo = Rl + k*(0 - El);
  }

  if(recordWinBtn) recordWinBtn.addEventListener('click', ()=>{
    const winner = winnerSelect ? winnerSelect.value : null;
    if(!winner) return alert('ไม่มีทีมในคอร์ท');
    const loser = (court.t1 === winner ? court.t2 : court.t1);
    const k = Number(document.getElementById('kFactor').value) || 32;
    ensureTeam(winner); ensureTeam(loser);
    // read current scoreboard values
    const score1 = Number(document.getElementById('team1Score').textContent || 0);
    const score2 = Number(document.getElementById('team2Score').textContent || 0);

    teams[winner].w += 1; teams[loser].l += 1;
    teams[winner].streak = (teams[winner].streak||0) + 1; teams[loser].streak = 0;
    applyElo(winner,loser,k);
    history.unshift({winner, loser, time: new Date().toISOString(), score1, score2});

    const winLimit = Number(document.getElementById('winStreakLimit').value) || 2;
    if(teams[winner].streak >= winLimit){
      teams[winner].streak = 0; teams[loser].streak = 0;
      queue.push(winner); queue.push(loser);
      court.t1 = null; court.t2 = null;
    } else {
      queue.push(loser);
      const next = queue.shift();
      if(next){ court.t1 = winner; court.t2 = next; }
      else { court.t1 = winner; court.t2 = null; alert('ไม่มีทีมถัดไปในคิว ให้เพิ่มทีม'); }
    }
    saveState(); renderAll(); updateHistory(); updateScoreboardFromCourt();
  });

  function updateHistory(){
    if(!historyList) return; historyList.innerHTML='';
    if(history.length===0){ historyList.innerHTML = '<div class="muted">ยังไม่มีประวัติ</div>'; return; }
    const ul = document.createElement('ul'); ul.style.paddingLeft='16px';
    history.forEach(h => {
      const li = document.createElement('li');
      li.style.marginBottom='6px';
      li.textContent = `${h.time.split('T')[0]} | ${h.winner} beat ${h.loser} (${h.score1}:${h.score2})`;
      ul.appendChild(li);
    });
    historyList.appendChild(ul);
  }

  function exportCsv(){
    if(history.length===0) return alert('ไม่มีข้อมูลส่งออก');
    const header = ['time','winner','loser','score1','score2'];
    const rows = history.map(h => [h.time, h.winner, h.loser, h.score1, h.score2]);
    const csv = [header.join(','), ...rows.map(r=> r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'match_history.csv'; a.click(); URL.revokeObjectURL(url);
  }

  if(exportBtn) exportBtn.addEventListener('click', exportCsv);

  function updateScoreboardFromCourt(){
    // set names based on court
    document.getElementById('team1Name').textContent = court.t1 || 'Team 1';
    document.getElementById('team2Name').textContent = court.t2 || 'Team 2';
    resetMatchScore();
  }

  // Scoreboard functions
  window.changeScore = function(team, action){
    const el = document.getElementById(team===1 ? 'team1Score' : 'team2Score');
    let v = Number(el.textContent) || 0;
    v = (action==='plus') ? v+1 : Math.max(0, v-1);
    el.textContent = v;
  };
  window.resetMatchScore = function(){
    document.getElementById('team1Score').textContent = '0';
    document.getElementById('team2Score').textContent = '0';
  };

  // State persistence
  function saveState(){ try{ localStorage.setItem('badminton_state', JSON.stringify({teams,queue,court,history})); }catch(e){} }
  function loadState(){ const s = localStorage.getItem('badminton_state'); if(!s) return; try{ const obj = JSON.parse(s); teams = obj.teams || {}; queue = obj.queue || []; court = obj.court || {t1:null,t2:null}; history = obj.history || []; }catch(e){} }

  function renderAll(){ renderQueue(); renderCourt(); renderRatings(); updateHistory(); updateScoreboardFromCourt(); }

  // initial load
  loadState(); renderAll();

}); // DOMContentLoaded end

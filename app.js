// --- Data Structures ---
let players = JSON.parse(localStorage.getItem('badminton_players')) || [];
let queue = JSON.parse(localStorage.getItem('badminton_queue')) || [];
let matches = JSON.parse(localStorage.getItem('badminton_matches')) || [];
let activeCourts = [];
let matchPlan = JSON.parse(localStorage.getItem('badminton_plan')) || [];
const K_FACTOR = 32;

// --- Core Functions ---

function save() {
    localStorage.setItem('badminton_players', JSON.stringify(players));
    localStorage.setItem('badminton_queue', JSON.stringify(queue));
    localStorage.setItem('badminton_matches', JSON.stringify(matches));
}

function addPlayer() {
    const nameInput = document.getElementById('playerName');
    if (!nameInput.value) return;

    // ตรวจสอบชื่อซ้ำ
    const existingPlayer = players.find(p => p.name.toLowerCase() === nameInput.value.toLowerCase());
    if (existingPlayer) {
        // ถ้ามีผู้เล่นชื่อนี้อยู่แล้ว ให้เพิ่มเข้าคิวเลย (ถ้ายังไม่เคยอยู่ในคิว)
        if (!queue.includes(existingPlayer.id)) {
            queue.push(existingPlayer.id);
            save();
            renderAll();
            alert(`เพิ่ม ${existingPlayer.name} เข้าคิวเรียบร้อย (มีชื่อในระบบอยู่แล้ว)`);
        } else {
            alert(`${existingPlayer.name} อยู่ในคิวอยู่แล้ว`);
        }
        nameInput.value = '';
        return;
    }

    // ถ้ายังไม่มีชื่อนี้ในระบบ ให้สร้างผู้เล่นใหม่
    const newPlayer = {
        id: Date.now(),
        name: nameInput.value,
        rating: 1000,
        wins: 0,
        losses: 0,
        history: []
    };

    players.push(newPlayer);
    queue.push(newPlayer.id);
    nameInput.value = '';
    save();
    renderAll();
}

// AI Matchmaking Logic
function findBestTeamSplit(fourPlayers) {
    // fourPlayers: Array of 4 player objects
    const combinations = [
        { t1: [0, 1], t2: [2, 3] },
        { t1: [0, 2], t2: [1, 3] },
        { t1: [0, 3], t2: [1, 2] }
    ];

    let bestSplit = null;
    let minDiff = Infinity;

    combinations.forEach(combo => {
        const ratingT1 = fourPlayers[combo.t1[0]].rating + fourPlayers[combo.t1[1]].rating;
        const ratingT2 = fourPlayers[combo.t2[0]].rating + fourPlayers[combo.t2[1]].rating;
        const diff = Math.abs(ratingT1 - ratingT2);

        // Anti-Repeat Partner Check (Simplified)
        const p0 = fourPlayers[combo.t1[0]];
        const p1 = fourPlayers[combo.t1[1]];
        const hasRecentlyPaired = p0.history.slice(-1).includes(p1.id);

        let score = diff + (hasRecentlyPaired ? 500 : 0);

        if (score < minDiff) {
            minDiff = score;
            bestSplit = {
                teamA: [fourPlayers[combo.t1[0]], fourPlayers[combo.t1[1]]],
                teamB: [fourPlayers[combo.t2[0]], fourPlayers[combo.t2[1]]]
            };
        }
    });

    return bestSplit;
}

function autoMatch() {
    const courtLimit = parseInt(document.getElementById('courtCount').value);
    
    while (queue.length >= 4 && activeCourts.length < courtLimit) {
        // ดึง 4 คนแรกจาก Queue
        const selectedIds = queue.splice(0, 4);
        const selectedPlayers = selectedIds.map(id => players.find(p => p.id === id));
        
        const bestMatch = findBestTeamSplit(selectedPlayers);
        
        activeCourts.push({
            id: Date.now() + Math.random(),
            ...bestMatch
        });
    }
    save();
    renderAll();
    showView('courts');
}

// ELO Calculation
function updateELO(winnerTeam, loserTeam) {
    const avgWin = (winnerTeam[0].rating + winnerTeam[1].rating) / 2;
    const avgLose = (loserTeam[0].rating + loserTeam[1].rating) / 2;

    const expectedWin = 1 / (1 + Math.pow(10, (avgLose - avgWin) / 400));
    
    winnerTeam.forEach(p => {
        p.rating = Math.round(p.rating + K_FACTOR * (1 - expectedWin));
        p.wins++;
    });
    
    loserTeam.forEach(p => {
        p.rating = Math.round(p.rating + K_FACTOR * (0 - (1 - expectedWin)));
        p.losses++;
    });
}

function finishMatch(courtId, winner) {
    const courtIdx = activeCourts.findIndex(c => c.id === courtId);
    const court = activeCourts[courtIdx];
    
    const teamA = court.teamA;
    const teamB = court.teamB;

    if (winner === 'A') {
        updateELO(teamA, teamB);
    } else {
        updateELO(teamB, teamA);
    }

    // อัปเดตเวลาที่เล่นล่าสุด
    updatePlayerLastPlayed(teamA);
    updatePlayerLastPlayed(teamB);

    // บันทึกประวัติคู่หู
    teamA[0].history.push(teamA[1].id);
    teamA[1].history.push(teamA[0].id);
    teamB[0].history.push(teamB[1].id);
    teamB[1].history.push(teamB[0].id);

    // ส่งกลับเข้าคิว (ตรวจสอบไม่ให้ซ้ำ)
    [...teamA, ...teamB].forEach(p => {
        if (!queue.includes(p.id)) {
            queue.push(p.id);
        }
    });

    activeCourts.splice(courtIdx, 1);
    save();
    renderAll();
}
function getPlayerLastPlayedTime(playerId) {
    const player = players.find(p => p.id === playerId);
    if (player && player.lastPlayed) {
        return player.lastPlayed;
    }
    return null;
}

// อัปเดตเวลาที่เล่นล่าสุดเมื่อจบแมตช์
function updatePlayerLastPlayed(team) {
    const now = Date.now();
    team.forEach(p => {
        p.lastPlayed = now;
    });
}

function deduplicateQueue() {
    const uniqueQueue = [];
    const seen = new Set();
    
    queue.forEach(id => {
        if (!seen.has(id)) {
            seen.add(id);
            uniqueQueue.push(id);
        }
    });
    
    if (uniqueQueue.length !== queue.length) {
        queue = uniqueQueue;
        save();
        console.log(`ลบคิวซ้ำออก ${queue.length - uniqueQueue.length} รายการ`);
    }
}
// --- UI Rendering ---

function renderAll() {
    deduplicateQueue(); // เพิ่มบรรทัดนี้เพื่อล้างคิวซ้ำก่อนแสดงผล
    renderPlayers();
    renderQueue();
    renderCourts();
    renderLeaderboard();
    renderMatchPlan();
    updateQueueCount();
}

function updateQueueCount() {
    const queueCountSpan = document.getElementById('queueCount');
    if (queueCountSpan) {
        queueCountSpan.textContent = `${queue.length} คน`;
    }
}

function renderPlayers() {
    const container = document.getElementById('playerList');
    container.innerHTML = players.map(p => `
        <div class="player-card">
            <div>
                <strong>${p.name}</strong><br>
                <small>Rating: ${p.rating}</small>
            </div>
            <button onclick="deletePlayer(${p.id})" class="btn-danger"><i class="fas fa-trash"></i></button>
        </div>
    `).join('');
}

function renderQueue() {
    const container = document.getElementById('queueList');
    
    if (queue.length === 0) {
        container.innerHTML = '<p class="empty-msg">ยังไม่มีผู้เล่นในคิว...</p>';
        return;
    }

    // สร้าง HTML แสดงคิวแบบมีลำดับ
    let html = '<div class="queue-container">';
    
    // แสดง 4 คนถัดไปที่จะได้ลงเล่น (Next Players)
    if (queue.length >= 4) {
        html += '<div class="next-players-card">';
        html += '<h3><i class="fas fa-arrow-right"></i> ผู้เล่นถัดไป (จะได้ลงสนาม)</h3>';
        html += '<div class="next-players-grid">';
        
        for (let i = 0; i < 4; i++) {
            const player = players.find(p => p.id === queue[i]);
            if (player) {
                html += `
                    <div class="next-player-item">
                        <span class="queue-number">${i + 1}</span>
                        <span class="player-name">${player.name}</span>
                        <span class="player-rating">${player.rating}</span>
                    </div>
                `;
            }
        }
        
        html += '</div>';
        html += '</div>';
    }

    // แสดงคิวที่เหลือ (Waiting Queue)
    html += '<div class="waiting-queue">';
    html += '<h4><i class="fas fa-clock"></i> คิวที่เหลือ</h4>';
    
    queue.forEach((id, index) => {
        const player = players.find(p => p.id === id);
        if (player) {
            const position = index + 1;
            const isNextFour = index < 4;
            
            html += `
                <div class="queue-item ${isNextFour ? 'next-four' : ''}">
                    <span class="queue-position">#${position}</span>
                    <span class="player-name">${player.name}</span>
                    <span class="player-rating">${player.rating}</span>
                </div>
            `;
        }
    });
    
    html += '</div>';
    html += '</div>';
    
    container.innerHTML = html;
}

function renderCourts() {
    const container = document.getElementById('courtContainer');
    container.innerHTML = activeCourts.map((c, i) => `
        <div class="court-card">
            <h3>สนาม ${i + 1}</h3>
            <div class="match-box">
                <div class="team">
                    <strong>${c.teamA[0].name} & ${c.teamA[1].name}</strong><br>
                    <small>Rating: ${c.teamA[0].rating + c.teamA[1].rating}</small>
                    <button class="btn-success mt-1" onclick="finishMatch(${c.id}, 'A')">Team A Win</button>
                </div>
                <div class="vs">VS</div>
                <div class="team">
                    <strong>${c.teamB[0].name} & ${c.teamB[1].name}</strong><br>
                    <small>Rating: ${c.teamB[0].rating + c.teamB[1].rating}</small>
                    <button class="btn-success mt-1" onclick="finishMatch(${c.id}, 'B')">Team B Win</button>
                </div>
            </div>
        </div>
    `).join('');
}

function renderLeaderboard() {
    const sorted = [...players].sort((a, b) => b.rating - a.rating);
    const body = document.getElementById('leaderboardBody');
    body.innerHTML = sorted.map((p, i) => {
        const total = p.wins + p.losses;
        const rate = total ? ((p.wins / total) * 100).toFixed(1) : 0;
        return `
            <tr>
                <td>${i + 1}</td>
                <td>${p.name}</td>
                <td>${p.rating}</td>
                <td>${p.wins}/${p.losses}</td>
                <td>${rate}%</td>
            </tr>
        `;
    }).join('');
}

function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    document.getElementById(viewId).style.display = 'block';
    
    // ถ้าหน้าคือ queue ให้สั่งอัปเดต Dropdown ทันที
    if (viewId === 'queue') {
        updateManualSelectors();
    }
    renderAll();
}

function deletePlayer(id) {
    players = players.filter(p => p.id !== id);
    queue = queue.filter(qid => qid !== id);
    save();
    renderAll();
}

// ฟังก์ชันสำหรับอัปเดตรายชื่อใน Dropdown (Select)
function updateManualSelectors() {
    const playerSelectors = ['player1', 'player2', 'player3', 'player4'];
    const courtSelector = document.getElementById('targetCourt');
    
    playerSelectors.forEach(id => {
        const select = document.getElementById(id);
        const currentValue = select.value;
        
        select.innerHTML = '<option value="">เลือกผู้เล่น</option>';
        
        // แสดงเฉพาะผู้เล่นที่อยู่ในคิวเท่านั้น
        queue.forEach(playerId => {
            const player = players.find(p => p.id == playerId);
            if (player) {
                const option = document.createElement('option');
                option.value = player.id;
                option.textContent = player.name;
                select.appendChild(option);
            }
        });
        select.value = currentValue; 
    });

    // ส่วนของสนาม
    courtSelector.innerHTML = '<option value="">เลือกสนาม</option>';
    const courtLimit = parseInt(document.getElementById('courtCount')?.value || 2);
    for (let i = 0; i < courtLimit; i++) {
        // เช็คว่าสนาม i นี้อยู่ใน activeCourts หรือยัง
        const isOccupied = activeCourts.some(c => c.index === i);
        if (!isOccupied) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = `สนามที่ ${i + 1}`;
            courtSelector.appendChild(option);
        }
    }
}

function manualMatch() {
    const p1 = document.getElementById('player1').value;
    const p2 = document.getElementById('player2').value;
    const p3 = document.getElementById('player3').value;
    const p4 = document.getElementById('player4').value;
    const courtIndex = document.getElementById('targetCourt').value;

    const selectedIds = [p1, p2, p3, p4].filter(id => id !== "");

    // 1. ตรวจสอบเงื่อนไข
    if (selectedIds.length < 4) {
        alert("กรุณาเลือกผู้เล่นให้ครบ 4 คน");
        return;
    }
    if (new Set(selectedIds).size !== 4) {
        alert("ห้ามเลือกผู้เล่นซ้ำกัน");
        return;
    }
    if (courtIndex === "") {
        alert("กรุณาเลือกสนาม");
        return;
    }

    // 2. แปลง ID เป็น Object ผู้เล่น และลบออกจาก Queue
    const matchPlayers = selectedIds.map(id => {
        const numericId = parseInt(id);
        const player = players.find(p => p.id === numericId);
        
        // ลบ ID ออกจาก queue
        const qIdx = queue.indexOf(numericId);
        if (qIdx > -1) queue.splice(qIdx, 1);
        
        return player;
    });

    // 3. เพิ่มลงใน activeCourts (ใช้โครงสร้างเดียวกับ autoMatch)
    activeCourts.push({
        id: Date.now() + Math.random(),
        courtNum: parseInt(courtIndex) + 1,
        teamA: [matchPlayers[0], matchPlayers[1]],
        teamB: [matchPlayers[2], matchPlayers[3]]
    });

    // 4. บันทึกและแสดงผลใหม่
    save();
    renderAll();
    updateManualSelectors(); // รีเฟรชรายชื่อในช่องเลือก
    alert(`จัดสนามที่ ${parseInt(courtIndex) + 1} เรียบร้อยแล้ว`);
}

function generateTournament() {
    if (players.length < 4) {
        alert("ต้องมีผู้เล่นอย่างน้อย 4 คน");
        return;
    }

    matchPlan = [];
    let tempPlayers = [...players];
    
    let round = 1;
    for (let i = 0; i < tempPlayers.length; i += 4) {
        if (i + 3 < tempPlayers.length) {
            matchPlan.push({
                round: round,
                teamA: [tempPlayers[i], tempPlayers[i+1]],
                teamB: [tempPlayers[i+2], tempPlayers[i+3]],
                status: 'scheduled'
            });
            if (matchPlan.length % 2 === 0) round++;
        }
    }
    renderMatchPlan();
}

function editMatchPlayer(matchId, team, playerIndex, newPlayerId) {
    const match = matchPlan.find(m => m.id === matchId);
    const newPlayer = players.find(p => p.id == newPlayerId);
    if (match && newPlayer) {
        match[team][playerIndex] = newPlayer;
        save();
        renderMatchPlan();
    }
}

// --- Tournament Planning Data ---

// ฟังก์ชันบันทึกข้อมูลแผนการแข่ง
function savePlan() {
    localStorage.setItem('badminton_plan', JSON.stringify(matchPlan));
}

// 1. ฟังก์ชันเพิ่มคู่แข่งใหม่เข้าไปในรอบ (ที่เกิด Error)
function addNewMatchToRound() {
    const roundNumber = prompt("ระบุลำดับรอบที่ต้องการเพิ่ม (เช่น 1, 2, 3):", "1");
    if (!roundNumber) return;

    const newMatch = {
        id: Date.now(),
        round: parseInt(roundNumber),
        teamA: [players[0] || {name: 'รอกำหนด'}, players[1] || {name: 'รอกำหนด'}],
        teamB: [players[2] || {name: 'รอกำหนด'}, players[3] || {name: 'รอกำหนด'}],
        status: 'scheduled'
    };

    matchPlan.push(newMatch);
    savePlan();
    renderMatchPlan();
}

// 2. ฟังก์ชันแสดงผลตารางการแข่งล่วงหน้า
function renderMatchPlan() {
    const container = document.getElementById('matchPlanList');
    if (!container || matchPlan.length === 0) {
        container.innerHTML = '<p class="empty-msg">ยังไม่มีการจัดตารางล่วงหน้า</p>';
        return;
    }

    // จัดกลุ่มแมตช์ตามเลขรอบ
    const rounds = {};
    matchPlan.forEach(m => {
        if (!rounds[m.round]) rounds[m.round] = [];
        rounds[m.round].push(m);
    });

    // เรียงลำดับรอบและสร้าง HTML
    container.innerHTML = Object.keys(rounds).sort((a, b) => a - b).map(roundNum => `
        <div class="round-group">
            <h2 class="round-header">--- รอบที่ ${roundNum} ---</h2>
            ${rounds[roundNum].map(m => `
                <div class="card mt-1" style="border-left: 5px solid #3498db;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span><i class="fas fa-table-tennis"></i> แมตช์ในรอบ</span>
                        <button onclick="deleteMatch(${m.id})" class="btn-danger" style="padding:2px 8px;">ลบ</button>
                    </div>
                    <div class="player-selection-grid mt-1">
                        <div class="team-select">
                            <select onchange="updatePlannedPlayer(${m.id}, 'teamA', 0, this.value)">
                                ${generatePlayerOptions(m.teamA[0].id)}
                            </select>
                            <select onchange="updatePlannedPlayer(${m.id}, 'teamA', 1, this.value)">
                                ${generatePlayerOptions(m.teamA[1].id)}
                            </select>
                        </div>
                        <div class="vs-divider">VS</div>
                        <div class="team-select">
                            <select onchange="updatePlannedPlayer(${m.id}, 'teamB', 0, this.value)">
                                ${generatePlayerOptions(m.teamB[0].id)}
                            </select>
                            <select onchange="updatePlannedPlayer(${m.id}, 'teamB', 1, this.value)">
                                ${generatePlayerOptions(m.teamB[1].id)}
                            </select>
                        </div>
                    </div>
                    <button onclick="sendToCourt(${m.id})" class="btn-success mt-1" style="width:100%">
                        เริ่มการแข่งขัน (ส่งลงสนาม)
                    </button>
                </div>
            `).join('')}
        </div>
    `).join('');
}

// ฟังก์ชันสร้างตัวเลือกผู้เล่นใน Dropdown
function generatePlayerOptions(selectedId) {
    return players.map(p => `
        <option value="${p.id}" ${p.id == selectedId ? 'selected' : ''}>${p.name}</option>
    `).join('');
}

// ฟังก์ชันแก้ไขชื่อสมาชิกในทีม
function updatePlannedPlayer(matchId, team, index, newPlayerId) {
    const match = matchPlan.find(m => m.id === matchId);
    const player = players.find(p => p.id == newPlayerId);
    if (match && player) {
        match[team][index] = player;
        savePlan();
    }
}

// ฟังก์ชันลบคู่ออก
function deleteMatch(matchId) {
    matchPlan = matchPlan.filter(m => m.id !== matchId);
    savePlan();
    renderMatchPlan();
}

// ฟังก์ชันส่งคู่ที่จัดไว้ลงสนามจริง
function sendToCourt(matchId) {
    const match = matchPlan.find(m => m.id === matchId);
    if (!match) return;

    activeCourts.push({
        id: Date.now(),
        teamA: match.teamA,
        teamB: match.teamB
    });

    // ลบออกจากตารางล่วงหน้าเมื่อเริ่มแข่งแล้ว
    deleteMatch(matchId);
    showView('courts');
    renderAll();
}

// --- Round Robin Tournament Logic ---

function generateRoundRobin() {
    if (players.length < 4) {
        alert("ต้องมีผู้เล่นอย่างน้อย 4 คน");
        return;
    }

    matchPlan = [];
    let pool = [...players].sort(() => Math.random() - 0.5);
    
    let matchIdx = 0;
    for (let i = 0; i < pool.length; i += 4) {
        if (i + 3 < pool.length) {
            matchIdx++;
            matchPlan.push({
                id: Date.now() + Math.random(),
                round: Math.ceil(matchIdx / 2),
                teamA: [pool[i], pool[i+1]],
                teamB: [pool[i+2], pool[i+3]],
                status: 'scheduled'
            });
        }
    }
    
    savePlan();
    renderAll();
}

// เพิ่มตัวแปรสำหรับเก็บผลการแข่งชั่วคราวในแต่ละรอบ
let winnersOfRound = [];

function generateTournamentBracket() {
    const activePlayers = [...players];
    if (activePlayers.length < 4) {
        alert("ต้องมีอย่างน้อย 4 คนเพื่อเริ่มทัวร์นาเมนต์");
        return;
    }

    matchPlan = [];
    createRound(activePlayers, 1);
    savePlan();
    renderMatchPlan();
}

function createRound(playerList, roundNumber) {
    let pool = [...playerList].sort(() => Math.random() - 0.5);
    
    while (pool.length >= 4) {
        matchPlan.push({
            id: Date.now() + Math.random(),
            round: roundNumber,
            teamA: [pool.shift(), pool.shift()],
            teamB: [pool.shift(), pool.shift()],
            winner: null
        });
    }

    pool.forEach(p => {
        winnersOfRound.push(p); 
        matchPlan.push({
            id: Date.now() + Math.random(),
            round: roundNumber,
            isBye: true,
            player: p
        });
    });
}

// Initial Load
renderAll();
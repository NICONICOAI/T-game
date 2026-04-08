const cvs = document.getElementById("gameCanvas");
const ctx = cvs.getContext("2d");
let w = cvs.width = window.innerWidth, h = cvs.height = window.innerHeight;

// --- 遊戲狀態與基礎數據 ---
let state = 'START', lastF = 0, totalSpawned = 0, killedCount = 0;
let pX = w / 2, tarX = w / 2, hasAllIn = true, isPaused = false;
let bts = [], snake = [], dmgs = [], upgradeQueue = 0, path = [], stars = [], exps = [];
let spawnTimer = 0, spawnInterval = 16; 

const baseAtk = 100;
let atkAddPercent = 0, atk = 100, bCount = 1, fRate = 500, crit = 5, critDmg = 200, expRadius = 0;
let ownedTypes = ['normal'];

// --- 抽獎與升級池數據 ---
const rarities = [
    { n: "一般", c: "q-green", w: 50, m: 1 },
    { n: "優良", c: "q-blue", w: 25, m: 2 },
    { n: "稀有", c: "q-purple", w: 15, m: 3 },
    { n: "史詩", c: "q-red", w: 7, m: 5 },
    { n: "傳說", c: "q-gold", w: 3, m: 8 }
];

const upgPool = [
    { id: "atk", t: "攻擊力", getVal: (m) => `+${20*m}%`, fn: (m) => { atkAddPercent += (0.20 * m); atk = baseAtk * (1 + atkAddPercent); } },
    { id: "crt", t: "爆擊率", getVal: (m) => `+${5*m}%`, fn: (m) => crit = Math.min(100, crit + (5 * m)) },
    { id: "crd", t: "爆擊傷害", getVal: (m) => `+${25*m}%`, fn: (m) => critDmg += (25 * m) },
    { id: "qty", t: "子彈數量", getVal: (m) => `+${m}`, fn: (m) => bCount = Math.min(15, bCount + m) },
    { id: "exp", t: "爆破範圍", getVal: (m) => `+${Math.round(10*m)}`, fn: (m) => expRadius = Math.min(200, expRadius + Math.round(10 * m)) },
    { id: "spd", t: "射擊速度", getVal: (m) => `+${Math.round((0.07*m)*100)}%`, fn: (m) => { fRate = Math.max(80, fRate * (1 - (0.07 * m))); } }
];

const elementPool = [
    { id: "fire", t: "烈焰彈", desc: "大範圍爆炸傷害", fn: () => { if(!ownedTypes.includes('fire')) ownedTypes.push('fire'); } },
    { id: "ice", t: "極凍箭", desc: "50% 機率凍結減速", fn: () => { if(!ownedTypes.includes('ice')) ownedTypes.push('ice'); } },
    { id: "volt", t: "連鎖電", desc: "額外 80% 濺射傷害", fn: () => { if(!ownedTypes.includes('volt')) ownedTypes.push('volt'); } }
];

// 初始化星星（背景裝飾）
for(let i=0; i<80; i++) stars.push({x: Math.random()*w, y: Math.random()*h, s: Math.random()*2, o: Math.random(), sp: 0.01+Math.random()*0.02});

// --- 核心功能函式 ---

function createPath() {
    path = []; let cx = 30, cy = 65, d = 1;
    // 限制路徑長度，避免無效計算
    for(let i=0; i<5000; i++) {
        path.push({x: cx, y: cy}); cx += 2 * d;
        if(cx > w-35 || cx < 30) { d *= -1; for(let j=0; j<25; j++) { cy += 1; path.push({x: cx, y: cy}); } }
        if(cy > h) break; 
    }
}

function spawnNode() {
    totalSpawned++;
    let n = totalSpawned, wave = Math.floor((n - 1) / 50), isElite = (n % 50 === 0);
    let boxInt = (n <= 50) ? 5 : (n <= 150 ? 15 : 25), isBox = (!isElite && (n % boxInt === 0));
    let baseHP = 500 + (n * 60), finalHP = baseHP * Math.pow(1.14, wave);
    let hp = isElite ? finalHP * 8 : (isBox ? finalHP * 0.7 : finalHP);
    let dr = isElite ? Math.min(0.4, wave * 0.035) : 0;
    snake.push({ pIdx: 0, hp: hp, max: hp, isBox: isBox, isElite: isElite, dr: dr, isFrozen: false, freezeT: 0, dead: false, x: -100, y: -100 });
}

function startGame() {
    createPath(); // 確保開始時路徑已生成
    state = 'PLAYING'; killedCount = 0; totalSpawned = 0; upgradeQueue = 0; hasAllIn = true; spawnTimer = 0; isPaused = false;
    atk=100; atkAddPercent=0; bCount=1; fRate=500; crit=5; critDmg=200; expRadius=0; ownedTypes=['normal'];
    bts = []; snake = []; dmgs = []; exps = [];
    document.getElementById("start-menu").style.display = "none";
    document.getElementById("result-info").style.display = "none";
    document.getElementById("ctrl-btns").style.display = "flex";
}

function endGame() {
    state = 'GAMEOVER';
    const menu = document.getElementById("start-menu");
    menu.querySelector(".title-main").innerHTML = "<span style='color:#f00;'>防線崩潰</span>";
    document.getElementById("result-info").innerHTML = `最高波段: ${Math.floor((totalSpawned-1)/50)+1}<br>總擊殺數: ${killedCount}`;
    document.getElementById("result-info").style.display = "block";
    menu.querySelector("button").innerText = "重新部署 (RETRY)";
    menu.style.display = "flex";
}

function backToMenu() {
    state = 'START';
    isPaused = false;
    document.getElementById("start-menu").style.display = "flex";
    document.getElementById("start-menu").querySelector(".title-main").innerHTML = "進化守衛：無限防線";
    document.getElementById("upgrade-menu").style.display = "none";
    document.getElementById("ctrl-btns").style.display = "none";
}

function togglePause() {
    isPaused = !isPaused;
    document.getElementById("pause-btn").innerText = isPaused ? "繼續" : "暫停";
}

// --- 升級邏輯 ---
function showUpgrade(isEliteDrop = false) {
    if (state === 'UPGRADING') { upgradeQueue++; return; }
    state = 'UPGRADING';
    const menu = document.getElementById("upgrade-menu"), container = document.getElementById("upgrade-options");
    menu.style.display = "flex"; container.innerHTML = "";
    document.getElementById("all-in-btn").style.display = hasAllIn ? "block" : "none";
    document.getElementById("up-title").innerText = isEliteDrop ? "[ 精英戰利品 ]" : "[ 進化選擇 ]";
    window.currentOptions = [];

    if(isEliteDrop && Math.random() < 0.6 && ownedTypes.length < 4) {
        let untaken = elementPool.filter(e => !ownedTypes.includes(e.id));
        if(untaken.length > 0) {
            let e = untaken[Math.floor(Math.random()*untaken.length)];
            let b = document.createElement("button"); b.className = `btn q-gold`;
            b.innerHTML = `<span style="font-size:12px">[傳說屬性]</span><br>${e.t}<br><small>${e.desc}</small>`;
            let opt = { fn: () => e.fn() }; window.currentOptions.push(opt);
            b.onclick = () => { opt.fn(); resolveUpgrade(); }; container.appendChild(b);
        }
    }

    let availableUpg = upgPool.filter(u => {
        if(u.id === "qty" && bCount >= 15) return false;
        if(u.id === "spd" && fRate <= 80) return false;
        if(u.id === "exp" && expRadius >= 200) return false;
        if(u.id === "crt" && crit >= 100) return false;
        return true;
    });
    if(availableUpg.length === 0) availableUpg = [upgPool[0]];
    while(container.children.length < 3) {
        let upg = availableUpg[Math.floor(Math.random()*availableUpg.length)];
        let rr = Math.random()*100, sum=0, ra=rarities[0];
        for(let r of rarities){ sum+=r.w; if(rr<=sum){ ra=r; break; } }
        let b = document.createElement("button"); b.className = `btn ${ra.c}`;
        b.innerHTML = `<span style="font-size:12px">[${ra.n}]</span><br>${upg.t} ${upg.getVal(ra.m)}`;
        let opt = { fn: () => upg.fn(ra.m) }; window.currentOptions.push(opt);
        b.onclick = () => { opt.fn(); resolveUpgrade(); }; container.appendChild(b);
    }
}

function resolveUpgrade() {
    document.getElementById("upgrade-menu").style.display = "none";
    if (upgradeQueue > 0) { upgradeQueue--; state = 'PLAYING'; setTimeout(() => showUpgrade(false), 80); }
    else state = 'PLAYING';
}

function takeItAll() { hasAllIn = false; window.currentOptions.forEach(o => o.fn()); resolveUpgrade(); }

// --- 遊戲邏輯與繪圖 ---

function update() {
    if (state !== 'PLAYING' || isPaused) return; 
    spawnTimer++;
    if (spawnTimer >= spawnInterval) { spawnNode(); spawnTimer = 0; }
    pX += (tarX - pX) * 0.15;
    if (Date.now() - lastF > fRate) {
        let sA = -((bCount-1)*12)/2;
        for(let i=0; i<bCount; i++) bts.push({x:pX, y:h-90, a:(sA+i*12)*Math.PI/180, type: ownedTypes[Math.floor(Math.random()*ownedTypes.length)]});
        lastF = Date.now();
    }
    for(let bi = bts.length-1; bi >= 0; bi--) {
        let b = bts[bi]; b.y -= 14; b.x += Math.sin(b.a)*6;
        if(b.y < -20) { bts.splice(bi, 1); continue; }
        for(let si = 0; si < snake.length; si++) {
            let s = snake[si];
            if(!s.dead && b.x > s.x-5 && b.x < s.x+33 && b.y > s.y-5 && b.y < s.y+33) {
                let isC = Math.random()*100 < crit, dVal = isC ? Math.floor(atk * critDmg/100) : Math.floor(atk);
                let finalD = Math.floor(dVal * (1 - s.dr));
                s.hp -= finalD;
                s.pIdx = Math.max(0, s.pIdx - 1.5);
                dmgs.push({x:s.x, y:s.y, v:finalD, life:1, c:isC?"#ff0":"#fff", s:isC?22:14});
                if(b.type === 'ice') { s.isFrozen = true; s.freezeT = 60; }
                if(b.type === 'volt') s.hp -= finalD * 0.8;
                if(b.type === 'fire' || expRadius > 0) {
                    let isFire = b.type === 'fire';
                    let range = isFire ? 230 : expRadius;
                    exps.push({x: s.x+14, y: s.y+14, r: range, life: 1, c: isFire?'255,100,0':'200,200,255'});
                    snake.forEach(o => { 
                        if(!o.dead && o !== s && Math.hypot(o.x-s.x, o.y-s.y) < range) {
                            o.hp -= Math.floor(finalD * (isFire?0.6:0.35)); 
                        }
                    });
                }
                bts.splice(bi, 1); break;
            }
        }
    }
    for (let i = 0; i < snake.length; i++) {
        let s = snake[i]; if (s.dead) continue;
        let moveStep = s.isFrozen ? 0.35 : 0.72; 
        if (s.isFrozen) { s.freezeT--; if(s.freezeT <= 0) s.isFrozen = false; }
        s.pIdx += moveStep; 
        let ci = Math.floor(s.pIdx);
        if(ci >= 0 && ci < path.length) { 
            s.x = path[ci].x; s.y = path[ci].y; 
            if(s.y > h-100) { endGame(); return; } 
        }
        if(s.hp <= 0) {
            s.dead = true; killedCount++;
            if(s.isElite || s.isBox) showUpgrade(s.isElite);
        }
    }
    snake = snake.filter(s => !s.dead);
    dmgs.forEach((d, i) => { d.y -= 1; d.life -= 0.025; if(d.life <= 0) dmgs.splice(i, 1); });
    exps.forEach((e, i) => { e.life -= 0.05; if(e.life <= 0) exps.splice(i, 1); });
}

function draw() {
    ctx.fillStyle = "#000"; ctx.fillRect(0,0,w,h);
    stars.forEach(st => {
        ctx.fillStyle = `rgba(255,255,255,${st.o})`; ctx.fillRect(st.x, st.y, st.s, st.s);
        st.o += st.sp; if(st.o > 1 || st.o < 0) st.sp *= -1;
    });

    if (state === 'PLAYING' || state === 'UPGRADING' || state === 'GAMEOVER') {
        // UI 數值更新
        if(document.getElementById("nc")) document.getElementById("nc").innerText = killedCount;
        if(document.getElementById("wv")) document.getElementById("wv").innerText = Math.max(1, Math.floor((totalSpawned-1)/50)+1);
        if(document.getElementById("atk_d")) document.getElementById("atk_d").innerText = Math.floor(atk);
        if(document.getElementById("qty_d")) document.getElementById("qty_d").innerText = bCount;
        if(document.getElementById("spd_d")) document.getElementById("spd_d").innerText = Math.round(500/fRate*100) + "%";
        if(document.getElementById("crt_d")) document.getElementById("crt_d").innerText = (crit>=100?"MAX":Math.floor(crit))+"%";
        if(document.getElementById("crd_d")) document.getElementById("crd_d").innerText = critDmg + "%";
        if(document.getElementById("exp_d")) document.getElementById("exp_d").innerText = Math.floor(expRadius);
        if(document.getElementById("types_d")) document.getElementById("types_d").innerText = ownedTypes.join('/').toUpperCase();

        // 畫玩家
        ctx.shadowBlur = 15; ctx.shadowColor = "#0f0";
        ctx.fillStyle = "#0f0"; ctx.beginPath(); ctx.moveTo(pX, h-95); ctx.lineTo(pX-22, h-60); ctx.lineTo(pX+22, h-60); ctx.fill();
        ctx.shadowBlur = 0;
        
        // 畫蛇（怪物）
        snake.forEach(s => {
            let p = s.hp/s.max;
            if (s.isFrozen) { ctx.fillStyle = "#0ff"; ctx.shadowBlur = 10; ctx.shadowColor = "#0ff"; }
            else if (s.isBox) { ctx.fillStyle = "#ff0"; ctx.shadowBlur = 5; ctx.shadowColor = "#ff0"; }
            else if (s.isElite) { ctx.fillStyle = "#fff"; ctx.shadowBlur = 15; ctx.shadowColor = "#fff"; }
            else { ctx.fillStyle = `rgb(${Math.floor(255*(1-p))},0,${Math.floor(255*p)})`; }
            ctx.fillRect(s.x, s.y, s.isElite?42:28, s.isElite?42:28);
            ctx.shadowBlur = 0;
        });
        
        // 畫特效與子彈
        exps.forEach(e => {
            ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (1.2 - e.life), 0, Math.PI*2);
            ctx.fillStyle = `rgba(${e.c}, ${e.life * 0.4})`; ctx.fill();            
        });
        bts.forEach(b => {
            let color = b.type==='fire'?'#f40':(b.type==='ice'?'#0af':(b.type==='volt'?'#ff0':'#fff'));
            ctx.fillStyle = color; ctx.beginPath(); ctx.arc(b.x, b.y, 6, 0, Math.PI*2); ctx.fill();
        });
        dmgs.forEach(d => { ctx.globalAlpha = d.life; ctx.fillStyle = d.c; ctx.font = `bold ${d.s}px Arial`; ctx.fillText(d.v, d.x, d.y); });
        ctx.globalAlpha = 1;
        update();
    }
    requestAnimationFrame(draw);
}

// --- 初始化啟動 ---
draw(); 

cvs.addEventListener("mousemove", (e) => tarX = e.clientX);
cvs.addEventListener("touchmove", (e) => { 
    tarX = e.touches[0].clientX; 
    e.preventDefault(); 
}, {passive: false});

window.addEventListener("resize", () => { 
    w = cvs.width = window.innerWidth; 
    h = cvs.height = window.innerHeight; 
    if(state !== 'START') createPath(); 
});

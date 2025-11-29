document.addEventListener("DOMContentLoaded", () => {
  console.log("System Restricted Roads Loaded");

  const routePath = document.getElementById("routePath");
  const carMarker = document.getElementById("carMarker");
  const resCode = document.getElementById("resCode");
  const resDist = document.getElementById("resDist");
  const resETA = document.getElementById("resETA");
  const aiChat = document.getElementById("aiChat");
  const btnSearch = document.getElementById("btnSearch");
  const btnClear = document.getElementById("btnClear");
  const btnAnimateToggle = document.getElementById("btnAnimateToggle");
  const slotEls = Array.from(document.querySelectorAll(".slot-group"));
  let animateOn = true;

  if (btnAnimateToggle) {
    btnAnimateToggle.addEventListener("click", () => {
      animateOn = !animateOn;
      btnAnimateToggle.textContent = "Animasi: " + (animateOn ? "ON" : "OFF");
      if (!animateOn) carMarker.style.display = "none";
    });
  }

  window.switchFloor = function (floorNum) {
    const layerF1 = document.getElementById("layer-f1");
    const layerF2 = document.getElementById("layer-f2");
    const btnF1 = document.getElementById("btnF1");
    const btnF2 = document.getElementById("btnF2");

    if (floorNum === 1) {
      if (layerF1) layerF1.style.display = "block";
      if (layerF2) layerF2.style.display = "none";
      btnF1.classList.add("active");
      btnF2.classList.remove("active");
    } else {
      if (layerF1) layerF1.style.display = "none";
      if (layerF2) layerF2.style.display = "block";
      btnF1.classList.remove("active");
      btnF2.classList.add("active");
    }
  };

  // ==========================================
  // 1. MEMBANGUN GRAPH JALAN (RESTRICTED)
  // ==========================================
  const nodes = {};
  const edges = {};

  function addNode(id, x, y, floor) {
    nodes[id] = { id, x, y, floor };
    edges[id] = [];
  }
  
  function connect(id1, id2) {
    if (nodes[id1] && nodes[id2]) {
        if (!edges[id1].includes(id2)) edges[id1].push(id2);
        if (!edges[id2].includes(id1)) edges[id2].push(id1);
    }
  }

  // DEFINISI JALAN
  const Y_ROADS = [50, 210, 370]; // Jalan Atas, Tengah, Bawah
  
  // Titik Referensi Horizontal (Kolom Slot)
  const X_ALL = [50, 120, 180, 240, 300, 360, 420, 480, 550];
  
  // [PENTING] Hanya X ini yang boleh jadi jalan vertikal (naik-turun)
  // X=50 (Kiri), X=300 (Tengah), X=550 (Kanan)
  const X_VERTICAL_ROADS = [50, 300, 550]; 

  [1, 2].forEach(floor => {
    const f = `F${floor}`;
    
    // A. Buat Semua Titik Node
    Y_ROADS.forEach(y => {
        X_ALL.forEach(x => {
            addNode(`${f}_${x}_${y}`, x, y, floor);
        });
    });

    // B. Hubungkan HORIZONTAL (Semua boleh jalan samping)
    // Ini membuat "Lorong" di depan slot
    Y_ROADS.forEach(y => {
        for (let i = 0; i < X_ALL.length - 1; i++) {
            connect(`${f}_${X_ALL[i]}_${y}`, `${f}_${X_ALL[i+1]}_${y}`);
        }
    });

    // C. Hubungkan VERTIKAL (HANYA DI JALAN UTAMA)
    // Ini kuncinya biar gak nerobos slot!
    X_VERTICAL_ROADS.forEach(x => {
        connect(`${f}_${x}_50`, `${f}_${x}_210`);  // Atas <-> Tengah
        connect(`${f}_${x}_210`, `${f}_${x}_370`); // Tengah <-> Bawah
    });
  });

  // Koneksi Pintu & Ramp
  addNode("Start", 550, 400, 1);
  connect("Start", "F1_550_370"); // Masuk ke Jalan Bawah Kanan
  connect("F1_550_50", "F2_550_50"); // Ramp Naik

  // ==========================================
  // 2. PATHFINDING (A*)
  // ==========================================
  function heuristic(a, b) { 
      // Manhattan distance agar jalurnya kotak-kotak
      return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); 
  }
  
  function aStar(startId, goalId) {
      const open = new Set([startId]);
      const cameFrom = {};
      const gScore = {};
      const fScore = {};
      
      for (const k in nodes) { gScore[k] = Infinity; fScore[k] = Infinity; }
      gScore[startId] = 0;
      fScore[startId] = heuristic(nodes[startId], nodes[goalId]);
      
      while (open.size) {
        let current = null, bestF = Infinity;
        open.forEach((nid) => { 
            if (fScore[nid] < bestF) { bestF = fScore[nid]; current = nid; } 
        });

        if (current === goalId) {
          const path = []; 
          let cur = current; 
          while (cur) { path.push(nodes[cur]); cur = cameFrom[cur]; } 
          return path.reverse();
        }

        open.delete(current);
        
        for (const neigh of edges[current]) {
          let dist = heuristic(nodes[current], nodes[neigh]);
          if (nodes[current].floor !== nodes[neigh].floor) dist += 5000;
          
          const tentative = gScore[current] + dist;
          if (tentative < gScore[neigh]) { 
              cameFrom[neigh] = current; 
              gScore[neigh] = tentative; 
              fScore[neigh] = tentative + heuristic(nodes[neigh], nodes[goalId]); 
              open.add(neigh); 
          }
        }
      }
      return null;
  }

  // --- Nearest Node (Snap ke Jalan Terdekat) ---
  function nearestNode(x, y, floor) {
    let best = null, min = Infinity;
    for (const k in nodes) {
      const n = nodes[k];
      if (n.floor !== floor) continue;
      // Hanya snap ke node yang SEJAJAR secara X atau Y (Biar lurus)
      if (Math.abs(n.x - x) > 5 && Math.abs(n.y - y) > 5) continue;

      const d = Math.abs(n.x - x) + Math.abs(n.y - y);
      if (d < min) { min = d; best = n; }
    }
    return best;
  }

  // ==========================================
  // 3. TARGETING LOGIC
  // ==========================================
  
  function getSlotPos(slotEl) {
    // Ambil posisi slot (Tengah Kotak)
    const parentT = slotEl.parentElement.getAttribute("transform");
    const parentM = /translate\(\s*([-\d.]+)[ ,]+([-\d.]+)\s*\)/.exec(parentT);
    const parentX = parentM ? parseFloat(parentM[1]) : 0;
    const parentY = parentM ? parseFloat(parentM[2]) : 0;

    const elT = slotEl.getAttribute("transform");
    const elM = elT ? /translate\(\s*([-\d.]+)[ ,]+([-\d.]+)\s*\)/.exec(elT) : null;
    const elX = elM ? parseFloat(elM[1]) : 0;
    const elY = elM ? parseFloat(elM[2]) : 0;

    const f = parseInt(slotEl.getAttribute("data-floor") || "1");
    
    // Posisi absolut tengah slot (tanpa offset aneh-aneh)
    return { x: parentX + elX, y: parentY + elY, floor: f };
  }

  function buildRoute(startPt, targetPt) {
    // 1. Cari titik jalan terdekat dari Mobil
    const startNode = nearestNode(startPt.x, startPt.y, startPt.floor);
    
    // 2. Cari titik jalan terdekat dari Slot Tujuan (PENTING!)
    // Ini akan mencari node di Y=50, 210, atau 370 yang X-nya sejajar dengan slot.
    const targetNode = nearestNode(targetPt.x, targetPt.y, targetPt.floor);
    
    if (!startNode || !targetNode) return null;
    
    // 3. Cari jalan antar Node Jalan Raya
    const nodePath = aStar(startNode.id, targetNode.id);
    if (!nodePath) return null;
    
    // 4. Susun Jalur: Mobil -> Jalan -> Jalan -> Masuk Slot
    const points = [startPt];
    nodePath.forEach((n) => points.push(n));
    points.push(targetPt); // Garis terakhir masuk ke slot
    return points;
  }

  // --- API & RENDER ---
  async function loadParkingData() {
    try {
      const response = await fetch("/api/slots");
      if (response.ok) {
          const data = await response.json();
          slotEls.forEach((el) => {
            const code = el.getAttribute("data-slot");
            if (data[code]) el.setAttribute("data-status", data[code]);
          });
      }
    } catch (e) { console.log("Offline Mode"); }
  }
  loadParkingData();

  slotEls.forEach((el) => {
    el.addEventListener("click", async () => {
      const cur = el.getAttribute("data-status");
      const code = el.getAttribute("data-slot");
      const next = cur === "empty" ? "occupied" : "empty";
      el.setAttribute("data-status", next);
      try {
        await fetch("/api/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: code, status: next }),
        });
      } catch (e) {}
      if (el.classList.contains("best") && next === "occupied") findParking();
    });
  });

  function resetUI() {
    routePath.setAttribute("d", "");
    routePath.classList.remove("show");
    resCode.textContent = "--";
    slotEls.forEach((s) => s.classList.remove("best"));
    carMarker.style.display = "none";
  }
  if (btnClear) btnClear.addEventListener("click", resetUI);

  function drawPath(points) {
    if (!points || points.length < 2) return;
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) d += ` L ${points[i].x} ${points[i].y}`;
    routePath.setAttribute("d", d);
    setTimeout(() => routePath.classList.add("show"), 50);
  }

  function animateCar(points, onComplete) {
    const len = routePath.getTotalLength();
    carMarker.style.display = "block";
    const start = performance.now();
    const dur = points.length * 150; 

    function step(now) {
      const t = Math.min(1, (now - start) / dur);
      const pt = routePath.getPointAtLength(t * len);
      carMarker.setAttribute("cx", pt.x);
      carMarker.setAttribute("cy", pt.y);
      if (t < 1) requestAnimationFrame(step);
      else if (onComplete) onComplete();
    }
    requestAnimationFrame(step);
  }

  function findParking() {
    resetUI();
    const startPt = { x: 550, y: 400, floor: 1 };

    const allEmpties = slotEls.filter(s => s.getAttribute("data-status") === "empty");
    if (allEmpties.length === 0) {
      resCode.textContent = "FULL";
      aiChat.innerHTML = "Parkiran Penuh!";
      return;
    }

    // Prioritas: Habiskan Lt 1 dulu
    const f1Empties = allEmpties.filter(s => parseInt(s.getAttribute("data-floor")) === 1);
    const targetCandidates = f1Empties.length > 0 ? f1Empties : allEmpties.filter(s => parseInt(s.getAttribute("data-floor")) === 2);

    let best = null, bestDist = Infinity, bestPath = null;

    targetCandidates.forEach((slot) => {
      const targetPos = getSlotPos(slot);
      const fullPath = buildRoute(startPt, targetPos);
      
      if (fullPath) {
        // Hitung total panjang jalur
        let dist = 0;
        for (let i = 0; i < fullPath.length - 1; i++) {
            dist += Math.abs(fullPath[i].x - fullPath[i+1].x) + Math.abs(fullPath[i].y - fullPath[i+1].y);
        }
        
        if (dist < bestDist) { 
            bestDist = dist; 
            best = slot; 
            bestPath = fullPath; 
        }
      }
    });

    if (best) {
      best.classList.add("best");
      const code = best.getAttribute("data-slot");
      const targetFloor = parseInt(best.getAttribute("data-floor"));
      resCode.textContent = code;
      resDist.textContent = `±${Math.round(bestDist/10)} m`;
      resETA.textContent = `Lantai ${targetFloor}`;
      aiChat.innerHTML = `Menuju Slot <b>${code}</b>...`;

      const pathF1 = bestPath.filter(p => p.floor === 1);
      const pathF2 = bestPath.filter(p => p.floor === 2);

      if (targetFloor === 1) {
        window.switchFloor(1);
        drawPath(pathF1);
        if (animateOn) animateCar(pathF1, null);
      } else {
        window.switchFloor(1);
        drawPath(pathF1);
        if (animateOn) {
            animateCar(pathF1, () => {
                window.switchFloor(2);
                drawPath(pathF2);
                animateCar(pathF2, null);
            });
        } else {
            window.switchFloor(2);
            drawPath(pathF2);
        }
      }
    }
  }
  
  if (btnSearch) btnSearch.addEventListener("click", findParking);
});

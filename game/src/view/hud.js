// hud.js — VELA BAY 3D HUD: mission line, wanted stars, police panel,
// clock, money / REP / debt, health / armour, ammo, speed, vehicle name,
// minimap canvas, dialogue, toast, radio, controls hint.
// Written fresh for the polish pass. Updates are targeted textContent
// writes on elements built once in buildHud — the HUD never rebuilds its
// DOM each frame. The minimap enter-car marker points at the CAR (the
// enterCar position the game passes in), never at the garage.
import { CITY_SIZE } from '../config.js';
import { clockLabel } from '../sim/clock.js';

// Minimap: the whole 500 m city maps onto a 200 px canvas.
const MAP_SIZE = 200;
const MAP_SCALE = MAP_SIZE / CITY_SIZE;

// Panel text helpers.
function starsText(wanted) {
  const n = Math.max(0, Math.min(5, Math.round(wanted || 0)));
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

function clockText(clock) {
  // The clock line is built by sim/clock.js from the clock itself, so the
  // HUD never formats time from a possibly stale phase string handed in
  // by the caller.
  return clockLabel(clock);
}

function moneyText(money) {
  return `$${(Number.isFinite(money) ? Math.round(money) : 0).toLocaleString('en-US')}`;
}

function speedText(speed) {
  return `${Math.round(Math.abs(speed || 0) * 3.6)} km/h`;
}

// makeDiv(root, styles) — one absolutely-positioned HUD block.
function makeDiv(root, styles) {
  const el = document.createElement('div');
  el.style.position = 'absolute';
  for (const k of Object.keys(styles)) el.style[k] = styles[k];
  el.style.color = '#fff';
  el.style.fontFamily = 'Arial, Helvetica, sans-serif';
  el.style.textShadow = '0 1px 3px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.6)';
  el.style.pointerEvents = 'none';
  root.appendChild(el);
  return el;
}

// makeLine(parent, fontSize, weight, color) — one text line inside a block.
function makeLine(parent, fontSize, weight, color) {
  const el = document.createElement('div');
  el.style.fontSize = fontSize;
  el.style.fontWeight = weight || 'normal';
  if (color) el.style.color = color;
  el.style.lineHeight = '1.35';
  el.style.whiteSpace = 'nowrap';
  parent.appendChild(el);
  return el;
}

// buildHud(root) — build every HUD element once under `root` and return
// { el, elements, update, setVisible, setHudVisible }. `elements` exposes
// the live nodes main.js and the tests read (missionLine, stars, clock,
// money, speed, policeRows, hint, ...). update(state) writes textContent
// only — no innerHTML anywhere, ever.
export function buildHud(root) {
  const el = document.createElement('div');
  el.id = 'hud';
  el.style.position = 'absolute';
  el.style.left = '0';
  el.style.top = '0';
  el.style.width = '100%';
  el.style.height = '100%';
  el.style.pointerEvents = 'none';
  el.style.zIndex = '10';
  root.appendChild(el);

  // Top-left: mission line + distance, wanted stars, police panel.
  const topLeft = makeDiv(el, { top: '12px', left: '14px' });
  const missionLine = makeLine(topLeft, '17px', 'bold', '#ffd21f');
  const missionDistance = makeLine(topLeft, '14px', 'bold', '#fff');
  const stars = makeLine(topLeft, '22px', 'bold', '#ff4040');
  stars.style.letterSpacing = '2px';
  const policePanel = document.createElement('div');
  policePanel.style.marginTop = '6px';
  topLeft.appendChild(policePanel);
  const policeRows = [];

  // Top-right: clock, money, REP, debt.
  const topRight = makeDiv(el, { top: '12px', right: '14px', textAlign: 'right' });
  const clock = makeLine(topRight, '16px', 'bold', '#fff');
  const money = makeLine(topRight, '20px', 'bold', '#7dff8a');
  const rep = makeLine(topRight, '14px', 'bold', '#9fb4cc');
  const debt = makeLine(topRight, '14px', 'bold', '#ff9a66');

  // Top-centre: ROADBLOCK AHEAD banner (3+ star heat, block within 80 m).
  const topCentre = makeDiv(el, { top: '12px', left: '0', right: '0', textAlign: 'center' });
  const roadblock = makeLine(topCentre, '18px', 'bold', '#ff8c1a');
  roadblock.style.display = 'none';

  // Bottom-left: health/armour, ammo, speed, vehicle.
  const bottomLeft = makeDiv(el, { bottom: '12px', left: '14px' });
  const vitals = makeLine(bottomLeft, '16px', 'bold', '#fff');
  const ammo = makeLine(bottomLeft, '15px', 'bold', '#ffe9a8');
  const speed = makeLine(bottomLeft, '30px', 'bold', '#ffd21f');
  const vehicle = makeLine(bottomLeft, '15px', 'bold', '#fff');

  // Bottom-right: minimap canvas + radio station under it.
  const bottomRight = makeDiv(el, { bottom: '12px', right: '14px', textAlign: 'right' });
  const minimap = document.createElement('canvas');
  minimap.width = MAP_SIZE;
  minimap.height = MAP_SIZE;
  minimap.style.width = `${MAP_SIZE}px`;
  minimap.style.height = `${MAP_SIZE}px`;
  minimap.style.display = 'block';
  minimap.style.border = '2px solid rgba(255,255,255,0.5)';
  minimap.style.borderRadius = '4px';
  minimap.style.background = 'rgba(8,12,20,0.72)';
  bottomRight.appendChild(minimap);
  const radio = makeLine(bottomRight, '14px', 'bold', '#9fd8ff');
  radio.style.marginTop = '4px';

  // Bottom-centre: dialogue line, toast above it, controls hint below.
  const bottomCentre = makeDiv(el, { bottom: '12px', left: '0', right: '0', textAlign: 'center' });
  const toast = makeLine(bottomCentre, '18px', 'bold', '#7dff8a');
  const dialogue = makeLine(bottomCentre, '16px', 'normal', '#ffe9a8');
  dialogue.style.fontStyle = 'italic';
  const hint = makeLine(bottomCentre, '13px', 'normal', 'rgba(255,255,255,0.85)');

  const elements = {
    missionLine, missionDistance, stars, policePanel, policeRows,
    clock, money, rep, debt, vitals, ammo, speed, vehicle,
    minimap, radio, toast, dialogue, hint, roadblock,
  };

  // drawMinimap(state) — live canvas: road grid, mission marker,
  // roadblocks, traffic dots, police dots (faded last-known when out of
  // sight), the player, and the enter-car ring at the CAR's position.
  function drawMinimap(state) {
    const ctx = minimap.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
    ctx.fillStyle = 'rgba(10,14,24,0.85)';
    ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
    // Road grid every 50 m.
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1;
    for (let v = 0; v <= CITY_SIZE; v += 50) {
      const p = v * MAP_SCALE;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, MAP_SIZE); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(MAP_SIZE, p); ctx.stroke();
    }
    const dot = (x, z, r, colour) => {
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(x * MAP_SCALE, z * MAP_SCALE, r, 0, Math.PI * 2);
      ctx.fill();
    };
    // Roadblocks: orange squares.
    for (const b of state.roadblocks || []) {
      ctx.fillStyle = '#ff8c1a';
      ctx.fillRect(b.x * MAP_SCALE - 4, b.z * MAP_SCALE - 4, 8, 8);
    }
    // Mission marker: yellow diamond.
    if (state.missionMarker) {
      const mx = state.missionMarker.x * MAP_SCALE;
      const mz = state.missionMarker.z * MAP_SCALE;
      ctx.fillStyle = '#ffd21f';
      ctx.beginPath();
      ctx.moveTo(mx, mz - 7); ctx.lineTo(mx + 7, mz);
      ctx.lineTo(mx, mz + 7); ctx.lineTo(mx - 7, mz);
      ctx.closePath(); ctx.fill();
    }
    // Traffic: small grey dots.
    for (const t of state.traffic || []) dot(t.x, t.z, 2, 'rgba(220,228,238,0.75)');
    // Police: blue when seen, faded red dot at the last-known spot.
    for (const u of state.police || []) {
      if (u.visible) {
        dot(u.x, u.z, 3.5, '#4da3ff');
      } else if (u.lastX != null && u.lastZ != null) {
        ctx.globalAlpha = 0.45;
        dot(u.lastX, u.lastZ, 3.5, '#ff4040');
        ctx.globalAlpha = 1;
      }
    }
    // Enter-car ring: drawn AT THE CAR, so the player walks to the car.
    if (state.enterCar) {
      ctx.strokeStyle = '#7dff8a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(state.enterCar.x * MAP_SCALE, state.enterCar.z * MAP_SCALE, 6, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Player: gold dot with a white rim, always on top.
    if (state.player) {
      dot(state.player.x, state.player.z, 4.5, '#ffd21f');
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(state.player.x * MAP_SCALE, state.player.z * MAP_SCALE, 4.5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // update(state) — one targeted textContent write per element, plus the
  // minimap redraw. Police rows are pooled: rows are created once and
  // hidden when unused, never rebuilt.
  function update(state) {
    if (state.missionText != null) missionLine.textContent = state.missionText;
    if (state.missionDistance != null) {
      missionDistance.textContent = `→ ${Math.round(state.missionDistance)} m`;
      missionDistance.style.display = '';
    } else {
      missionDistance.textContent = '';
      missionDistance.style.display = 'none';
    }
    if (state.wanted != null) stars.textContent = starsText(state.wanted);
    if (state.clock) clock.textContent = clockText(state.clock);
    if (state.money != null) money.textContent = moneyText(state.money);
    if (state.rep != null) rep.textContent = `REP ${state.rep}`;
    if (state.debt != null) debt.textContent = `DEBT ${moneyText(state.debt)}`;
    if (state.health != null) {
      vitals.textContent = `HP ${Math.round(state.health)} · ARMOUR ${Math.round(state.armour || 0)}`;
    }
    if (state.ammo != null) {
      ammo.textContent = `PISTOL ${state.ammo} / ${state.maxAmmo || 12}`;
    }
    if (state.speed != null) speed.textContent = speedText(state.speed);
    if (state.vehicleName != null) vehicle.textContent = state.vehicleName;
    if (state.dialogue != null) {
      dialogue.textContent = state.dialogue || '';
      dialogue.style.display = state.dialogue ? '' : 'none';
    }
    if (state.toast != null) {
      toast.textContent = state.toast || '';
      toast.style.display = state.toast ? '' : 'none';
    }
    if (state.radio != null) {
      radio.textContent = state.radio ? `♪ ${state.radio}` : '';
      radio.style.display = state.radio ? '' : 'none';
    }
    const police = state.police || [];
    for (let i = 0; i < police.length; i++) {
      let row = policeRows[i];
      if (!row) {
        row = makeLine(policePanel, '14px', 'bold', '#cfe0f2');
        policeRows.push(row);
      }
      const u = police[i];
      row.textContent = `${u.name} · ${Math.round(u.distance)} m · ${String(u.state || '').toUpperCase()}`;
      row.style.display = '';
    }
    for (let i = police.length; i < policeRows.length; i++) {
      policeRows[i].textContent = '';
      policeRows[i].style.display = 'none';
    }
    if (state.hintText != null) hint.textContent = state.hintText;
    if (state.roadblockAhead != null) {
      roadblock.textContent = '⚠ ROADBLOCK AHEAD';
      roadblock.style.display = state.roadblockAhead ? '' : 'none';
    }
    drawMinimap(state);
  }

  function setVisible(v) {
    el.style.display = v ? '' : 'none';
  }

  // Hint text lives in exactly one place (study notes §5.12).
  hint.textContent = 'WASD drive · SPACE handbrake · E enter/steal · G garage · F sell · B missions · P pause · M mute';

  return { el, elements, update, setVisible, setHudVisible: setVisible };
}

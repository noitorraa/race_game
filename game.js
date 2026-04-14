(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const ui = {
    distance: document.getElementById('distance'),
    coins: document.getElementById('coins'),
    best: document.getElementById('best'),
    status: document.getElementById('status'),
    throttle: document.getElementById('btn-throttle'),
    brake: document.getElementById('btn-brake'),
    restart: document.getElementById('btn-restart'),
    revive: document.getElementById('btn-revive'),
    vehicleSelect: document.getElementById('vehicle-select'),
    mapSkinSelect: document.getElementById('map-skin-select'),
    unlockSunset: document.getElementById('btn-unlock-sunset'),
    unlockWinter: document.getElementById('btn-unlock-winter'),
    buyUaz: document.getElementById('btn-buy-uaz'),
    buyGaz: document.getElementById('btn-buy-gaz'),
    iapCoins: document.getElementById('btn-iap-coins'),
  };

  const VEHICLES = {
    lada: { name: 'Лада Classic', accel: 0.13, brake: 0.18, grip: 0.055, color: '#d14f4f', unlock: 0 },
    uaz: { name: 'UAZ Trail', accel: 0.11, brake: 0.14, grip: 0.08, color: '#4e8d55', unlock: 400 },
    gaz: { name: 'GAZ Cargo', accel: 0.09, brake: 0.12, grip: 0.11, color: '#6080d1', unlock: 600 },
  };

  const SKINS = {
    default: { sky: '#65b7ff', sky2: '#b7e2ff', ground: '#564127', deco: '#4e9132', unlock: 0, name: 'Базовый' },
    sunset: { sky: '#f08a57', sky2: '#653f82', ground: '#4f2f27', deco: '#7a4421', unlock: 250, name: 'Закат' },
    winter: { sky: '#90b2d5', sky2: '#dfefff', ground: '#dde4ee', deco: '#9db2ca', unlock: 350, name: 'Зимний' },
  };

  const COSMIC_EVENTS = [
    { key: 'wind', label: 'Боковой ветер', factor: 1.3 },
    { key: 'lowG', label: 'Низкая гравитация', factor: 0.6 },
    { key: 'heavy', label: 'Тяжёлый кузов', factor: 1.4 },
  ];

  const state = {
    ysdk: null,
    payments: null,
    throttle: false,
    brake: false,
    dead: false,
    revived: false,
    worldX: 0,
    velocity: 0,
    cameraX: 0,
    carY: 0,
    carAngle: 0,
    bodyRotation: 0,
    gravity: 0.55,
    dist: 0,
    coins: Number(localStorage.getItem('rr_coins') || 0),
    best: Number(localStorage.getItem('rr_best') || 0),
    ownedVehicles: JSON.parse(localStorage.getItem('rr_vehicles') || '["lada"]'),
    ownedSkins: JSON.parse(localStorage.getItem('rr_skins') || '["default"]'),
    selectedVehicle: localStorage.getItem('rr_selected_vehicle') || 'lada',
    selectedSkin: localStorage.getItem('rr_selected_skin') || 'default',
    eventTimer: 0,
    currentEvent: null,
    yVelocity: 0,
    coinsOnTrack: [],
    seed: Math.random() * 10000,
  };

  function persist() {
    localStorage.setItem('rr_coins', String(state.coins));
    localStorage.setItem('rr_best', String(state.best));
    localStorage.setItem('rr_vehicles', JSON.stringify(state.ownedVehicles));
    localStorage.setItem('rr_skins', JSON.stringify(state.ownedSkins));
    localStorage.setItem('rr_selected_vehicle', state.selectedVehicle);
    localStorage.setItem('rr_selected_skin', state.selectedSkin);
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function hash(n) {
    const x = Math.sin(n * 123.9898 + state.seed) * 43758.5453;
    return x - Math.floor(x);
  }

  function terrainHeight(x) {
    return 340
      + Math.sin(x * 0.008) * 90
      + Math.sin(x * 0.019 + 1.5) * 35
      + Math.sin(x * 0.042 + 8.4) * 18;
  }

  function terrainSlope(x) {
    const eps = 2;
    return (terrainHeight(x + eps) - terrainHeight(x - eps)) / (2 * eps);
  }

  function ensureTrackCoins() {
    const ahead = state.cameraX + window.innerWidth + 800;
    while (state.coinsOnTrack.length < 60) {
      const lastX = state.coinsOnTrack.length ? state.coinsOnTrack[state.coinsOnTrack.length - 1].x : state.worldX + 300;
      const nextX = lastX + 120 + hash(lastX) * 300;
      if (nextX > ahead) break;
      state.coinsOnTrack.push({ x: nextX, y: terrainHeight(nextX) - 60 - hash(nextX + 77) * 40, taken: false });
    }

    state.coinsOnTrack = state.coinsOnTrack.filter((c) => c.x > state.cameraX - 400 && !c.taken);
  }

  function setStatus(text) {
    ui.status.textContent = text;
  }

  function addCoins(amount) {
    state.coins += amount;
    persist();
  }

  function buy(itemType, key, price) {
    if (state.coins < price) {
      setStatus('Недостаточно монет');
      return false;
    }
    state.coins -= price;
    if (itemType === 'skin') state.ownedSkins.push(key);
    if (itemType === 'vehicle') state.ownedVehicles.push(key);
    persist();
    refreshShop();
    setStatus(`Покупка успешна: ${itemType === 'skin' ? SKINS[key].name : VEHICLES[key].name}`);
    return true;
  }

  function refreshShop() {
    ui.coins.textContent = String(state.coins);
    ui.best.textContent = String(Math.floor(state.best));

    ui.unlockSunset.disabled = state.ownedSkins.includes('sunset');
    ui.unlockWinter.disabled = state.ownedSkins.includes('winter');
    ui.buyUaz.disabled = state.ownedVehicles.includes('uaz');
    ui.buyGaz.disabled = state.ownedVehicles.includes('gaz');

    ui.vehicleSelect.value = state.selectedVehicle;
    ui.mapSkinSelect.value = state.selectedSkin;
  }

  async function initYandexSdk() {
    if (!window.YaGames) {
      setStatus('SDK Яндекса не найден: запуск в локальном режиме.');
      return;
    }

    try {
      const ysdk = await window.YaGames.init();
      state.ysdk = ysdk;
      await ysdk.features?.LoadingAPI?.ready();
      state.payments = await ysdk.getPayments?.();
      setStatus('SDK Яндекс Игр подключен. Монетизация активна.');
    } catch (e) {
      console.error(e);
      setStatus('Не удалось инициализировать SDK. Игра работает офлайн.');
    }
  }

  async function showRewardedAd() {
    if (!state.ysdk?.adv?.showRewardedVideo) {
      setStatus('Рекламное видео доступно только на платформе Яндекс Игр.');
      return false;
    }

    return new Promise((resolve) => {
      state.ysdk.adv.showRewardedVideo({
        callbacks: {
          onRewarded: () => resolve(true),
          onClose: () => resolve(false),
          onError: () => resolve(false),
        },
      });
    });
  }

  async function purchaseCoinsPack() {
    if (!state.payments?.purchase) {
      setStatus('IAP доступен только внутри Яндекс Игр. Добавлено +1000 монет в демо-режиме.');
      addCoins(1000);
      refreshShop();
      return;
    }

    try {
      const productId = 'coins_1000';
      await state.payments.purchase({ id: productId });
      addCoins(1000);
      refreshShop();
      setStatus('Покупка успешна: +1000 монет.');
    } catch (e) {
      console.error(e);
      setStatus('Покупка отменена или недоступна.');
    }
  }

  function resetRun() {
    state.worldX = 0;
    state.velocity = 0;
    state.cameraX = 0;
    state.yVelocity = 0;
    state.bodyRotation = 0;
    state.carAngle = 0;
    state.dead = false;
    state.revived = false;
    state.dist = 0;
    state.currentEvent = null;
    state.eventTimer = 420;
    state.coinsOnTrack = [];
    setStatus('Новая поездка. Следи за аномалиями трассы!');
  }

  function applyEventEffect() {
    state.gravity = 0.55;
    if (!state.currentEvent) return;
    if (state.currentEvent.key === 'lowG') state.gravity *= state.currentEvent.factor;
    if (state.currentEvent.key === 'heavy') state.gravity *= state.currentEvent.factor;
  }

  function update(dt) {
    if (state.dead) return;

    state.eventTimer -= dt;
    if (state.eventTimer <= 0) {
      state.currentEvent = COSMIC_EVENTS[Math.floor(Math.random() * COSMIC_EVENTS.length)];
      state.eventTimer = 540;
      setStatus(`Аномалия: ${state.currentEvent.label}`);
    }
    applyEventEffect();

    const vehicle = VEHICLES[state.selectedVehicle];

    if (state.throttle) state.velocity += vehicle.accel * dt;
    if (state.brake) state.velocity -= vehicle.brake * dt;

    state.velocity *= 0.992;
    state.velocity = Math.max(state.velocity, -2);
    state.velocity = Math.min(state.velocity, 14);

    if (state.currentEvent?.key === 'wind') {
      state.bodyRotation += 0.0018 * state.currentEvent.factor * dt;
    }

    state.worldX += state.velocity * dt;
    state.cameraX = state.worldX - 240;

    const groundY = terrainHeight(state.worldX);
    const slope = terrainSlope(state.worldX);
    const targetAngle = Math.atan(slope);

    const airborne = state.carY < groundY - 5;
    if (airborne) {
      state.yVelocity += state.gravity * dt;
    } else {
      state.yVelocity = 0;
      state.carY = groundY;
      state.bodyRotation += (targetAngle - state.bodyRotation) * vehicle.grip;
    }

    state.carY += state.yVelocity;
    state.carAngle = state.bodyRotation;

    if (!airborne && state.velocity > 7 && Math.abs(targetAngle - state.bodyRotation) > 0.7) {
      state.yVelocity = -6;
      state.bodyRotation += (targetAngle - state.bodyRotation) * 0.2;
    }

    for (const coin of state.coinsOnTrack) {
      if (coin.taken) continue;
      const dx = coin.x - state.worldX;
      const dy = coin.y - state.carY;
      if (dx * dx + dy * dy < 2300) {
        coin.taken = true;
        addCoins(1);
      }
    }

    state.dist = Math.max(state.dist, state.worldX / 8);
    if (state.dist > state.best) {
      state.best = state.dist;
      persist();
    }

    if (Math.abs(state.bodyRotation) > 1.8 || state.carY > groundY + 180) {
      state.dead = true;
      setStatus('Авария! Ревайв за рекламу или рестарт.');
    }

    ensureTrackCoins();
  }

  function drawBackground() {
    const skin = SKINS[state.selectedSkin];
    const grad = ctx.createLinearGradient(0, 0, 0, window.innerHeight);
    grad.addColorStop(0, skin.sky);
    grad.addColorStop(1, skin.sky2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

    for (let i = 0; i < 6; i += 1) {
      const x = ((i * 320 - (state.cameraX * (0.2 + i * 0.02))) % (window.innerWidth + 400)) - 200;
      const y = 110 + i * 8;
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.beginPath();
      ctx.arc(x, y, 34 + i * 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawTerrain() {
    const skin = SKINS[state.selectedSkin];
    ctx.fillStyle = skin.ground;
    ctx.beginPath();

    const startX = Math.floor(state.cameraX - 200);
    const endX = Math.floor(state.cameraX + window.innerWidth + 220);

    ctx.moveTo(-30, window.innerHeight + 50);
    for (let world = startX; world <= endX; world += 12) {
      const sx = world - state.cameraX;
      const sy = terrainHeight(world);
      ctx.lineTo(sx, sy);
    }
    ctx.lineTo(window.innerWidth + 30, window.innerHeight + 50);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = skin.deco;
    for (let x = startX; x <= endX; x += 160) {
      const sx = x - state.cameraX;
      const sy = terrainHeight(x);
      ctx.fillRect(sx - 5, sy - 34, 10, 30 + hash(x) * 24);
    }
  }

  function drawCoins() {
    for (const coin of state.coinsOnTrack) {
      if (coin.taken) continue;
      const sx = coin.x - state.cameraX;
      const sy = coin.y;
      if (sx < -40 || sx > window.innerWidth + 40) continue;
      ctx.fillStyle = '#ffcf2f';
      ctx.beginPath();
      ctx.arc(sx, sy, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#8a6508';
      ctx.stroke();
    }
  }

  function drawCar() {
    const vehicle = VEHICLES[state.selectedVehicle];
    const sx = state.worldX - state.cameraX;
    const sy = state.carY;

    ctx.save();
    ctx.translate(sx, sy - 14);
    ctx.rotate(state.carAngle);

    ctx.fillStyle = vehicle.color;
    ctx.fillRect(-40, -22, 90, 26);
    ctx.fillStyle = '#222';
    ctx.fillRect(-15, -34, 35, 14);

    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(-20, 8, 14, 0, Math.PI * 2);
    ctx.arc(30, 8, 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawGameOver() {
    if (!state.dead) return;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText('АВАРИЯ', window.innerWidth / 2 - 85, window.innerHeight / 2 - 16);
    ctx.font = '22px sans-serif';
    ctx.fillText(`Дистанция: ${Math.floor(state.dist)} м`, window.innerWidth / 2 - 95, window.innerHeight / 2 + 20);
  }

  function draw() {
    drawBackground();
    drawTerrain();
    drawCoins();
    drawCar();
    drawGameOver();

    ui.distance.textContent = String(Math.floor(state.dist));
    ui.coins.textContent = String(state.coins);
    ui.best.textContent = String(Math.floor(state.best));
  }

  function bindEvents() {
    const hold = (button, key) => {
      const on = () => { state[key] = true; };
      const off = () => { state[key] = false; };
      button.addEventListener('pointerdown', on);
      button.addEventListener('pointerup', off);
      button.addEventListener('pointercancel', off);
      button.addEventListener('pointerleave', off);
    };

    hold(ui.throttle, 'throttle');
    hold(ui.brake, 'brake');

    window.addEventListener('keydown', (e) => {
      if (e.code === 'ArrowRight' || e.code === 'KeyD') state.throttle = true;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') state.brake = true;
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'ArrowRight' || e.code === 'KeyD') state.throttle = false;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') state.brake = false;
    });

    ui.restart.addEventListener('click', resetRun);
    ui.revive.addEventListener('click', async () => {
      if (!state.dead || state.revived) {
        setStatus('Ревайв доступен только один раз после аварии.');
        return;
      }
      const granted = await showRewardedAd();
      if (!granted) {
        setStatus('Реклама не досмотрена: ревайв недоступен.');
        return;
      }
      state.dead = false;
      state.revived = true;
      state.bodyRotation = 0;
      state.yVelocity = -3;
      state.velocity = Math.max(state.velocity, 2.5);
      setStatus('Ревайв активирован. Удачи!');
    });

    ui.unlockSunset.addEventListener('click', () => buy('skin', 'sunset', SKINS.sunset.unlock));
    ui.unlockWinter.addEventListener('click', () => buy('skin', 'winter', SKINS.winter.unlock));
    ui.buyUaz.addEventListener('click', () => buy('vehicle', 'uaz', VEHICLES.uaz.unlock));
    ui.buyGaz.addEventListener('click', () => buy('vehicle', 'gaz', VEHICLES.gaz.unlock));
    ui.iapCoins.addEventListener('click', purchaseCoinsPack);

    ui.vehicleSelect.addEventListener('change', () => {
      const v = ui.vehicleSelect.value;
      if (!state.ownedVehicles.includes(v)) {
        setStatus('Этот транспорт нужно купить в гараже.');
        ui.vehicleSelect.value = state.selectedVehicle;
        return;
      }
      state.selectedVehicle = v;
      persist();
    });

    ui.mapSkinSelect.addEventListener('change', () => {
      const s = ui.mapSkinSelect.value;
      if (!state.ownedSkins.includes(s)) {
        setStatus('Этот скин маршрута сначала нужно купить.');
        ui.mapSkinSelect.value = state.selectedSkin;
        return;
      }
      state.selectedSkin = s;
      persist();
    });

    window.addEventListener('resize', resize);
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min((now - last) / 16.666, 2.2);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  async function boot() {
    resize();
    bindEvents();
    refreshShop();
    await initYandexSdk();

    if (!state.ownedVehicles.includes(state.selectedVehicle)) state.selectedVehicle = 'lada';
    if (!state.ownedSkins.includes(state.selectedSkin)) state.selectedSkin = 'default';

    state.worldX = 40;
    state.carY = terrainHeight(state.worldX);
    setStatus('Rusty Ridge: бесконечный маршрут, аномалии и кастомизация гаража.');
    requestAnimationFrame(loop);
  }

  boot();
})();

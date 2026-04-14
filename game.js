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
    lada: {
      name: 'Лада Classic',
      accel: 0.24,
      brake: 0.2,
      traction: 1,
      grip: 0.09,
      mass: 1,
      maxSpeed: 11,
      body: 'compact',
      color: '#d14f4f',
      unlock: 0,
    },
    uaz: {
      name: 'UAZ Trail',
      accel: 0.21,
      brake: 0.18,
      traction: 1.2,
      grip: 0.12,
      mass: 1.15,
      maxSpeed: 10,
      body: 'jeep',
      color: '#4e8d55',
      unlock: 400,
    },
    gaz: {
      name: 'GAZ Cargo',
      accel: 0.17,
      brake: 0.16,
      traction: 1.05,
      grip: 0.1,
      mass: 1.45,
      maxSpeed: 9.2,
      body: 'truck',
      color: '#6080d1',
      unlock: 600,
    },
  };

  const SKINS = {
    default: {
      name: 'Базовый',
      sky: '#65b7ff',
      sky2: '#b7e2ff',
      ground: '#564127',
      deco: '#4e9132',
      friction: 1,
      traction: 1,
      unlock: 0,
    },
    sunset: {
      name: 'Закат',
      sky: '#f08a57',
      sky2: '#653f82',
      ground: '#4f2f27',
      deco: '#7a4421',
      friction: 0.95,
      traction: 1.05,
      unlock: 250,
    },
    winter: {
      name: 'Зимний',
      sky: '#90b2d5',
      sky2: '#dfefff',
      ground: '#dde4ee',
      deco: '#9db2ca',
      friction: 0.7,
      traction: 0.75,
      unlock: 350,
    },
  };

  const EVENTS = [
    { key: 'wind', label: 'Боковой ветер', rotDrift: 0.002 },
    { key: 'lowG', label: 'Низкая гравитация', gravityMul: 0.62 },
    { key: 'heavy', label: 'Тяжёлый кузов', gravityMul: 1.35 },
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
    yVelocity: 0,
    bodyRotation: 0,
    angularVelocity: 0,
    airTime: 0,
    gravity: 0.34,
    dist: 0,
    coins: Number(localStorage.getItem('rr_coins') || 0),
    best: Number(localStorage.getItem('rr_best') || 0),
    ownedVehicles: JSON.parse(localStorage.getItem('rr_vehicles') || '["lada"]'),
    ownedSkins: JSON.parse(localStorage.getItem('rr_skins') || '["default"]'),
    selectedVehicle: localStorage.getItem('rr_selected_vehicle') || 'lada',
    selectedSkin: localStorage.getItem('rr_selected_skin') || 'default',
    eventTimer: 360,
    currentEvent: null,
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

  function setStatus(text) {
    ui.status.textContent = text;
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function hash(n) {
    const x = Math.sin(n * 127.1 + state.seed) * 43758.5453123;
    return x - Math.floor(x);
  }

  function terrainHeight(x) {
    return 390
      + Math.sin(x * 0.008) * 100
      + Math.sin(x * 0.019 + 1.4) * 45
      + Math.sin(x * 0.041 + 7.6) * 20;
  }

  function terrainSlope(x) {
    const eps = 2;
    return (terrainHeight(x + eps) - terrainHeight(x - eps)) / (2 * eps);
  }

  function ensureTrackCoins() {
    const ahead = state.cameraX + window.innerWidth + 1100;
    while (state.coinsOnTrack.length < 90) {
      const lastX = state.coinsOnTrack.length
        ? state.coinsOnTrack[state.coinsOnTrack.length - 1].x
        : state.worldX + 200;
      const nextX = lastX + 80 + hash(lastX + 23) * 220;
      if (nextX > ahead) break;
      state.coinsOnTrack.push({
        x: nextX,
        y: terrainHeight(nextX) - 55 - hash(nextX + 77) * 60,
        taken: false,
      });
    }

    state.coinsOnTrack = state.coinsOnTrack.filter((coin) => !coin.taken && coin.x > state.cameraX - 300);
  }

  function addCoins(amount) {
    state.coins += amount;
    persist();
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

  function buy(itemType, key, price) {
    if (state.coins < price) {
      setStatus('Недостаточно монет для покупки.');
      return;
    }
    state.coins -= price;
    if (itemType === 'skin') state.ownedSkins.push(key);
    if (itemType === 'vehicle') state.ownedVehicles.push(key);
    persist();
    refreshShop();
    setStatus(`Покупка: ${itemType === 'skin' ? SKINS[key].name : VEHICLES[key].name}`);
  }

  async function initYandexSdk() {
    if (!window.YaGames) {
      setStatus('SDK Яндекса не найден. Локальный режим без настоящей монетизации.');
      return;
    }

    try {
      state.ysdk = await window.YaGames.init();
      await state.ysdk.features?.LoadingAPI?.ready();
      state.payments = await state.ysdk.getPayments?.();
      setStatus('SDK подключен. Доступны rewarded и IAP.');
    } catch (error) {
      console.error(error);
      setStatus('Ошибка SDK. Игра продолжит работу офлайн.');
    }
  }

  async function showRewardedAd() {
    if (!state.ysdk?.adv?.showRewardedVideo) {
      setStatus('Rewarded реклама доступна только в Яндекс Играх.');
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
      addCoins(1000);
      refreshShop();
      setStatus('Локальный демо-IAP: +1000 монет.');
      return;
    }

    try {
      await state.payments.purchase({ id: 'coins_1000' });
      addCoins(1000);
      refreshShop();
      setStatus('Покупка прошла успешно: +1000 монет.');
    } catch (error) {
      console.error(error);
      setStatus('Покупка отменена или недоступна.');
    }
  }

  function resetRun() {
    state.worldX = 42;
    state.velocity = 0;
    state.cameraX = 0;
    state.dead = false;
    state.revived = false;
    state.dist = 0;
    state.currentEvent = null;
    state.eventTimer = 380;
    state.coinsOnTrack = [];

    const startGround = terrainHeight(state.worldX) - 22;
    state.carY = startGround;
    state.yVelocity = 0;
    state.bodyRotation = Math.atan(terrainSlope(state.worldX));
    state.angularVelocity = 0;
    state.airTime = 0;
    setStatus('Новый заезд: бесконечная трасса, аномалии и кастомные машины.');
  }

  function applyEventTimers(dt) {
    state.eventTimer -= dt;
    if (state.eventTimer > 0) return;

    state.currentEvent = EVENTS[Math.floor(Math.random() * EVENTS.length)];
    state.eventTimer = 540;
    setStatus(`Аномалия трассы: ${state.currentEvent.label}`);
  }

  function updatePhysics(dt) {
    const vehicle = VEHICLES[state.selectedVehicle];
    const skin = SKINS[state.selectedSkin];

    let gravity = state.gravity;
    if (state.currentEvent?.gravityMul) gravity *= state.currentEvent.gravityMul;

    const slopeAngle = Math.atan(terrainSlope(state.worldX));
    const gravityAlongSlope = Math.sin(slopeAngle) * gravity * 0.7;

    const tractionMul = vehicle.traction * skin.traction;
    const engineForce = (state.throttle ? vehicle.accel * tractionMul * 2.4 : 0) - (state.brake ? vehicle.brake * 1.8 : 0);
    const drag = 0.022 * skin.friction * vehicle.mass;
    const rolling = 0.009 * skin.friction;

    state.velocity += (engineForce - gravityAlongSlope) * dt;
    state.velocity -= state.velocity * drag * dt;
    if (Math.abs(state.velocity) > 0.02) {
      state.velocity -= Math.sign(state.velocity) * rolling * dt;
    }
    if (!state.throttle && !state.brake && Math.abs(state.velocity) < 0.03) state.velocity = 0;
    state.velocity = Math.min(Math.max(state.velocity, -6), vehicle.maxSpeed);

    state.worldX += state.velocity * dt;
    state.cameraX = state.worldX - window.innerWidth * 0.25;

    const rideHeight = 22;
    const groundY = terrainHeight(state.worldX) - rideHeight;
    const targetAngle = Math.atan(terrainSlope(state.worldX));
    const prevGroundY = terrainHeight(state.worldX - state.velocity * dt) - rideHeight;
    const groundGap = groundY - state.carY;
    const onGround = groundGap <= 6 && state.yVelocity >= -1.2;

    if (onGround) {
      const maxRise = (2.2 + Math.abs(state.velocity) * 0.55) * dt;
      const correction = Math.max(-maxRise, groundY - state.carY);
      state.carY += correction;
      if (state.carY > groundY) state.carY = groundY;
      state.yVelocity = Math.min(0, state.yVelocity);
      state.airTime = 0;

      const grip = vehicle.grip * skin.traction;
      const angleDiff = targetAngle - state.bodyRotation;
      state.angularVelocity += angleDiff * grip * dt * 0.45;
      state.angularVelocity *= 0.55;
      state.angularVelocity = Math.max(Math.min(state.angularVelocity, 0.08), -0.08);
      state.bodyRotation += state.angularVelocity;
      state.bodyRotation += (targetAngle - state.bodyRotation) * 0.12;

      const crestDrop = prevGroundY - groundY;
      if (crestDrop > 9 && Math.abs(state.velocity) > 7.2) {
        state.yVelocity = -1.6 - Math.abs(state.velocity) * 0.08;
        state.angularVelocity += angleDiff * 0.12;
      }
    } else {
      state.airTime += dt;
      state.yVelocity += gravity * dt;
      state.carY += state.yVelocity;
      state.angularVelocity += (state.velocity * 0.0009) * dt;
      state.angularVelocity *= 0.996;
      state.bodyRotation += state.angularVelocity;
    }

    if (state.currentEvent?.key === 'wind') {
      state.angularVelocity += state.currentEvent.rotDrift * dt;
    }

    for (const coin of state.coinsOnTrack) {
      if (coin.taken) continue;
      const dx = coin.x - state.worldX;
      const dy = coin.y - state.carY;
      if (dx * dx + dy * dy < 2600) {
        coin.taken = true;
        addCoins(1);
      }
    }

    state.dist = Math.max(state.dist, state.worldX / 8);
    if (state.dist > state.best) {
      state.best = state.dist;
      persist();
    }

    const hardFlip = Math.abs(state.bodyRotation) > 2.35 && (Math.abs(state.velocity) > 2 || state.airTime > 14);
    if (hardFlip || state.carY > groundY + 220) {
      state.dead = true;
      setStatus('Авария! Можно сделать 1 ревайв за rewarded-рекламу.');
    }

    ensureTrackCoins();
  }

  function update(dt) {
    if (state.dead) return;
    applyEventTimers(dt);
    updatePhysics(dt);
  }

  function drawBackground() {
    const skin = SKINS[state.selectedSkin];
    const grad = ctx.createLinearGradient(0, 0, 0, window.innerHeight);
    grad.addColorStop(0, skin.sky);
    grad.addColorStop(1, skin.sky2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

    for (let i = 0; i < 6; i += 1) {
      const x = ((i * 360 - state.cameraX * (0.12 + i * 0.015)) % (window.innerWidth + 450)) - 220;
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.beginPath();
      ctx.arc(x, 90 + i * 11, 30 + i * 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawTerrain() {
    const skin = SKINS[state.selectedSkin];
    const startX = Math.floor(state.cameraX - 260);
    const endX = Math.floor(state.cameraX + window.innerWidth + 280);

    ctx.fillStyle = skin.ground;
    ctx.beginPath();
    ctx.moveTo(-20, window.innerHeight + 80);
    for (let world = startX; world <= endX; world += 10) {
      ctx.lineTo(world - state.cameraX, terrainHeight(world));
    }
    ctx.lineTo(window.innerWidth + 20, window.innerHeight + 80);
    ctx.closePath();
    ctx.fill();

    const decoStep = 170;
    const firstDecoX = Math.floor(startX / decoStep) * decoStep;
    ctx.fillStyle = skin.deco;
    for (let decoX = firstDecoX; decoX <= endX; decoX += decoStep) {
      const xJitter = (hash(decoX + 301) - 0.5) * 90;
      const worldX = decoX + xJitter;
      const sx = worldX - state.cameraX;
      const groundY = terrainHeight(worldX);
      const h = 22 + hash(worldX + 901) * 34;
      ctx.fillRect(sx - 5, groundY - h, 10, h);
    }
  }

  function drawCoins() {
    for (const coin of state.coinsOnTrack) {
      if (coin.taken) continue;
      const sx = coin.x - state.cameraX;
      if (sx < -20 || sx > window.innerWidth + 20) continue;
      ctx.fillStyle = '#ffcf2f';
      ctx.beginPath();
      ctx.arc(sx, coin.y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#8d6711';
      ctx.stroke();
    }
  }

  function drawVehicleShape(type) {
    if (type === 'jeep') {
      ctx.fillRect(-44, -26, 94, 28);
      ctx.fillRect(-10, -39, 46, 16);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(2, -36, 14, 10);
      return;
    }

    if (type === 'truck') {
      ctx.fillRect(-56, -24, 118, 28);
      ctx.fillRect(10, -44, 34, 20);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(14, -40, 18, 11);
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(-34, 10, 14, 0, Math.PI * 2);
      ctx.arc(10, 10, 14, 0, Math.PI * 2);
      ctx.arc(46, 10, 14, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    ctx.fillRect(-40, -22, 90, 26);
    ctx.fillRect(-15, -34, 35, 14);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(-8, -31, 15, 8);
  }

  function drawCar() {
    const vehicle = VEHICLES[state.selectedVehicle];
    const sx = state.worldX - state.cameraX;
    const sy = state.carY;

    ctx.save();
    ctx.translate(sx, sy - 22);
    ctx.rotate(state.bodyRotation);

    ctx.fillStyle = vehicle.color;
    drawVehicleShape(vehicle.body);

    if (vehicle.body !== 'truck') {
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(-20, 8, 14, 0, Math.PI * 2);
      ctx.arc(30, 8, 14, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawGameOver() {
    if (!state.dead) return;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 38px sans-serif';
    ctx.fillText('АВАРИЯ', window.innerWidth / 2 - 85, window.innerHeight / 2 - 24);
    ctx.font = '22px sans-serif';
    ctx.fillText(`Дистанция: ${Math.floor(state.dist)} м`, window.innerWidth / 2 - 95, window.innerHeight / 2 + 12);
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
    const hold = (btn, field) => {
      const on = () => {
        state[field] = true;
      };
      const off = () => {
        state[field] = false;
      };
      btn.addEventListener('pointerdown', on);
      btn.addEventListener('pointerup', off);
      btn.addEventListener('pointercancel', off);
      btn.addEventListener('pointerleave', off);
    };

    hold(ui.throttle, 'throttle');
    hold(ui.brake, 'brake');

    window.addEventListener('keydown', (event) => {
      if (event.code === 'ArrowRight' || event.code === 'KeyD') state.throttle = true;
      if (event.code === 'ArrowLeft' || event.code === 'KeyA') state.brake = true;
    });

    window.addEventListener('keyup', (event) => {
      if (event.code === 'ArrowRight' || event.code === 'KeyD') state.throttle = false;
      if (event.code === 'ArrowLeft' || event.code === 'KeyA') state.brake = false;
    });

    ui.restart.addEventListener('click', resetRun);

    ui.revive.addEventListener('click', async () => {
      if (!state.dead || state.revived) {
        setStatus('Ревайв возможен только 1 раз после аварии.');
        return;
      }
      const rewarded = await showRewardedAd();
      if (!rewarded) {
        setStatus('Нужно досмотреть рекламу, чтобы получить ревайв.');
        return;
      }

      state.dead = false;
      state.revived = true;
      state.bodyRotation = 0;
      state.angularVelocity = 0;
      state.yVelocity = -3.4;
      state.velocity = Math.max(state.velocity, 2.8);
      setStatus('Ревайв активирован. Поехали дальше!');
    });

    ui.unlockSunset.addEventListener('click', () => buy('skin', 'sunset', SKINS.sunset.unlock));
    ui.unlockWinter.addEventListener('click', () => buy('skin', 'winter', SKINS.winter.unlock));
    ui.buyUaz.addEventListener('click', () => buy('vehicle', 'uaz', VEHICLES.uaz.unlock));
    ui.buyGaz.addEventListener('click', () => buy('vehicle', 'gaz', VEHICLES.gaz.unlock));
    ui.iapCoins.addEventListener('click', purchaseCoinsPack);

    ui.vehicleSelect.addEventListener('change', () => {
      const nextVehicle = ui.vehicleSelect.value;
      if (!state.ownedVehicles.includes(nextVehicle)) {
        ui.vehicleSelect.value = state.selectedVehicle;
        setStatus('Сначала купи эту машину в гараже.');
        return;
      }
      state.selectedVehicle = nextVehicle;
      persist();
      resetRun();
      setStatus(`Машина изменена на ${VEHICLES[nextVehicle].name}. Заезд перезапущен.`);
    });

    ui.mapSkinSelect.addEventListener('change', () => {
      const nextSkin = ui.mapSkinSelect.value;
      if (!state.ownedSkins.includes(nextSkin)) {
        ui.mapSkinSelect.value = state.selectedSkin;
        setStatus('Сначала открой этот скин маршрута.');
        return;
      }
      state.selectedSkin = nextSkin;
      persist();
      resetRun();
      setStatus(`Карта: ${SKINS[nextSkin].name}. Заезд перезапущен с новыми условиями.`);
    });

    window.addEventListener('resize', resize);
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 16.666, 2.2);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  async function boot() {
    if (!state.ownedVehicles.includes(state.selectedVehicle)) state.selectedVehicle = 'lada';
    if (!state.ownedSkins.includes(state.selectedSkin)) state.selectedSkin = 'default';

    resize();
    bindEvents();
    refreshShop();
    resetRun();
    await initYandexSdk();

    setStatus('Rusty Ridge: бесконечные трассы, физика склонов, аномалии и кастомизация.');
    requestAnimationFrame(frame);
  }

  boot();
})();

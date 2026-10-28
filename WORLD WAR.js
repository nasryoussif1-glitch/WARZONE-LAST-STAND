```javascript
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

const loadingScreen = document.getElementById('loading-screen');
const startScreen = document.getElementById('start-screen');
const pauseScreen = document.getElementById('pause-screen');
const gameOverScreen = document.getElementById('game-over');

const healthText = document.getElementById('health');
const armorText = document.getElementById('armor');
const ammoText = document.getElementById('ammo');
const killsText = document.getElementById('kills');

let scene, camera, renderer, clock;
let started = false;
let paused = false;
let gameOver = false;

let health = 100;
let armor = 100;
let ammo = 30;
let reserveAmmo = 120;
let kills = 0;

let yaw = 0;
let pitch = 0;
let recoil = 0;
let reloadTimer = 0;
let shootCooldown = 0;
let damageTimer = 0;
let spawnTimer = 0;
let muzzleTimer = 0;

const keys = {};
const enemies = [];
const bullets = [];
const effects = [];

const raycaster = new THREE.Raycaster();
const center = new THREE.Vector2(0, 0);

const player = {
    position: new THREE.Vector3(0, 1.7, 8),
    velocity: new THREE.Vector3(),
    speed: 6,
    onGround: true
};

let enemyGroup;
let muzzleLight;
let weapon;

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x89918b);
    scene.fog = new THREE.FogExp2(0x89918b, 0.012);

    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        400
    );

    camera.rotation.order = 'YXZ';
    camera.position.copy(player.position);
    scene.add(camera);

    renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance'
    });

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    document.body.prepend(renderer.domElement);

    clock = new THREE.Clock();

    createLighting();
    createWorld();
    createWeapon();

    for (let i = 0; i < 7; i++) {
        spawnEnemy();
    }

    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', e => keys[e.code] = false);

    document.getElementById('start-button').onclick = startGame;
    document.getElementById('resume-button').onclick = resumeGame;
    document.getElementById('restart-button').onclick = () => location.reload();

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('pointerlockchange', onPointerLockChange);

    loadingScreen.style.opacity = '0';
    setTimeout(() => loadingScreen.style.display = 'none', 500);

    animate();
}

function createLighting() {
    const ambient = new THREE.HemisphereLight(0xdce6df, 0x454a38, 2);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffe2b0, 3);
    sun.position.set(-35, 60, -20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -70;
    sun.shadow.camera.right = 70;
    sun.shadow.camera.top = 70;
    sun.shadow.camera.bottom = -70;
    scene.add(sun);

    muzzleLight = new THREE.PointLight(0xffb65e, 0, 8);
    camera.add(muzzleLight);
}

function material(color, roughness = 0.9) {
    return new THREE.MeshStandardMaterial({
        color,
        roughness,
        metalness: 0.05
    });
}

function box(x, y, z, w, h, d, color, castShadow = true) {
    const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        material(color)
    );

    mesh.position.set(x, y, z);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
}

function createWorld() {
    // أرضية ترابية
    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(400, 400),
        material(0x777465)
    );

    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // شبكة طرق وممرات
    box(0, 0.015, 0, 9, 0.02, 400, 0x4b4c45, false);
    box(0, 0.025, 0, 0.12, 0.02, 400, 0xb7ae8e, false);

    // مبانٍ متضررة
    const buildings = [
        [-16, -12, 12, 14, 12],
        [18, -22, 14, 18, 12],
        [-22, 20, 16, 11, 14],
        [23, 15, 12, 15, 15],
        [-9, -36, 13, 18, 11],
        [15, 38, 18, 13, 15],
        [-38, -5, 12, 16, 12],
        [40, 0, 13, 20, 13]
    ];

    for (const [x, z, w, h, d] of buildings) {
        const colors = [0x65645c, 0x77736a, 0x545951, 0x77766e];
        const color = colors[Math.floor(Math.random() * colors.length)];

        box(x, h / 2, z, w, h, d, color);

        // نوافذ داكنة
        for (let i = -1; i <= 1; i++) {
            box(
                x + i * w * 0.25,
                h * 0.65,
                z + d / 2 + 0.015,
                1.4,
                1.8,
                0.05,
                0x222b2a,
                false
            );
        }

        // كتل خرسانية متناثرة
        for (let i = 0; i < 3; i++) {
            const debris = box(
                x + (Math.random() - 0.5) * w,
                0.3,
                z + (Math.random() - 0.5) * d,
                1 + Math.random() * 2,
                0.5 + Math.random(),
                1 + Math.random() * 2,
                0x625f55
            );

            debris.rotation.y = Math.random() * Math.PI;
        }
    }

    // حواجز وأكياس رمل
    for (let i = 0; i < 24; i++) {
        const x = (Math.random() - 0.5) * 70;
        const z = (Math.random() - 0.5) * 70;

        if (Math.abs(x) < 7 && Math.abs(z) < 7) continue;

        box(x, 0.55, z, 2.5, 1.1, 1.2, 0x716c50);
    }

    // أعمدة كهرباء
    for (let z = -50; z <= 50; z += 25) {
        box(6, 4, z, 0.25, 8, 0.25, 0x383b35);
        box(6, 7.7, z, 3, 0.15, 0.15, 0x383b35);
    }

    // السماء
    scene.fog.near = 15;
    scene.fog.far = 100;
}

function createWeapon() {
    weapon = new THREE.Group();

    const gunBody = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.17, 0.65),
        material(0x252b27, 0.45)
    );

    gunBody.position.set(0.32, -0.32, -0.7);
    weapon.add(gunBody);

    const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 0.5, 12),
        material(0x171b18, 0.35)
    );

    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0.32, -0.28, -1.15);
    weapon.add(barrel);

    const stock = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 0.15, 0.3),
        material(0x44473c)
    );

    stock.position.set(0.32, -0.33, -0.28);
    weapon.add(stock);

    const sight = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.09, 0.12),
        material(0x161a17)
    );

    sight.position.set(0.32, -0.205, -0.75);
    weapon.add(sight);

    camera.add(weapon);
}

function createEnemy() {
    const group = new THREE.Group();

    const uniform = material(0x333d30);
    const vestMat = material(0x202720);
    const skin = material(0x9b8069);
    const boots = material(0x242621);

    const torso = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.9, 0.4),
        uniform
    );
    torso.position.y = 1.25;
    torso.castShadow = true;
    group.add(torso);

    const vest = new THREE.Mesh(
        new THREE.BoxGeometry(0.73, 0.57, 0.43),
        vestMat
    );
    vest.position.set(0, 1.35, -0.02);
    group.add(vest);

    const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.23, 12, 10),
        skin
    );
    head.position.y = 1.94;
    head.castShadow = true;
    group.add(head);

    const helmet = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        material(0x454b3b)
    );
    helmet.position.y = 2.05;
    group.add(helmet);

    const limbs = [];

    for (const side of [-1, 1]) {
        const leg = new THREE.Mesh(
            new THREE.BoxGeometry(0.23, 0.72, 0.25),
            uniform
        );

        leg.position.set(side * 0.2, 0.45, 0);
        leg.castShadow = true;
        group.add(leg);
        limbs.push(leg);

        const boot = new THREE.Mesh(
            new THREE.BoxGeometry(0.25, 0.18, 0.38),
            boots
        );

        boot.position.set(side * 0.2, 0.09, -0.05);
        group.add(boot);

        const arm = new THREE.Mesh(
            new THREE.BoxGeometry(0.22, 0.7, 0.23),
            uniform
        );

        arm.position.set(side * 0.48, 1.25, -0.03);
        arm.rotation.z = side * -0.1;
        arm.castShadow = true;
        group.add(arm);
        limbs.push(arm);
    }

    // سلاح بصري يحمله العدو
    const enemyGun = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.12, 0.75),
        material(0x161a16)
    );

    enemyGun.position.set(0.18, 1.12, -0.32);
    group.add(enemyGun);

    const healthBack = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 0.08),
        new THREE.MeshBasicMaterial({ color: 0x242424 })
    );

    healthBack.position.y = 2.45;
    group.add(healthBack);

    const healthFill = new THREE.Mesh(
        new THREE.PlaneGeometry(0.86, 0.045),
        new THREE.MeshBasicMaterial({ color: 0x86ff55 })
    );

    healthFill.position.set(0, 2.45, 0.01);
    group.add(healthFill);

    group.userData = {
        hp: 100,
        limbs,
        healthFill,
        lastAttack: 0,
        phase: Math.random() * Math.PI * 2,
        alive: true
    };

    return group;
}

function spawnEnemy() {
    if (enemies.length >= 14 || gameOver) return;

    const enemy = createEnemy();

    let x, z;
    let attempts = 0;

    do {
        x = (Math.random() - 0.5) * 65;
        z = (Math.random() - 0.5) * 65;
        attempts++;
    } while (
        attempts < 30 &&
        (Math.hypot(x - player.position.x, z - player.position.z) < 15 ||
         Math.hypot(x, z) < 9)
    );

    enemy.position.set(x, 0, z);
    scene.add(enemy);
    enemies.push(enemy);
}

function startGame() {
    started = true;
    paused = false;
    startScreen.classList.add('hidden');

    renderer.domElement.requestPointerLock();
}

function onPointerLockChange() {
    if (!started || gameOver) return;

    if (document.pointerLockElement !== renderer.domElement && !paused) {
        paused = true;
        pauseScreen.classList.remove('hidden');
    } else if (document.pointerLockElement === renderer.domElement) {
        paused = false;
        pauseScreen.classList.add('hidden');
    }
}

function resumeGame() {
    renderer.domElement.requestPointerLock();
}

function onKeyDown(e) {
    keys[e.code] = true;

    if (e.code === 'Escape' && started && !gameOver) {
        if (document.pointerLockElement === renderer.domElement) {
            document.exitPointerLock();
        }
    }

    if (e.code === 'KeyR' && started && !paused) {
        reloadWeapon();
    }

    if (e.code === 'Space') {
        e.preventDefault();
        if (player.onGround && started && !paused) {
            player.velocity.y = 6;
            player.onGround = false;
        }
    }
}

function onMouseMove(e) {
    if (!started || paused || gameOver) return;
    if (document.pointerLockElement !== renderer.domElement) return;

    yaw -= e.movementX * 0.002;
    pitch -= e.movementY * 0.002;

    pitch = THREE.MathUtils.clamp(pitch, -1.45, 1.45);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
}

function onMouseDown(e) {
    if (e.button !== 0 || !started || paused || gameOver) return;
    if (document.pointerLockElement !== renderer.domElement) return;

    shoot();
}

function shoot() {
    if (shootCooldown > 0 || reloadTimer > 0) return;

    if (ammo <= 0) {
        reloadWeapon();
        return;
    }

    ammo--;
    shootCooldown = 0.15;
    recoil = Math.min(recoil + 0.035, 0.12);
    muzzleTimer = 0.055;

    muzzleLight.intensity = 5;
    camera.rotation.x = pitch + recoil;

    updateHUD();

    const flash = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffd28a })
    );

    flash.position.set(0.32, -0.28, -1.35);
    weapon.add(flash);

    effects.push({
        mesh: flash,
        life: 0.06,
        maxLife: 0.06
    });

    raycaster.setFromCamera(center, camera);
    raycaster.far = 90;

    const targets = [];

    for (const enemy of enemies) {
        if (!enemy.userData.alive) continue;

        enemy.traverse(obj => {
            if (obj.isMesh && obj !== enemy.userData.healthFill) {
                obj.userData.enemyRoot = enemy;
                targets.push(obj);
            }
        });
    }

    const hits = raycaster.intersectObjects(targets, false);

    if (hits.length > 0) {
        const target = hits[0].object;
        const enemy = target.userData.enemyRoot;

        if (enemy && enemy.userData.alive) {
            const isHead = target.geometry.type === 'SphereGeometry';

            enemy.userData.hp -= isHead ? 100 : 45;

            const fillScale = Math.max(0, enemy.userData.hp / 100);
            enemy.userData.healthFill.scale.x = fillScale;
            enemy.userData.healthFill.position.x = -(1 - fillScale) * 0.43;

            showHitMarker();

            createImpact(hits[0].point);

            if (enemy.userData.hp <= 0) {
                eliminateEnemy(enemy);
            }
        }
    }
}

function createImpact(position) {
    const spark = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0xffc36b })
    );

    spark.position.copy(position);
    scene.add(spark);

    effects.push({
        mesh: spark,
        life: 0.2,
        maxLife: 0.2
    });
}

function showHitMarker() {
    const marker = document.getElementById('hit-marker');
    marker.style.opacity = '1';

    setTimeout(() => {
        marker.style.opacity = '0';
    }, 100);
}

function eliminateEnemy(enemy) {
    enemy.userData.alive = false;
    kills++;

    killsText.textContent = String(kills).padStart(2, '0');

    // سقوط العدو
    const fall = setInterval(() => {
        if (!enemy.parent) {
            clearInterval(fall);
            return;
        }

        enemy.rotation.x += 0.1;

        if (enemy.rotation.x >= Math.PI / 2) {
            clearInterval(fall);
            scene.remove(enemy);

            const index = enemies.indexOf(enemy);
            if (index !== -1) enemies.splice(index, 1);
        }
    }, 20);

    if (kills >= 20) {
        endGame(true);
    }
}

function reloadWeapon() {
    if (reloadTimer > 0 || ammo >= 30 || reserveAmmo <= 0) return;

    reloadTimer = 1.7;

    const startAmmo = ammo;

    const interval = setInterval(() => {
        if (paused || gameOver) return;

        clearInterval(interval);

        const needed = 30 - startAmmo;
        const amount = Math.min(needed, reserveAmmo);

        ammo += amount;
        reserveAmmo -= amount;
        reloadTimer = 0;

        updateHUD();
    }, 1700);
}

function updateHUD() {
    healthText.textContent = health;
    armorText.textContent = armor;
    ammoText.innerHTML = `${ammo} <small>/ ${reserveAmmo}</small>`;

    document.getElementById('health-bar').style.width = health + '%';
    document.getElementById('armor-bar').style.width = armor + '%';
}

function takeDamage(amount) {
    if (gameOver || paused) return;

    const absorbed = Math.min(armor, amount * 0.7);
    armor -= absorbed;
    health -= amount - absorbed;

    health = Math.max(0, health);
    armor = Math.max(0, armor);

    updateHUD();

    const overlay = document.getElementById('damage-overlay');
    overlay.style.opacity = '1';

    setTimeout(() => overlay.style.opacity = '0', 180);

    if (health <= 0) {
        endGame(false);
    }
}

function endGame(victory) {
    gameOver = true;
    started = false;

    if (document.pointerLockElement) {
        document.exitPointerLock();
    }

    gameOverScreen.classList.remove('hidden');

    document.getElementById('result-title').textContent =
        victory ? 'MISSION COMPLETE' : 'MISSION FAILED';

    document.getElementById('result-text').textContent =
        victory
            ? `انتصرت في المعركة! عدد الأهداف التي تم القضاء عليها: ${kills}`
            : `انتهت المهمة. حققت ${kills} عملية إقصاء. حاول مرة أخرى!`;
}

function updatePlayer(dt) {
    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

    const direction = new THREE.Vector3();

    if (keys.KeyW) direction.add(forward);
    if (keys.KeyS) direction.sub(forward);
    if (keys.KeyD) direction.add(right);
    if (keys.KeyA) direction.sub(right);

    if (direction.lengthSq() > 0) {
        direction.normalize();

        const sprint = keys.ShiftLeft || keys.ShiftRight ? 1.55 : 1;

        player.position.addScaledVector(
            direction,
            player.speed * sprint * dt
        );
    }

    // القفز والجاذبية
    player.velocity.y -= 15 * dt;
    player.position.y += player.velocity.y * dt;

    if (player.position.y <= 1.7) {
        player.position.y = 1.7;
        player.velocity.y = 0;
        player.onGround = true;
    }

    // حدود منطقة القتال
    player.position.x = THREE.MathUtils.clamp(player.position.x, -75, 75);
    player.position.z = THREE.MathUtils.clamp(player.position.z, -75, 75);

    camera.position.copy(player.position);

    // اهتزاز بسيط أثناء الحركة
    if (direction.lengthSq() > 0 && player.onGround) {
        camera.position.y += Math.sin(performance.now() * 0.012) * 0.025;
    }
}

function updateEnemies(dt) {
    const now = performance.now() / 1000;

    for (const enemy of enemies) {
        if (!enemy.userData.alive) continue;

        const dx = player.position.x - enemy.position.x;
        const dz = player.position.z - enemy.position.z;
        const distance = Math.hypot(dx, dz);

        enemy.rotation.y = Math.atan2(-dx, -dz);

        if (distance > 7) {
            const speed = 1.1 + Math.min(kills * 0.025, 0.6);

            enemy.position.x += (dx / distance) * speed * dt;
            enemy.position.z += (dz / distance) * speed * dt;

            enemy.position.y =
                Math.abs(Math.sin(now * 7 + enemy.userData.phase)) * 0.035;
        } else if (now - enemy.userData.lastAttack > 1.1) {
            enemy.userData.lastAttack = now;

            if (Math.random() < 0.65) {
                takeDamage(7 + Math.random() * 5);
            }
        }

        // تحريك الأطراف
        const moving = distance > 7;

        enemy.userData.limbs.forEach((limb, i) => {
            limb.rotation.x = moving
                ? Math.sin(now * 7 + i * Math.PI) * 0.35
                : 0;
        });
    }
}

function updateEffects(dt) {
    for (let i = effects.length - 1; i >= 0; i--) {
        const effect = effects[i];

        effect.life -= dt;

        if (effect.life <= 0) {
            if (effect.mesh.parent) {
                effect.mesh.parent.remove(effect.mesh);
            }

            effects.splice(i, 1);
        }
    }

    if (muzzleTimer > 0) {
        muzzleTimer -= dt;

        if (muzzleTimer <= 0) {
            muzzleLight.intensity = 0;
        }
    }

    if (shootCooldown > 0) shootCooldown -= dt;

    recoil = THREE.MathUtils.lerp(recoil, 0, dt * 10);
}

function animate() {
    requestAnimationFrame(animate);

    const dt = Math.min(clock.getDelta(), 0.04);

    if (started && !paused && !gameOver) {
        updatePlayer(dt);
        updateEnemies(dt);
        updateEffects(dt);

        spawnTimer += dt;

        if (spawnTimer > 4 && enemies.length < 7) {
            spawnEnemy();
            spawnTimer = 0;
        }

        // تصحيح زاوية الكاميرا بعد ارتداد السلاح
        camera.rotation.x = pitch + recoil;

        renderer.render(scene, camera);
    } else {
        updateEffects(dt);
        renderer.render(scene, camera);
    }
}

function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
}

init();
```

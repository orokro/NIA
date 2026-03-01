/*
 * Copyright (C) 2017 Ben Smith
 *
 * This software may be modified and distributed under the terms
 * of the MIT license.  See the LICENSE file for details.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as TWEEN from '@tweenjs/tween.js';

"use strict";

// --- Constants & Config ---
const ROM_FILENAME = "rom/natsu-island.gb";
const CGB_COLOR_CURVE = 2;
const AUDIO_FRAMES = 4096;
const AUDIO_LATENCY_SEC = 0.1;
const MAX_UPDATE_SEC = 5 / 60;
const CPU_TICKS_PER_SECOND = 4194304;
const EVENT_NEW_FRAME = 1;
const EVENT_AUDIO_BUFFER_FULL = 2;
const EVENT_UNTIL_TICKS = 4;
const REWIND_FRAMES_PER_BASE_STATE = 45;
const REWIND_BUFFER_CAPACITY = 4 * 1024 * 1024;

const $ = document.querySelector.bind(document);

// --- State Machine ---
const States = {
    LOADING: 'LOADING',
    BAG_CLOSED: 'BAG_CLOSED',
    BAG_OPENING: 'BAG_OPENING',
    BAG_GONE: 'BAG_GONE',
    BOX_CLOSED: 'BOX_CLOSED',
    BOX_OPENING: 'BOX_OPENING',
    CART_OUT: 'CART_OUT',
    BOX_GONE: 'BOX_GONE',
    GB_APPEARING: 'GB_APPEARING',
    GB_READY: 'GB_READY',
    CART_INSERTING: 'CART_INSERTING',
    GB_OFF: 'GB_OFF',
    GB_POWERING_ON: 'GB_POWERING_ON',
    PLAYING: 'PLAYING'
};

let currentState = States.LOADING;

// --- Three.js Globals ---
let scene, camera, renderer, controls, raycaster, mouse;
let sceneModel, bagMesh, boxMesh, gbMesh, cartGroup, ledMesh;
let colliders = { boxTop: null, powerBtn: null, bagTop: null };
let cartEmpties = { start: null, out: null, flipped: null, inserted: null };
let screenTexture = null;
let currentToast = null;

// --- Emulator Globals ---
let emulator = null;
const binjgbPromise = window.Binjgb();

// --- Initialization ---

function initThree() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);

    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(6, 6, 12);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    $("#three-container").appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 1;
    controls.maxDistance = 50;

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
    dirLight.position.set(5, 15, 10);
    dirLight.castShadow = true;
    dirLight.shadow.bias = -0.001;
    dirLight.shadow.normalBias = 0.02;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);

    window.addEventListener('resize', onWindowResize);
    window.addEventListener('click', onDocumentClick);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function showToast(text, delay = 0) {
    setTimeout(() => {
        if (currentToast) {
            currentToast.classList.remove('show');
            setTimeout(() => currentToast.remove(), 300);
        }
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerText = text;
        $("#toast-container").appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 50);
        currentToast = toast;
    }, delay + 1500);
}

function hideToast() {
    if (currentToast) {
        currentToast.classList.remove('show');
        setTimeout(() => currentToast.remove(), 300);
        currentToast = null;
    }
}

async function loadAssets() {
    const loader = new GLTFLoader();
    const loadingBar = $('#loading-bar');
    const loadingOverlay = $('#loading-overlay');

    return new Promise((resolve) => {
        loader.load('3d/scene.glb', (gltf) => {
            sceneModel = gltf.scene;
            scene.add(sceneModel);
            
            sceneModel.traverse(child => {
                if (child.name === 'FLBag') bagMesh = child;
                if (child.name === 'GameBox') boxMesh = child;
                if (child.name === 'GameBoy') gbMesh = child;
                if (child.name === 'Cart') cartGroup = child;
                if (child.name === 'LED') ledMesh = child;
                if (child.name === 'Collider_BoxTop') colliders.boxTop = child;
                if (child.name === 'Collider_PowerButton') colliders.powerBtn = child;
                if (child.name === 'Collider_BagTop') colliders.bagTop = child;
                if (child.name === 'GB_Catridge_Start') cartEmpties.start = child;
                if (child.name === 'GB_Catridge_Out') cartEmpties.out = child;
                if (child.name === 'GB_Catridge_Flipped') cartEmpties.flipped = child;
                if (child.name === 'GB_Catridge_Inserted') cartEmpties.inserted = child;
                
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            if (ledMesh) ledMesh.visible = false;
            if (colliders.boxTop) colliders.boxTop.visible = false;
            if (colliders.powerBtn) colliders.powerBtn.visible = false;
            if (colliders.bagTop) colliders.bagTop.visible = false;

            setMorphValue(bagMesh, 'Top_Bent', 1.0);

            if (gbMesh) {
                gbMesh.position.y -= 20.0;
                gbMesh.visible = false;
            }

            loadingOverlay.style.opacity = '0';
            setTimeout(() => {
                loadingOverlay.style.display = 'none';
                resolve();
            }, 500);

        }, (xhr) => {
            const percent = (xhr.loaded / xhr.total) * 100;
            loadingBar.style.width = percent + '%';
        });
    });
}

function setMorphValue(mesh, name, value) {
    if (!mesh || !mesh.morphTargetDictionary) return;
    const index = mesh.morphTargetDictionary[name];
    if (index !== undefined) {
        mesh.morphTargetInfluences[index] = value;
    }
}

// --- Interaction ---

function onDocumentClick(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    if (currentState === States.BAG_CLOSED) {
        const intersects = raycaster.intersectObject(colliders.bagTop);
        if (intersects.length > 0) {
            if (colliders.bagTop.parent) colliders.bagTop.parent.remove(colliders.bagTop);
            openBag();
        }
    } else if (currentState === States.BOX_CLOSED) {
        const intersects = raycaster.intersectObject(colliders.boxTop);
        if (intersects.length > 0) openBox();
    } else if (currentState === States.GB_READY) {
        const intersects = raycaster.intersectObject(cartGroup, true);
        if (intersects.length > 0) insertCart();
    } else if (currentState === States.GB_OFF) {
        const intersects = raycaster.intersectObject(colliders.powerBtn);
        if (intersects.length > 0) powerOn();
    }
}

// --- Animation Steps ---

function openBag() {
    currentState = States.BAG_OPENING;
    hideToast();

    const wave1 = { t: 0 };
    new TWEEN.Tween(wave1)
        .to({ t: 1 }, 1200)
        .easing(TWEEN.Easing.Quadratic.InOut)
        .onUpdate(() => {
            setMorphValue(bagMesh, 'Top_Bent', 1.0 - wave1.t);
            setMorphValue(bagMesh, 'Top_Opening', Math.sin(wave1.t * Math.PI));
        })
        .onComplete(() => {
            new TWEEN.Tween({ v: 0 })
                .to({ v: 1 }, 600)
                .easing(TWEEN.Easing.Quadratic.Out)
                .onUpdate(obj => setMorphValue(bagMesh, 'Top_Open', obj.v))
                .onComplete(() => {
                    bagGone();
                })
                .start();
        })
        .start();
}

function bagGone() {
    currentState = States.BAG_GONE;
    new TWEEN.Tween(bagMesh.position)
        .to({ y: -25.0 }, 3000)
        .easing(TWEEN.Easing.Quadratic.In)
        .onComplete(() => {
            bagMesh.visible = false;
            currentState = States.BOX_CLOSED;
            showToast("Click the top of the box to open", 3500);
        })
        .start();
}

function openBox() {
    currentState = States.BOX_OPENING;
    hideToast();

    new TWEEN.Tween({ t: 0 })
        .to({ t: 1 }, 1200)
        .easing(TWEEN.Easing.Quadratic.InOut)
        .onUpdate(obj => {
            setMorphValue(boxMesh, 'Open_1', obj.t);
            setMorphValue(boxMesh, 'Open_2', Math.sin(obj.t * Math.PI));
        })
        .onComplete(() => {
            new TWEEN.Tween({ t: 0 })
                .to({ t: 1 }, 1000)
                .easing(TWEEN.Easing.Quadratic.InOut)
                .onUpdate(obj => {
                    setMorphValue(boxMesh, 'Open_1', 1.0 - (obj.t * 0.99));
                    setMorphValue(boxMesh, 'Open_3', obj.t);
                    setMorphValue(boxMesh, 'Flaps_Open', obj.t);
                })
                .onComplete(() => {
                    cartMovingOut();
                })
                .start();
        })
        .start();
}

function cartMovingOut() {
    currentState = States.CART_OUT;
    new TWEEN.Tween(cartGroup.position)
        .to({ x: cartEmpties.out.position.x, y: cartEmpties.out.position.y, z: cartEmpties.out.position.z }, 1500)
        .easing(TWEEN.Easing.Quadratic.Out)
        .onComplete(() => {
            boxGone();
        })
        .start();
}

function boxGone() {
    currentState = States.BOX_GONE;
    new TWEEN.Tween(boxMesh.position)
        .to({ y: -25.0 }, 3000)
        .easing(TWEEN.Easing.Quadratic.In)
        .onComplete(() => {
            boxMesh.visible = false;
            gameboyAppearing();
        })
        .start();
}

function gameboyAppearing() {
    currentState = States.GB_APPEARING;
    gbMesh.visible = true;
    gbMesh.position.y = -25.0;
    new TWEEN.Tween(gbMesh.position)
        .to({ y: 0 }, 2000)
        .easing(TWEEN.Easing.Back.Out)
        .onComplete(() => {
            currentState = States.GB_READY;
            showToast("Click the cartridge to insert", 3500);
        })
        .start();
}

function insertCart() {
    currentState = States.CART_INSERTING;
    hideToast();

    const startPos = cartGroup.position.clone();
    const startQuat = cartGroup.quaternion.clone();
    
    new TWEEN.Tween({ t: 0 })
        .to({ t: 1 }, 1500)
        .easing(TWEEN.Easing.Quadratic.InOut)
        .onUpdate(obj => {
            cartGroup.position.lerpVectors(startPos, cartEmpties.flipped.position, obj.t);
            cartGroup.quaternion.slerpQuaternions(startQuat, cartEmpties.flipped.quaternion, obj.t);
        })
        .onComplete(() => {
            new TWEEN.Tween(cartGroup.position)
                .to({ x: cartEmpties.inserted.position.x, y: cartEmpties.inserted.position.y, z: cartEmpties.inserted.position.z }, 800)
                .easing(TWEEN.Easing.Quadratic.In)
                .onComplete(() => {
                    currentState = States.GB_OFF;
                    showToast("Click the power button on the GameBoy", 3000);
                })
                .start();
        })
        .start();
}

function powerOn() {
    currentState = States.GB_POWERING_ON;
    hideToast();

    new TWEEN.Tween({ t: 0 })
        .to({ t: 1 }, 500)
        .onUpdate(obj => setMorphValue(gbMesh, 'On', obj.t))
        .onComplete(() => {
            if (ledMesh) ledMesh.visible = true;
            startEmulator();
        })
        .start();
}

async function startEmulator() {
    $("#emulator-controls").style.display = "block";
    $("#controls-panel").style.width = "220px";

    const canvas = $("#mainCanvas");
    canvas.width = 160;
    canvas.height = 144;

    let response = await fetch(ROM_FILENAME);
    let romBuffer = await response.arrayBuffer();
    const extRamStored = localStorage.getItem("extram");
    const extRam = extRamStored ? new Uint8Array(JSON.parse(extRamStored)) : null;
    
    Emulator.start(await binjgbPromise, romBuffer, extRam);
    emulator.setBuiltinPalette(83);

    gbMesh.traverse((child) => {
        if (child.isMesh && child.name === "GB_02_low_Screen__0") {
            screenTexture = new THREE.CanvasTexture(canvas);
            screenTexture.flipY = false;
            screenTexture.minFilter = THREE.NearestFilter;
            screenTexture.magFilter = THREE.NearestFilter;
            screenTexture.wrapS = THREE.ClampToEdgeWrapping;
            screenTexture.wrapT = THREE.ClampToEdgeWrapping;
            child.material = new THREE.MeshBasicMaterial({ map: screenTexture });
        }
    });

    currentState = States.PLAYING;
}

function animate() {
    requestAnimationFrame(animate);
    TWEEN.update();
    controls.update();
    if (currentState === States.PLAYING && screenTexture) screenTexture.needsUpdate = true;
    renderer.render(scene, camera);
}

(async function main() {
    initThree();
    await loadAssets();
    animate();
    currentState = States.BAG_CLOSED;
    showToast("Click the bag to open", 2500);
})();

class VM {
    constructor() {
        this.extRamUpdated = false;
        this.volume = 0.5;
        this.palIdx = 83;
        setInterval(() => {
            if (this.extRamUpdated) { this.updateExtRam(); this.extRamUpdated = false; }
        }, 1000);
    }
    updateExtRam() {
        if (!emulator) return;
        const extram = emulator.getExtRam();
        localStorage.setItem("extram", JSON.stringify(Array.from(extram)));
    }
}
const vm = new VM();

function makeWasmBuffer(module, ptr, size) {
    return new Uint8Array(module.HEAP8.buffer, ptr, size);
}

class Emulator {
    static start(module, romBuffer, extRamBuffer) {
        if (emulator) emulator.destroy();
        emulator = new Emulator(module, romBuffer, extRamBuffer);
        window.emulator = emulator;
        emulator.run();
    }
    constructor(module, romBuffer, extRamBuffer) {
        this.module = module;
        this.romDataPtr = this.module._malloc(romBuffer.byteLength);
        makeWasmBuffer(this.module, this.romDataPtr, romBuffer.byteLength).set(new Uint8Array(romBuffer));
        this.e = this.module._emulator_new_simple(this.romDataPtr, romBuffer.byteLength, Audio.ctx.sampleRate, AUDIO_FRAMES, CGB_COLOR_CURVE);
        this.gamepad = new Gamepad(module, this.e);
        this.audio = new Audio(module, this.e);
        this.video = new Video(module, this.e, $("#mainCanvas"));
        this.rewind = new Rewind(module, this.e);
        this.lastRafSec = 0;
        this.leftoverTicks = 0;
        if (extRamBuffer) this.loadExtRam(extRamBuffer);
        this.bindKeys();
        this.gamepad.init();
    }
    destroy() {
        this.gamepad.shutdown();
        this.unbindKeys();
        cancelAnimationFrame(this.rafCancelToken);
        this.rewind.destroy();
        this.module._emulator_delete(this.e);
        this.module._free(this.romDataPtr);
    }
    loadExtRam(extRamBuffer) {
        const fileDataPtr = this.module._ext_ram_file_data_new(this.e);
        const buffer = makeWasmBuffer(this.module, this.module._get_file_data_ptr(fileDataPtr), this.module._get_file_data_size(fileDataPtr));
        if (buffer.byteLength === extRamBuffer.byteLength) {
            buffer.set(new Uint8Array(extRamBuffer));
            this.module._emulator_read_ext_ram(this.e, fileDataPtr);
        }
        this.module._file_data_delete(fileDataPtr);
    }
    getExtRam() {
        const fileDataPtr = this.module._ext_ram_file_data_new(this.e);
        const buffer = makeWasmBuffer(this.module, this.module._get_file_data_ptr(fileDataPtr), this.module._get_file_data_size(fileDataPtr));
        this.module._emulator_write_ext_ram(this.e, fileDataPtr);
        const result = new Uint8Array(buffer);
        this.module._file_data_delete(fileDataPtr);
        return result;
    }
    setBuiltinPalette(palIdx) { this.module._emulator_set_builtin_palette(this.e, palIdx); }
    run() { this.rafCancelToken = requestAnimationFrame(this.rafCallback.bind(this)); }
    runUntil(ticks) {
        while (true) {
            const event = this.module._emulator_run_until_f64(this.e, ticks);
            if (event & EVENT_NEW_FRAME) { this.rewind.pushBuffer(); this.video.uploadTexture(); }
            if (event & EVENT_AUDIO_BUFFER_FULL) this.audio.pushBuffer();
            if (event & EVENT_UNTIL_TICKS) break;
        }
        if (this.module._emulator_was_ext_ram_updated(this.e)) vm.extRamUpdated = true;
    }
    get ticks() { return this.module._emulator_get_ticks_f64(this.e); }
    rafCallback(startMs) {
        this.rafCancelToken = requestAnimationFrame(this.rafCallback.bind(this));
        const startSec = startMs / 1000;
        const deltaSec = Math.max(startSec - (this.lastRafSec || startSec), 0);
        const deltaTicks = Math.min(deltaSec, MAX_UPDATE_SEC) * CPU_TICKS_PER_SECOND;
        const runUntilTicks = this.ticks + deltaTicks - this.leftoverTicks;
        this.runUntil(runUntilTicks);
        this.leftoverTicks = (this.ticks - runUntilTicks) | 0;
        this.lastRafSec = startSec;
        this.video.renderTexture();
    }
    bindKeys() {
        this.keyFuncs = {};
        const updateMorph = (morph, val) => { if (currentState === States.PLAYING) setMorphValue(gbMesh, morph, val); };
        customControls.down.forEach(k => { this.keyFuncs[k.toLowerCase()] = (s) => { this.module._set_joyp_down(this.e, s); updateMorph('Down', s ? 1.0 : 0.0); }; });
        customControls.up.forEach(k => { this.keyFuncs[k.toLowerCase()] = (s) => { this.module._set_joyp_up(this.e, s); updateMorph('Up', s ? 1.0 : 0.0); }; });
        customControls.left.forEach(k => { this.keyFuncs[k.toLowerCase()] = (s) => { this.module._set_joyp_left(this.e, s); updateMorph('Left', s ? 1.0 : 0.0); }; });
        customControls.right.forEach(k => { this.keyFuncs[k.toLowerCase()] = (s) => { this.module._set_joyp_right(this.e, s); updateMorph('Right', s ? 1.0 : 0.0); }; });
        customControls.a.forEach(k => { this.keyFuncs[k.toLowerCase()] = (s) => { this.module._set_joyp_A(this.e, s); updateMorph('A', s ? 1.0 : 0.0); }; });
        customControls.b.forEach(k => { this.keyFuncs[k.toLowerCase()] = (s) => { this.module._set_joyp_B(this.e, s); updateMorph('B', s ? 1.0 : 0.0); }; });
        customControls.start.forEach(k => { this.keyFuncs[k.toLowerCase()] = (s) => { this.module._set_joyp_start(this.e, s); updateMorph('Start', s ? 1.0 : 0.0); }; });
        customControls.select.forEach(k => { this.keyFuncs[k.toLowerCase()] = (s) => { this.module._set_joyp_select(this.e, s); updateMorph('Select', s ? 1.0 : 0.0); }; });
        this.onKD = (e) => { if (this.keyFuncs[e.key.toLowerCase()]) { this.keyFuncs[e.key.toLowerCase()](true); e.preventDefault(); } };
        this.onKU = (e) => { if (this.keyFuncs[e.key.toLowerCase()]) { this.keyFuncs[e.key.toLowerCase()](false); e.preventDefault(); } };
        window.addEventListener("keydown", this.onKD);
        window.addEventListener("keyup", this.onKU);
    }
    unbindKeys() { window.removeEventListener("keydown", this.onKD); window.removeEventListener("keyup", this.onKU); }
}

class Gamepad {
    constructor(module, e) { this.module = module; this.e = e; }
    init() {
        window.addEventListener("gamepadconnected", (e) => this.startPolling(e.gamepad));
        const gps = navigator.getGamepads();
        if (gps[0]) this.startPolling(gps[0]);
    }
    startPolling(gp) {
        setInterval(() => {
            const gamepad = navigator.getGamepads()[gp.index];
            if (!gamepad) return;
            this.module._set_joyp_A(this.e, gamepad.buttons[1].pressed);
            this.module._set_joyp_B(this.e, gamepad.buttons[0].pressed);
            this.module._set_joyp_start(this.e, gamepad.buttons[9].pressed);
            this.module._set_joyp_select(this.e, gamepad.buttons[8].pressed);
            this.module._set_joyp_up(this.e, gamepad.buttons[12].pressed || gamepad.axes[1] < -0.5);
            this.module._set_joyp_down(this.e, gamepad.buttons[13].pressed || gamepad.axes[1] > 0.5);
            this.module._set_joyp_left(this.e, gamepad.buttons[14].pressed || gamepad.axes[0] < -0.5);
            this.module._set_joyp_right(this.e, gamepad.buttons[15].pressed || gamepad.axes[0] > 0.5);
        }, 16);
    }
    shutdown() {}
}

class Audio {
    constructor(module, e) {
        this.buffer = makeWasmBuffer(module, module._get_audio_buffer_ptr(e), module._get_audio_buffer_capacity(e));
        this.startSec = 0;
        this.started = false;
        const start = () => { this.started = true; Audio.ctx.resume(); window.removeEventListener("click", start); };
        window.addEventListener("click", start);
    }
    pushBuffer() {
        if (!this.started) return;
        const now = Audio.ctx.currentTime;
        const latency = now + AUDIO_LATENCY_SEC;
        this.startSec = this.startSec || latency;
        if (this.startSec >= now) {
            const b = Audio.ctx.createBuffer(2, AUDIO_FRAMES, Audio.ctx.sampleRate);
            const c0 = b.getChannelData(0), c1 = b.getChannelData(1);
            for (let i = 0; i < AUDIO_FRAMES; i++) {
                c0[i] = (this.buffer[2 * i] * vm.volume) / 255;
                c1[i] = (this.buffer[2 * i + 1] * vm.volume) / 255;
            }
            const s = Audio.ctx.createBufferSource();
            s.buffer = b; s.connect(Audio.ctx.destination);
            s.start(this.startSec);
            this.startSec += AUDIO_FRAMES / Audio.ctx.sampleRate;
        } else { this.startSec = latency; }
    }
}
Audio.ctx = new (window.AudioContext || window.webkitAudioContext)();

class Video {
    constructor(module, e, el) {
        this.ctx = el.getContext("2d");
        this.imageData = this.ctx.createImageData(160, 144);
        this.buffer = makeWasmBuffer(module, module._get_frame_buffer_ptr(e), module._get_frame_buffer_size(e));
    }
    uploadTexture() { this.imageData.data.set(this.buffer); }
    renderTexture() { this.ctx.putImageData(this.imageData, 0, 0); }
}

class Rewind {
    constructor(module, e) {
        this.module = module; this.e = e;
        this.joypadBufferPtr = this.module._joypad_new();
        this.bufferPtr = this.module._rewind_new_simple(e, REWIND_FRAMES_PER_BASE_STATE, REWIND_BUFFER_CAPACITY);
        this.module._emulator_set_default_joypad_callback(e, this.joypadBufferPtr);
    }
    destroy() { this.module._rewind_delete(this.bufferPtr); this.module._joypad_delete(this.joypadBufferPtr); }
    pushBuffer() { this.module._rewind_append(this.bufferPtr, this.e); }
}

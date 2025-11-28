import { SegmentDisplayReader } from './SegmentDisplayReader.js';


const rotate180 = localStorage.getItem('rotate180') !== 'false';

const history = document.getElementById('history');
const output = document.getElementById('output');
const canvas = document.getElementById('canvas');
const message = document.getElementById('message');
const calibrateButton = document.getElementById('calibrate');
const toggleDebugButton = document.getElementById('debug-toggle');
const rotate180Checkbox = document.getElementById('rotate-180');
const configButton = document.getElementById('config-button');
const configSlideover = document.getElementById('config-slideover');
const closeConfigButton = document.getElementById('close-config');

const video = document.getElementById('video');

if (video instanceof HTMLVideoElement === false
    && video instanceof VideoFrame === false
    && video instanceof HTMLCanvasElement === false
    && video instanceof HTMLImageElement === false
    && video instanceof SVGImageElement === false
    && video instanceof OffscreenCanvas === false
    && video instanceof ImageBitmap === false

) {
    throw new Error('Video element not found');
}

if (!(canvas instanceof HTMLCanvasElement) || !(calibrateButton instanceof HTMLButtonElement) ||!output || !history || !message) {
    throw new Error('GUI elements not found');
}

if (calibrateButton instanceof HTMLButtonElement === false) {
    throw new Error('Calibrate button not found');
}

//if (video instanceof HTMLVideoElement === false) {
//    throw new Error('No Video element found');
//}

if (toggleDebugButton instanceof HTMLButtonElement === false) {
    throw new Error('Debug toggle button not found');
}

if (rotate180Checkbox instanceof HTMLInputElement === false) {
    throw new Error('Rotate 180 checkbox not found');
}

const reader = new SegmentDisplayReader(video, canvas);
// Config Button & Slideover
if (configButton instanceof HTMLButtonElement === false) {
    throw new Error('Config button not found');
}

if (configSlideover instanceof HTMLDivElement === false) {
    throw new Error('Config slideover not found');
}
configButton.addEventListener('click', () => {
    configSlideover.classList.add('open');
});

if (closeConfigButton instanceof HTMLButtonElement === false) {
    throw new Error('Close config button not found');
}

closeConfigButton.addEventListener('click', () => {
    configSlideover.classList.remove('open');
});

document.addEventListener('click', (event) => {
    const target = event.target;
    if (target instanceof Node &&
        configSlideover.classList.contains('open') &&
        !configSlideover.contains(target) &&
        target !== configButton) {
        configSlideover.classList.remove('open');
    }
});

// Rotation
reader.rotate180 = rotate180;
rotate180Checkbox.checked = rotate180;
if (video) {
    video.classList.toggle('rotated', rotate180);
}

rotate180Checkbox.addEventListener('change', ({ target }) => {
    if (target instanceof HTMLInputElement) {
        const doRotation = target?.checked;
        reader.rotate180 = doRotation;
        localStorage.setItem('rotate180', doRotation.toString());
        if (reader.source instanceof HTMLVideoElement) {
            reader.source.classList.toggle('rotated', doRotation);

        }
    }
});

toggleDebugButton.addEventListener('click', () => {
    const value = !reader.showDebugMask;
    reader.showDebugMask = value;
    toggleDebugButton.innerText = value ? 'Disable Debug Overlay' : 'Enable Debug Overlay';
    canvas.classList[value ? 'remove' : 'add']('hidden');
    video.classList[value ? 'add' : 'remove']('hidden');
});

reader.addEventListener('output', (event) => {
    console.log('Output event received @ index.js');
    const { value } = /** @type {CustomEvent} */ (event).detail;
    output.innerText = value;
    const span = document.createElement('span');
    span.innerText = value;
    history.prepend(span);
    history.prepend(document.createElement('br'));
});

reader.addEventListener('statusMessage', (event) => {
    message.innerText = /** @type {CustomEvent} */(event).detail.message;
});

reader.addEventListener('readStart', () => console.log('Reading started'));

calibrateButton.addEventListener('click', () => reader.captureCalibrationImage());

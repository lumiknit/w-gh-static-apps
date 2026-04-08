import '@/styles/core.css';
import '@/styles/navbar.css';
import './style.css';

import QRCode from 'qrcode-svg';
import QrScanner from 'qr-scanner';
import { getElemById } from '@/lib/fore';
import * as i18n from '@/lib/i18n';

// Tab switching logic
const btnGen = getElemById<HTMLButtonElement>('btn-gen');
const btnFromImage = getElemById<HTMLButtonElement>('btn-from-image');
const btnFromCamera = getElemById<HTMLButtonElement>('btn-from-camera');

const sectionGen = getElemById('section-gen');
const sectionFromImage = getElemById('section-from-image');
const sectionFromCamera = getElemById('section-from-camera');

let currentMode = 'Gen';
let qrScanner: any = null;

function switchMode(mode: string) {
	if (currentMode === mode) return;
	currentMode = mode;

	btnGen.className = mode === 'Gen' ? '' : 'ghost';
	btnFromImage.className = mode === 'From Image' ? '' : 'ghost';
	btnFromCamera.className = mode === 'From Camera' ? '' : 'ghost';

	sectionGen.hidden = mode !== 'Gen';
	sectionFromImage.hidden = mode !== 'From Image';
	sectionFromCamera.hidden = mode !== 'From Camera';

	if (qrScanner) {
		qrScanner.stop();
		if (qrScanner.destroy) qrScanner.destroy();
		qrScanner = null;
	}

	if (mode === 'From Camera') {
		startCamera();
	}
}

btnGen.addEventListener('click', () => switchMode('Gen'));
btnFromImage.addEventListener('click', () => switchMode('From Image'));
btnFromCamera.addEventListener('click', () => switchMode('From Camera'));

// Gen logic
const genText = getElemById<HTMLTextAreaElement>('gen-text');
const colorDark = getElemById<HTMLInputElement>('color-dark');
const colorLight = getElemById<HTMLSelectElement>('color-light');
const genEcl = getElemById<HTMLSelectElement>('gen-ecl');
const genOutput = getElemById('gen-output');
const btnGenerate = getElemById<HTMLButtonElement>('btn-generate');
const btnShare = getElemById<HTMLButtonElement>('btn-share');

let generatedSVG = '';

btnGenerate.addEventListener('click', (e) => {
	e.preventDefault();
	const qr = new QRCode({
		content: genText.value,
		padding: 2,
		color: colorDark.value,
		background: colorLight.value,
		ecl: genEcl.value as 'L' | 'M' | 'H' | 'Q',
		container: 'svg-viewbox',
	});
	const svg = qr.svg();
	generatedSVG = svg;
	genOutput.innerHTML = svg;

	if (navigator.share !== undefined) {
		btnShare.hidden = false;
	}
});

function dataURItoBlob(dataURI: string) {
	const byteString =
		dataURI.split(',')[0].indexOf('base64') >= 0
			? atob(dataURI.split(',')[1])
			: unescape(dataURI.split(',')[1]);
	const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
	const ia = new Uint8Array(byteString.length);
	for (let i = 0; i < byteString.length; i++) {
		ia[i] = byteString.charCodeAt(i);
	}
	return new Blob([ia], { type: mimeString });
}

btnShare.addEventListener('click', () => {
	if (!generatedSVG || !navigator.share) return;

	let img = new Image();
	let svgBlob = new Blob([generatedSVG], { type: 'image/svg+xml' });
	let url = URL.createObjectURL(svgBlob);

	img.onload = () => {
		let canvas = document.createElement('canvas');
		canvas.width = img.width;
		canvas.height = img.height;
		let ctx = canvas.getContext('2d');

		ctx?.drawImage(img, 0, 0);
		window.URL.revokeObjectURL(url);
		let png = canvas.toDataURL('image/jpeg');
		canvas.remove();

		const blob = dataURItoBlob(png);

		navigator
			.share({
				title: 'QR Code',
				files: [new File([blob], 'qr.jpeg', { type: 'image/jpeg' })],
			})
			.catch(console.error);
	};
	img.src = url;
});

// Scan from Image logic
const qrFile = getElemById<HTMLInputElement>('qr-file');
const btnScanImage = getElemById<HTMLButtonElement>('btn-scan-image');
const scanImageProgress = getElemById<HTMLProgressElement>(
	'scan-image-progress'
);
const scanImageOutput = getElemById('scan-image-output');

btnScanImage.addEventListener('click', async () => {
	const file = qrFile.files?.[0];
	if (!file) {
		scanImageOutput.textContent = i18n.s('scan_no_file');
		return;
	}
	scanImageProgress.hidden = false;
	scanImageOutput.textContent = '';

	try {
		const result = await QrScanner.scanImage(file, {
			returnDetailedScanResult: true,
		});
		// @ts-ignore
		scanImageOutput.textContent = result.data || result;
	} catch (e) {
		scanImageOutput.textContent = i18n.s('scan_failed');
	}
	scanImageProgress.hidden = true;
});

// Scan from Camera logic
const qrVideo = getElemById<HTMLVideoElement>('qr-video');
const scanCameraOutput = getElemById('scan-camera-output');

function startCamera() {
	scanCameraOutput.textContent = '';
	// @ts-ignore
	qrScanner = new QrScanner(
		qrVideo,
		(result: any) => {
			scanCameraOutput.textContent = result.data || result;
		},
		{
			returnDetailedScanResult: true,
			highlightScanRegion: true,
			highlightCodeOutline: true,
		}
	);
	qrScanner.start();
}

// --- Init ---
async function init() {
	const rawTR = import.meta.glob('./lang/*.json', { import: 'default' });
	await i18n.install(i18n.importGlobToTranslationLoader(rawTR, './lang/'));
}

init();

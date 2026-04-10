import '@/lib/service-worker/install';
import '@/styles/core.css';
import '@/styles/navbar.css';
import './style.css';

import { getElemById } from '@/lib/fore';

const canvas = getElemById<HTMLCanvasElement>('calendarCanvas');
const widthInput = getElemById<HTMLInputElement>('widthInput');
const heightInput = getElemById<HTMLInputElement>('heightInput');
const presetSelect = getElemById<HTMLSelectElement>('presetSelect');
const bgColor = getElemById<HTMLInputElement>('bgColor');
const fgColor = getElemById<HTMLInputElement>('fgColor');
const randomColorBtn = getElemById<HTMLButtonElement>('randomColorBtn');
const fontFamily = getElemById<HTMLInputElement>('fontFamily');
const yearInput = getElemById<HTMLInputElement>('yearInput');
const yearSize = getElemById<HTMLInputElement>('yearSize');
const dateSize = getElemById<HTMLInputElement>('dateSize');
const saveBtn = getElemById<HTMLButtonElement>('saveBtn');

const randomColor = () => {
	bgColor.value = `#${Math.floor(Math.random() * 0xffffff)
		.toString(16)
		.padStart(6, '0')}`;
	fgColor.value = `#${Math.floor(Math.random() * 0xffffff)
		.toString(16)
		.padStart(6, '0')}`;
};

if (randomColorBtn) {
	randomColorBtn.onclick = () => {
		randomColor();
		drawCalendar();
	};
}

type Preset = { label: string; w: number; h: number };
const presets: Preset[] = [
	{ label: 'FHD 1920×1080', w: 1920, h: 1080 },
	{ label: 'WHD 2560×1440', w: 2560, h: 1440 },
	{ label: '4K 3840×2160', w: 3840, h: 2160 },
	{ label: 'Portrait FHD 1080×2160', w: 1080, h: 2160 },
	{ label: 'Portrait FHD 1440×3200', w: 1440, h: 3200 },
];

function populatePresets() {
	if (!presetSelect) return;
	presetSelect.innerHTML = '';
	presets.forEach((p) => {
		const opt = document.createElement('option');
		opt.value = JSON.stringify(p);
		opt.textContent = p.label;
		presetSelect.appendChild(opt);
	});
}

function monthsBySunday(year: number): Record<number, number[]> {
	const map: Record<number, number[]> = {};
	for (let d = 1; d <= 7; d++) map[d] = [];
	for (let month = 1; month <= 12; month++) {
		for (let d = 1; d <= 7; d++) {
			const dt = new Date(year, month - 1, d);
			if (dt.getMonth() !== month - 1) continue;
			if (dt.getDay() === 0) map[d].push(month);
		}
	}
	return map;
}

function setCanvasSizeByInputs() {
	if (!widthInput || !heightInput) return;
	const w = parseInt(widthInput.value, 10) || 1920;
	const h = parseInt(heightInput.value, 10) || 1080;
	canvas.width = w;
	canvas.height = h;
}

function drawCalendar() {
	const ctx = canvas.getContext('2d');
	if (!ctx) return;

	const setFont = (sizePx: number, bold: boolean = false) => {
		ctx.font = `${bold ? 'bold ' : ''}${sizePx}px '${
			fontFamily?.value || 'sans-serif'
		}'`;
	};

	ctx.fillStyle = bgColor?.value || '#000';
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	const fg = fgColor?.value || '#fff';
	const cols = 13;
	const dRatio = parseFloat(dateSize?.value || '') || 0.03;
	const dsPx = Math.max(8, Math.round(canvas.height * dRatio));

	const cellFontToCellHeight = 3.2;
	const cellAspect = 1.0;
	const separatorSpanCells = 7;
	const separatorAlpha = 0.25;

	const desiredCellH = Math.round(dsPx * cellFontToCellHeight);
	const desiredCellW = Math.round(desiredCellH * cellAspect);

	const cellW = Math.floor(desiredCellW);
	const cellH = Math.floor(desiredCellH);

	const calW = cellW * cols;
	const calH = cellH * 6;

	const calTop = Math.round((canvas.height - calH) / 2);
	const calLeft = Math.round((canvas.width - calW) / 2);

	ctx.fillStyle = fg;

	const year =
		parseInt(yearInput?.value || '', 10) || new Date().getFullYear();
	const yRatio = parseFloat(yearSize?.value || '') || 0.08;
	const ySizePx = Math.max(8, Math.round(canvas.height * yRatio));
	setFont(ySizePx, true);
	ctx.textAlign = 'center';
	ctx.textBaseline = 'top';
	ctx.fillText(String(year), canvas.width / 2, calTop - ySizePx * 1.2);

	setFont(dsPx);
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';

	for (let r = 0; r < 7; r++) {
		for (let c = 0; c < cols; c++) {
			const num = (r - 1) * 7 + c + 1; // sequential numbering
			const x = calLeft + c * cellW + cellW / 2;
			const y = calTop + r * cellH + cellH / 2;
			if (num < 1 || num > 31) continue;
			ctx.fillStyle = fg;
			setFont(dsPx, r === 1 && c < 7);
			ctx.fillText(String(num), x, y);
		}
	}

	const smallFont = Math.max(10, Math.round(dsPx * 0.7));
	setFont(smallFont);

	const dayToMonths = monthsBySunday(year);

	for (let day = 1; day <= 7; day++) {
		const months = dayToMonths[day];
		if (!months || months.length === 0) continue;

		const rr = 1;
		const cc = day - 1;
		const cellX = calLeft + cc * cellW + cellW / 2;
		const cellY = calTop + rr * cellH + cellH / 2;

		const radius = Math.min(cellW, cellH) * 0.28;
		ctx.beginPath();
		ctx.fillStyle = fg;
		ctx.globalAlpha = 0.12;
		ctx.arc(cellX, cellY, radius, 0, Math.PI * 2);
		ctx.fill();
		ctx.globalAlpha = 1;

		ctx.fillStyle = fg;
		setFont(smallFont);
		ctx.textAlign = 'center';

		const monthsText = months.join(' / ');
		ctx.fillText(monthsText, cellX, cellY - radius - smallFont / 2);
	}

	const sepCells = separatorSpanCells;
	const sepWidth = sepCells * cellW;
	const sepLeft = Math.round((canvas.width - sepWidth) / 2);
	const sepY = calTop;
	ctx.strokeStyle = fg;
	ctx.globalAlpha = separatorAlpha;
	const baseLineWidth = Math.max(1, Math.round(cellH * 0.06));
	ctx.lineWidth = baseLineWidth;
	ctx.beginPath();
	ctx.moveTo(sepLeft, sepY);
	ctx.lineTo(sepLeft + sepWidth, sepY);
	ctx.stroke();
	ctx.globalAlpha = 1;
}

if (widthInput) {
	widthInput.addEventListener('change', () => {
		setCanvasSizeByInputs();
		drawCalendar();
	});
}
if (heightInput) {
	heightInput.addEventListener('change', () => {
		setCanvasSizeByInputs();
		drawCalendar();
	});
}
if (presetSelect) {
	presetSelect.addEventListener('change', () => {
		try {
			const p = JSON.parse(presetSelect.value) as Preset;
			if (widthInput) widthInput.value = String(p.w);
			if (heightInput) heightInput.value = String(p.h);
			setCanvasSizeByInputs();
			drawCalendar();
		} catch (e) {}
	});
}

[bgColor, fgColor, yearInput, yearSize, dateSize, fontFamily].forEach((el) => {
	if (el) {
		el.addEventListener('input', drawCalendar);
		el.addEventListener('change', drawCalendar);
	}
});

if (saveBtn) {
	saveBtn.addEventListener('click', () => {
		const data = canvas.toDataURL('image/png');
		const a = document.createElement('a');
		a.href = data;
		a.download = `calendar-${yearInput?.value || 'calendar'}.png`;
		document.body.appendChild(a);
		a.click();
		a.remove();
	});
}

// initialization
async function init() {
	populatePresets();
	randomColor();
	setCanvasSizeByInputs();
	drawCalendar();
}

init();

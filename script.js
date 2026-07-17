/* =========================================================
   IT u senzorskim sistemima — logika stranice
   - učitava CSV (podrazumevano data/merenja.csv, uz ugrađeni primer kao rezervu)
   - crta grafik (Chart.js v4), tabelu i statistiku po senzoru
   - drag & drop upload, preuzimanje CSV-a, tabele i grafika kao slike
   ========================================================= */


const CHART_COLORS = ['#ff9900', '#e619b3', '#e60000', '#800000', '#33cc33', '#0033cc', '#845ef7'];


let chart = null;
let currentCSVText = '';
let currentSeries = [];
let tableColumnSeriesIndex = [];
let tableTimeColIndex = null;

/* Vremenska osa: čuvamo sirove vrednosti (u sekundama) da bismo mogli
   da prebacujemo prikaz sekunde <-> minuti bez ponovnog parsiranja CSV-a */
let currentTimeUnit = 'sec';
let currentLabelsSeconds = [];
let currentXTitle = '';
let currentXUnit = '';


/* Ugrađeni primer — koristi se ako fajl data/merenja.csv nije dostupan
   (npr. kad se stranica otvori lokalno duplim klikom). */
const SAMPLE_CSV = `Vreme,Temperatura,Zvuk,Svetlost,Pritisak,Vlaznost,Comment
s,°C,dB,lux,kPa,%,
0,22.4,41,490,101.26,52,
1,22.9,44,505,101.30,51,
2,23.5,48,527,101.38,50,
3,24.1,53,548,101.41,49,
4,24.4,55,556,101.39,49,
5,24.2,52,545,101.33,50,
6,23.6,47,520,101.27,51,
7,22.8,42,498,101.22,52,
8,22.2,39,478,101.20,53,
9,22.0,38,470,101.23,53,
10,22.4,41,486,101.29,52`;


document.addEventListener('DOMContentLoaded', () => {
  setupUpload();
  setupScroll();
  setupWave();
  setupDownloads();
  setupYAxisControl();
  setupTimeUnitControl();
  loadDefault();
});


/* ---------- Učitavanje ---------- */
function loadDefault() {
  fetch('data/merenja.csv?v=' + Date.now())
    .then(r => { if (!r.ok) throw new Error('nema fajla'); return r.text(); })
    .then(text => handleCSV(text))
    .catch(() => handleCSV(SAMPLE_CSV));
}


function setupUpload() {
  const input = document.getElementById('csvFile');
  const zone = document.getElementById('dropzone');


  input.addEventListener('change', e => {
    if (e.target.files.length) readFile(e.target.files[0]);
  });


  zone.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
  });


  ['dragenter', 'dragover'].forEach(ev =>
    zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(ev =>
    zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.remove('drag'); }));


  zone.addEventListener('drop', e => {
    const file = e.dataTransfer.files[0];
    if (file) readFile(file);
  });
}


function readFile(file) {
  const reader = new FileReader();
  reader.onload = ev => handleCSV(ev.target.result);
  reader.onerror = () => setStatus('Greška pri čitanju fajla.');
  reader.readAsText(file, 'UTF-8');
}


function setStatus(msg) { document.getElementById('csvStatus').textContent = msg; }


/* ---------- Obrada CSV-a ---------- */
function handleCSV(text) {
  currentCSVText = text;
  const parsed = Papa.parse(text.trim(), { skipEmptyLines: true });
  let rows = parsed.data.filter(r => r.some(c => (c ?? '').toString().trim() !== ''));
  if (rows.length < 2) { setStatus('Fajl nema dovoljno podataka.'); return; }


  const titles = rows[0].map(s => (s || '').toString().trim());


  let units = null, dataStart = 1;
  if (rows.length > 2 && numericRatio(rows[1]) < 0.5 && numericRatio(rows[2]) >= 0.5) {
    units = rows[1].map(s => (s || '').toString().trim());
    dataStart = 2;
  }


  const commentIdx = titles.findIndex(t => /comment|komentar/i.test(t));


  const dataRows = rows.slice(dataStart);
  const xIndex = 0;
  const labels = dataRows.map(r => (r[xIndex] ?? '').toString().trim());

  currentLabelsSeconds = labels.map(l => toNum(l));
  currentXTitle = titles[xIndex];
  currentXUnit = units ? (units[xIndex] || '') : '';


  const series = [];
  const seenTitles = {};
  for (let c = 0; c < titles.length; c++) {
    if (c === xIndex || c === commentIdx) continue;
    const values = dataRows.map(r => toNum(r[c]));
    if (values.filter(v => v !== null).length < dataRows.length * 0.5) continue;
    let label = titles[c] || ('Kolona ' + c);
    seenTitles[label] = (seenTitles[label] || 0) + 1;
    if (seenTitles[label] > 1) label = label + ' (' + seenTitles[label] + ')';
    series.push({
      title: label,
      unit: units ? (units[c] || '') : '',
      values,
      col: c
    });
  }


  if (!series.length) { setStatus('Nije pronađena nijedna numerička kolona.'); return; }


  currentSeries = series;


  setStatus('Učitano uzoraka: ' + dataRows.length + '  ·  senzora: ' + series.length);
  renderStats(series);
  renderChart(labels, series, titles[xIndex], units ? units[xIndex] : '');
  renderTable(titles, units, dataRows, commentIdx, xIndex, series);


  applyYAxisMode(currentYAxisMode);
  applyTimeUnitMode(currentTimeUnit);
}


function numericRatio(row) {
  const cells = row.filter(c => (c ?? '').toString().trim() !== '');
  if (!cells.length) return 0;
  return cells.filter(c => toNum(c) !== null).length / cells.length;
}


function toNum(v) {
  if (v === null || v === undefined) return null;
  const s = v.toString().trim().replace(',', '.');
  if (s === '') return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}


/* ---------- Statistika po senzoru ---------- */
function renderStats(series) {
  const box = document.getElementById('stats');
  box.innerHTML = '';
  series.forEach((s, i) => {
    const nums = s.values.filter(v => v !== null);
    const min = Math.min(...nums), max = Math.max(...nums);
    const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
    const color = CHART_COLORS[i % CHART_COLORS.length];
    const el = document.createElement('div');
    el.className = 'stat';
    el.style.borderLeftColor = color;
    el.innerHTML =
      '<div class="name">' + esc(s.title) + (s.unit ? ' [' + esc(s.unit) + ']' : '') + '</div>' +
      '<div class="big" style="color:' + color + '">' + round(avg) + '</div>' +
      '<div class="range">min ' + round(min) + ' · max ' + round(max) + '</div>';
    box.appendChild(el);
  });
}


/* ---------- Grafik ---------- */
function renderChart(labels, series, xTitle, xUnit) {
  if (chart) chart.destroy();
  const ctx = document.getElementById('myChart').getContext('2d');


  const datasets = series.map((s, i) => {
    const color = CHART_COLORS[i % CHART_COLORS.length];
    return {
      label: s.title + (s.unit ? ' (' + s.unit + ')' : ''),
      data: s.values,
      borderColor: color,
      backgroundColor: color,
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 4,
      tension: 0,
      fill: false,
      spanGaps: true
    };
  });


  chart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false },
      animation: false,
      hover: { animationDuration: 0 },
      responsiveAnimationDuration: 0,
      plugins: {
        title: { display: true, text: 'Rezultati merenja', font: { size: 18, family: 'Space Grotesk' } },
        legend: {
          position: 'bottom',
          labels: { boxWidth: 14, font: { family: 'Inter' } },
          onClick: function (e, legendItem, legend) {
            const index = legendItem.datasetIndex;
            const ci = legend.chart;
            if (ci.isDatasetVisible(index)) {
              ci.hide(index);
              legendItem.hidden = true;
            } else {
              ci.show(index);
              legendItem.hidden = false;
            }
            applyYAxisMode(currentYAxisMode);
            syncTableVisibility();
          }
        },
        tooltip: {
          callbacks: {
            title: items => {
              const unit = currentTimeUnit === 'min' ? 'min' : (currentXUnit || 's');
              return (currentXTitle || 'x') + ': ' + items[0].label + ' ' + unit;
            }
          }
        }
      },
      scales: {
        x: { title: { display: !!xTitle, text: xTitle + (xUnit ? ' [' + xUnit + ']' : '') }, ticks: { maxTicksLimit: 12 } },
        y: { beginAtZero: false }
      }
    }
  });
}


/* ---------- Kontrola Y ose (Default Range / Min to Max / Zero to Max) ---------- */
let currentYAxisMode = 'default';


function setupYAxisControl() {
  const select = document.getElementById('yAxisMode');
  if (!select) return;
  select.addEventListener('change', e => {
    currentYAxisMode = e.target.value;
    applyYAxisMode(currentYAxisMode);
  });
}


function getVisibleValues() {
  if (!chart || !currentSeries.length) return [];
  const visible = [];
  currentSeries.forEach((s, i) => {
    if (chart.isDatasetVisible(i)) {
      visible.push(...s.values.filter(v => v !== null));
    }
  });
  return visible.length ? visible : currentSeries.flatMap(s => s.values.filter(v => v !== null));
}


function applyYAxisMode(mode) {
  if (!chart || !currentSeries.length) return;


  const allValues = getVisibleValues();
  if (!allValues.length) return;


  const dataMin = Math.min(...allValues);
  const dataMax = Math.max(...allValues);


  if (mode === 'minmax') {
    chart.options.scales.y.min = dataMin;
    chart.options.scales.y.max = dataMax;
  } else if (mode === 'zeromax') {
    chart.options.scales.y.min = 0;
    chart.options.scales.y.max = dataMax;
  } else {
    delete chart.options.scales.y.min;
    delete chart.options.scales.y.max;
  }


  chart.update();
}


/* ---------- Kontrola vremenske ose (Sekunde / Minuti) ---------- */
function setupTimeUnitControl() {
  const select = document.getElementById('timeUnitMode');
  if (!select) return;
  select.addEventListener('change', e => {
    applyTimeUnitMode(e.target.value);
  });
}


function applyTimeUnitMode(mode) {
  if (!chart || !currentLabelsSeconds.length) return;
  currentTimeUnit = mode;

  const factor = mode === 'min' ? 60 : 1;
  const unitLabel = mode === 'min' ? 'min' : (currentXUnit || 's');

  chart.data.labels = currentLabelsSeconds.map(v => v === null ? null : round(v / factor));
  chart.options.scales.x.title.text = currentXTitle + ' [' + unitLabel + ']';
  chart.update();

  updateTableTimeColumn();
}


// ažurira vrednosti u koloni "Time" unutar tabele tako da prate izabranu
// vremensku jedinicu (sekunde ili minuti) — poziva se svaki put kad se promeni izbor
function updateTableTimeColumn() {
  const table = document.getElementById('dataTable');
  if (!table || tableTimeColIndex === null || tableTimeColIndex < 0) return;

  const factor = currentTimeUnit === 'min' ? 60 : 1;
  const unitLabel = currentTimeUnit === 'min' ? 'min' : (currentXUnit || 's');

  const tbody = table.querySelector('tbody');
  if (!tbody) return;

  const rows = tbody.querySelectorAll('tr');
  let dataRowIndex = 0;
  rows.forEach(row => {
    const cell = row.children[tableTimeColIndex];
    if (!cell) return;
    if (row.classList.contains('units')) {
      cell.textContent = unitLabel;
      return;
    }
    const raw = currentLabelsSeconds[dataRowIndex];
    cell.textContent = raw === null ? '' : round(raw / factor);
    dataRowIndex++;
  });
}


/* ---------- Tabela ---------- */
function renderTable(titles, units, dataRows, commentIdx, xIndex, series) {
  const keep = titles.map((_, i) => i).filter(i => i !== commentIdx);

  tableColumnSeriesIndex = keep.map(i => {
    const idx = series.findIndex(s => s.col === i);
    return idx === -1 ? null : idx;
  });

  tableTimeColIndex = keep.indexOf(xIndex);


  const colorMap = {};
  series.forEach((s, i) => {
    colorMap[s.col] = CHART_COLORS[i % CHART_COLORS.length];
  });


  let html = '<thead><tr>';
  keep.forEach(i => {
    const color = colorMap[i];
    const style = color ? 'style="background:' + color + ';color:#fff;"' : '';
    html += '<th ' + style + '>' + esc(titles[i]) + '</th>';
  });
  html += '</tr></thead><tbody>';


  if (units) {
    html += '<tr class="units">';
    keep.forEach(i => {
      const color = colorMap[i];
      const style = color ? 'style="color:' + color + ';"' : '';
      html += '<td ' + style + '>' + esc(units[i] || '') + '</td>';
    });
    html += '</tr>';
  }


  dataRows.forEach(r => {
    html += '<tr>';
    keep.forEach(i => {
      const color = colorMap[i];
      const style = color ? 'style="color:' + color + ';font-weight:600;"' : '';
      html += '<td ' + style + '>' + esc((r[i] ?? '').toString()) + '</td>';
    });
    html += '</tr>';
  });
  html += '</tbody>';
  document.getElementById('dataTable').innerHTML = html;

  syncTableVisibility();
}


function syncTableVisibility() {
  const table = document.getElementById('dataTable');
  if (!table || !chart) return;
  const rows = table.querySelectorAll('tr');
  rows.forEach(row => {
    const cells = row.children;
    tableColumnSeriesIndex.forEach((si, idx) => {
      if (si === null) return;
      const cell = cells[idx];
      if (!cell) return;
      cell.style.display = chart.isDatasetVisible(si) ? '' : 'none';
    });
  });
}


/* ---------- Preuzimanja ---------- */
function setupDownloads() {
  document.getElementById('downloadCsvBtn').addEventListener('click', () => {
    if (!currentCSVText) return;
    const blob = new Blob([currentCSVText], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(URL.createObjectURL(blob), 'merenja_ITSenzori.csv');
  });


  const tableBtn = document.getElementById('downloadTableBtn');
  if (tableBtn) {
    tableBtn.addEventListener('click', () => {
      if (!currentSeries.length || !chart) return;

      const visibleSeries = currentSeries.filter((s, i) => chart.isDatasetVisible(i));
      if (!visibleSeries.length) return;

      const xUnitLabel = currentTimeUnit === 'min' ? 'min' : (currentXUnit || 's');
      let csv = (currentXTitle || 'Vreme') + ' [' + xUnitLabel + ']';
      visibleSeries.forEach(s => {
        csv += ',' + s.title + (s.unit ? ' [' + s.unit + ']' : '');
      });
      csv += '\n';

      const labels = chart.data.labels;
      labels.forEach((lab, i) => {
        csv += lab;
        visibleSeries.forEach(s => {
          csv += ',' + (s.values[i] ?? '');
        });
        csv += '\n';
      });

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      triggerDownload(URL.createObjectURL(blob), 'tabela_obradjeni_podaci.csv');
    });
  }


  document.getElementById('downloadPngBtn').addEventListener('click', () => {
    if (!chart) return;
    triggerDownload(chart.toBase64Image(), 'grafik_merenja.png');
  });
}


function triggerDownload(href, filename) {
  const a = document.createElement('a');
  a.href = href; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
}


/* ---------- Skrol: traka napretka + dugme na vrh ---------- */
function setupScroll() {
  const bar = document.getElementById('scrollProgress');
  const btn = document.getElementById('scrollTopBtn');
  window.addEventListener('scroll', () => {
    const h = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.width = (h > 0 ? (window.scrollY / h) * 100 : 0) + '%';
    btn.style.display = window.scrollY > 300 ? 'block' : 'none';
  });
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}


/* ---------- Animirani talas u zaglavlju ---------- */
function setupWave() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const path = document.getElementById('waveA');
  if (!path) return;
  let t = 0;
  setInterval(() => {
    t += 0.15;
    let d = 'M0,45';
    for (let x = 0; x <= 1200; x += 40) {
      const y = 45 + Math.sin(x / 90 + t) * 16;
      d += ' L' + x + ',' + y.toFixed(1);
    }
    path.setAttribute('d', d);
  }, 60);
}


/* ---------- Pomoćne ---------- */
function round(n) { return Math.round(n * 100) / 100; }
function esc(s) {
  return (s ?? '').toString()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

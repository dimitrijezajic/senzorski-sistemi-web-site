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
  // cache-busting: dodaje se timestamp da bi browser uvek povukao svežu verziju fajla
  fetch('data/merenja.csv?v=' + Date.now())
    .then(r => { if (!r.ok) throw new Error('nema fajla'); return r.text(); })
    .then(text => handleCSV(text))
    .catch(() => handleCSV(SAMPLE_CSV)); // rezerva
}


function setupUpload() {
  const input = document.getElementById('csvFile');
  const zone = document.getElementById('dropzone');


  input.addEventListener('change', e => {
    if (e.target.files.length) readFile(e.target.files[0]);
  });


  // klik na tastaturi (Enter/Space) otvara birač fajlova
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


  // da li je drugi red red sa jedinicama? (uglavnom nenumerički, a treći numerički)
  let units = null, dataStart = 1;
  if (rows.length > 2 && numericRatio(rows[1]) < 0.5 && numericRatio(rows[2]) >= 0.5) {
    units = rows[1].map(s => (s || '').toString().trim());
    dataStart = 2;
  }


  // izbaci "Comment" kolonu ako postoji
  const commentIdx = titles.findIndex(t => /comment|komentar/i.test(t));


  const dataRows = rows.slice(dataStart);
  const xIndex = 0; // prva kolona = x-osa (npr. vreme)
  const labels = dataRows.map(r => (r[xIndex] ?? '').toString().trim());

  // čuvamo sirove sekunde i naziv/jedinicu x-ose za kasnije prebacivanje sec <-> min
  currentLabelsSeconds = labels.map(l => toNum(l));
  currentXTitle = titles[xIndex];
  currentXUnit = units ? (units[xIndex] || '') : '';


  // sastavi numeričke serije (dupli nazivi kolona dobijaju redni broj radi jasnoće)
  const series = [];
  const seenTitles = {};
  for (let c = 0; c < titles.length; c++) {
    if (c === xIndex || c === commentIdx) continue;
    const values = dataRows.map(r => toNum(r[c]));
    if (values.filter(v => v !== null).length < dataRows.length * 0.5) continue; // preskoči nenumeričku kolonu
    let label = titles[c] || ('Kolona ' + c);
    seenTitles[label] = (seenTitles[label] || 0) + 1;
    if (seenTitles[label] > 1) label = label + ' (' + seenTitles[label] + ')';
    series.push({
      title: label,
      unit: units ? (units[c] || '') : '',
      values,
      col: c   // pamtimo originalni indeks kolone da bi boje u tabeli pratile grafik
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
          }
        },
        tooltip: {
          callbacks: {
            // koristi TRENUTNU vremensku jedinicu (sec/min), da tooltip prati X-osu
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


// uzima u obzir SAMO senzore koji su trenutno uključeni (čekirani) u legendi
function getVisibleValues() {
  if (!chart || !currentSeries.length) return [];
  const visible = [];
  currentSeries.forEach((s, i) => {
    if (chart.isDatasetVisible(i)) {
      visible.push(...s.values.filter(v => v !== null));
    }
  });
  // ako je slučajno sve isključeno, vrati sve vrednosti kao rezervu
  return visible.length ? visible : currentSeries.flatMap(s => s.values.filter(v => v !== null));
}


function applyYAxisMode(mode) {
  if (!chart || !currentSeries.length) return;


  const allValues = getVisibleValues();
  if (!allValues.length) return;


  const dataMin = Math.min(...allValues);
  const dataMax = Math.max(...allValues);


  if (mode === 'minmax') {
    // Min to Max: osa ide tačno od najmanje do najveće izmerene vrednosti (samo vidljivih senzora)
    chart.options.scales.y.min = dataMin;
    chart.options.scales.y.max = dataMax;
  } else if (mode === 'zeromax') {
    // Zero to Max: osa uvek počinje od nule do najveće vrednosti (samo vidljivih senzora)
    chart.options.scales.y.min = 0;
    chart.options.scales.y.max = dataMax;
  } else {
    // Default Range: prepusti Chart.js-u da sam izračuna "lep" opseg
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
}


/* ---------- Tabela ---------- */
function renderTable(titles, units, dataRows, commentIdx, xIndex, series) {
  const keep = titles.map((_, i) => i).filter(i => i !== commentIdx);


  // boje se dodeljuju TAČNO onim kolonama koje su postale serije na grafiku,
  // istim redosledom — tako se tabela i grafik uvek poklapaju
  // (nenumeričke kolone i x-osa ostaju bez boje, isto kao na grafiku)
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
}


/* ---------- Preuzimanja ---------- */
function setupDownloads() {
  // originalni, sirovi CSV fajl (nepromenjen, bez obzira na prikaz sec/min)
  document.getElementById('downloadCsvBtn').addEventListener('click', () => {
    if (!currentCSVText) return;
    const blob = new Blob([currentCSVText], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(URL.createObjectURL(blob), 'merenja_ITSenzori.csv');
  });


  // export SAMO tabele obrađenih podataka (npr. p(t) i slično) — pratimo trenutni
  // prikaz na grafiku (sekunde ili minuti) i SAMO trenutno vidljive senzore
  const tableBtn = document.getElementById('downloadTableBtn');
  if (tableBtn) {
    tableBtn.addEventListener('click', () => {
      if (!currentSeries.length || !chart) return;

      // filtriramo samo senzore koji su trenutno UKLJUČENI (vidljivi) na grafiku
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

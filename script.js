const STORAGE_KEY = 'athlete_monitoring_records_v1';
let currentPeriod = '';
let chartInstance = null;
let confirmCallback = null;
let currentFilteredRecords = []; // 保存當前畫面篩選的數據供匯出使用

// 初始化：設定今日日期與現在時間
window.addEventListener('DOMContentLoaded', () => {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  document.getElementById('record-date').value = todayStr;
  document.getElementById('date-start').value = todayStr;
  document.getElementById('date-end').value = todayStr;
  
  const timeStr = now.toTimeString().slice(0, 5);
  document.getElementById('m-time').value = timeStr;
  document.getElementById('e-time').value = timeStr;

  // 若先前填過姓名與量級，自動帶入方便重複填寫
  const lastUser = JSON.parse(localStorage.getItem('last_athlete_info') || 'null');
  if (lastUser) {
    document.getElementById('athlete-name').value = lastUser.name || '';
    document.getElementById('weight-class').value = lastUser.weightClass || '';
  }
});

// ================= 自訂提示彈窗邏輯（取代原生 alert/confirm） =================
function showAlert(message, onConfirm = null, icon = '⚠️') {
  document.getElementById('custom-alert-message').innerText = message;
  document.getElementById('custom-alert-icon').innerText = icon;
  confirmCallback = onConfirm;

  const cancelBtn = document.getElementById('custom-cancel-btn');
  cancelBtn.style.display = onConfirm ? 'inline-block' : 'none';

  document.getElementById('custom-alert-modal').style.display = 'flex';
}

function handleCustomConfirm() {
  document.getElementById('custom-alert-modal').style.display = 'none';
  if (typeof confirmCallback === 'function') {
    const cb = confirmCallback;
    confirmCallback = null;
    cb();
  }
}

function closeCustomAlert() {
  document.getElementById('custom-alert-modal').style.display = 'none';
  confirmCallback = null;
}

// ================= 主分頁與表單步驟控制 =================
function switchTab(tab) {
  document.getElementById('nav-form').classList.toggle('active', tab === 'form');
  document.getElementById('nav-dashboard').classList.toggle('active', tab === 'dashboard');
  
  document.getElementById('section-form').style.display = tab === 'form' ? 'block' : 'none';
  document.getElementById('section-dashboard').style.display = tab === 'dashboard' ? 'block' : 'none';

  if (tab === 'dashboard') {
    populateAthleteFilters();
    renderDashboard();
  }
}

function goToStep(stepNum) {
  const name = document.getElementById('athlete-name').value.trim();
  const date = document.getElementById('record-date').value;
  const wClass = document.getElementById('weight-class').value.trim();

  if (stepNum === 2) {
    if (!name || !date || !wClass) {
      showAlert('請先完整填寫「姓名」、「日期」與「參賽量級」！');
      return;
    }
    document.getElementById('display-user-info').innerText = `${name}（${wClass}）｜${date}`;
  }

  document.querySelectorAll('.form-step').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));

  if (stepNum === 1) {
    document.getElementById('step-1').classList.add('active');
    document.getElementById('indicator-1').classList.add('active');
  } else if (stepNum === 2) {
    document.getElementById('step-2').classList.add('active');
    document.getElementById('indicator-1').classList.add('active');
    document.getElementById('indicator-2').classList.add('active');
  }
}

function selectPeriod(period) {
  currentPeriod = period;
  document.querySelectorAll('.form-step').forEach(el => el.classList.remove('active'));
  
  document.getElementById('indicator-1').classList.add('active');
  document.getElementById('indicator-2').classList.add('active');
  document.getElementById('indicator-3').classList.add('active');

  if (period === 'morning') {
    document.getElementById('step-3-morning').classList.add('active');
  } else {
    document.getElementById('step-3-evening').classList.add('active');
  }
}

// 表單送出（實名制 + 同一天早晚自動合併）
document.getElementById('athlete-form').addEventListener('submit', function(e) {
  e.preventDefault();

  const name = document.getElementById('athlete-name').value.trim();
  const date = document.getElementById('record-date').value;
  const weightClass = document.getElementById('weight-class').value.trim();

  localStorage.setItem('last_athlete_info', JSON.stringify({ name, weightClass }));

  let records = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  let existingIndex = records.findIndex(r => r.name === name && r.date === date);
  let recordObj = existingIndex > -1 ? records[existingIndex] : {
    name,
    date,
    weightClass,
    morning: null,
    evening: null
  };

  recordObj.weightClass = weightClass;

  if (currentPeriod === 'morning') {
    const weight = document.getElementById('m-weight').value;
    const time = document.getElementById('m-time').value;
    const energy = document.getElementById('m-energy').value;
    const summary = document.getElementById('m-summary').value.trim();

    if (!weight || !time || !summary) {
      showAlert('請完整填寫早上所有欄位！');
      return;
    }

    recordObj.morning = {
      weight: parseFloat(weight),
      time,
      energy: parseInt(energy),
      summary
    };
  } else if (currentPeriod === 'evening') {
    const weight = document.getElementById('e-weight').value;
    const time = document.getElementById('e-time').value;
    const satisfaction = document.getElementById('e-satisfaction').value;
    const training = document.getElementById('e-training').value.trim();
    const fatigue = document.getElementById('e-fatigue').value;
    const injury = document.getElementById('e-injury').value.trim();

    if (!weight || !time || !training || !injury) {
      showAlert('請完整填寫晚上所有欄位！');
      return;
    }

    recordObj.evening = {
      weight: parseFloat(weight),
      time,
      satisfaction: parseInt(satisfaction),
      training,
      fatigue: parseInt(fatigue),
      injury
    };
  }

  if (existingIndex > -1) {
    records[existingIndex] = recordObj;
  } else {
    records.push(recordObj);
  }

  records.sort((a, b) => new Date(b.date) - new Date(a.date));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));

  showAlert(`${name} 的${currentPeriod === 'morning' ? '早上' : '晚上'}數據已成功送出並整合！`, () => {
    goToStep(1);
  }, '✅');
});

// ================= 數據統合、多模式篩選與報表渲染 =================
function toggleFilterMode() {
  const mode = document.getElementById('filter-mode').value;
  document.getElementById('box-single-athlete').style.display = (mode === 'single') ? 'flex' : 'none';
  document.getElementById('box-custom-athletes').style.display = (mode === 'custom') ? 'flex' : 'none';
  renderDashboard();
}

function handleRangeChange() {
  const range = document.getElementById('filter-range').value;
  const dateBox = document.getElementById('box-custom-date');
  dateBox.style.display = (range === 'custom') ? 'flex' : 'none';
  renderDashboard();
}

function populateAthleteFilters() {
  const records = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  const names = [...new Set(records.map(r => r.name))];
  
  // 1. 單一選手下拉選單
  const select = document.getElementById('filter-athlete');
  const currentSelected = select.value;
  select.innerHTML = '<option value="">-- 請選擇選手 --</option>';
  names.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.innerText = name;
    select.appendChild(opt);
  });
  if (names.includes(currentSelected)) {
    select.value = currentSelected;
  } else if (names.length > 0) {
    select.value = names[0];
  }

  // 2. 部分選手多選清單
  const checkboxContainer = document.getElementById('athlete-checkboxes');
  const previouslyChecked = Array.from(checkboxContainer.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
  
  checkboxContainer.innerHTML = '';
  if (names.length === 0) {
    checkboxContainer.innerHTML = '<span style="color:#94a3b8; font-size:0.85rem;">尚無選手資料</span>';
    return;
  }

  names.forEach(name => {
    const lbl = document.createElement('label');
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.value = name;
    chk.checked = previouslyChecked.length === 0 || previouslyChecked.includes(name);
    chk.onchange = renderDashboard;
    
    lbl.appendChild(chk);
    lbl.appendChild(document.createTextNode(name));
    checkboxContainer.appendChild(lbl);
  });
}

function renderDashboard() {
  const mode = document.getElementById('filter-mode').value;
  const range = document.getElementById('filter-range').value;
  const records = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');

  const tbody = document.getElementById('records-tbody');
  const statsDiv = document.getElementById('summary-stats');
  const chartDiv = document.getElementById('chart-container');

  if (records.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-msg">尚無任何回報資料</td></tr>';
    statsDiv.style.display = 'none';
    chartDiv.style.display = 'none';
    currentFilteredRecords = [];
    return;
  }

  // 1. 依據檢視模式篩選選手
  let targetRecords = [];
  if (mode === 'all') {
    targetRecords = records;
  } else if (mode === 'single') {
    const singleName = document.getElementById('filter-athlete').value;
    if (!singleName) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-msg">請先選擇一位選手</td></tr>';
      statsDiv.style.display = 'none';
      chartDiv.style.display = 'none';
      currentFilteredRecords = [];
      return;
    }
    targetRecords = records.filter(r => r.name === singleName);
  } else if (mode === 'custom') {
    const checkedBoxes = document.querySelectorAll('#athlete-checkboxes input[type="checkbox"]:checked');
    const selectedNames = Array.from(checkedBoxes).map(cb => cb.value);
    targetRecords = records.filter(r => selectedNames.includes(r.name));
  }

  // 2. 依據統計區間篩選日期
  const todayStr = new Date().toISOString().split('T')[0];
  if (range === 'today') {
    targetRecords = targetRecords.filter(r => r.date === todayStr);
  } else if (range === '7' || range === '30') {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - parseInt(range));
    const cutoffStr = cutoff.toISOString().split('T')[0];
    targetRecords = targetRecords.filter(r => r.date >= cutoffStr);
  } else if (range === 'custom') {
    const start = document.getElementById('date-start').value;
    const end = document.getElementById('date-end').value;
    if (start && end) {
      targetRecords = targetRecords.filter(r => r.date >= start && r.date <= end);
    }
  }

  currentFilteredRecords = targetRecords;

  if (targetRecords.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-msg">此篩選條件與時間區間內無紀錄</td></tr>';
    statsDiv.style.display = 'none';
    chartDiv.style.display = 'none';
    return;
  }

  statsDiv.style.display = 'grid';
  chartDiv.style.display = (mode === 'single') ? 'block' : 'none';

  // 計算平均數值
  let mWeights = [], eWeights = [], energies = [], sats = [], fats = [];
  tbody.innerHTML = '';

  targetRecords.forEach(r => {
    if (r.morning) {
      mWeights.push(r.morning.weight);
      energies.push(r.morning.energy);
    }
    if (r.evening) {
      eWeights.push(r.evening.weight);
      sats.push(r.evening.satisfaction);
      fats.push(r.evening.fatigue);
    }

    const mInfo = r.morning 
      ? `體重：<strong>${r.morning.weight} kg</strong> (${r.morning.time})<br>精神：<strong>${r.morning.energy}/10 分</strong>` 
      : '<span style="color:#94a3b8">未填寫</span>';
    const mText = r.morning ? r.morning.summary : '-';

    const eInfo = r.evening 
      ? `睡前：<strong>${r.evening.weight} kg</strong> (${r.evening.time})<br>滿意：<strong>${r.evening.satisfaction}/10</strong>｜疲勞：<strong>${r.evening.fatigue}/10</strong>` 
      : '<span style="color:#94a3b8">未填寫</span>';
    const eText = r.evening 
      ? `<strong>訓練：</strong>${r.evening.training}<br><strong>傷勢：</strong>${r.evening.injury}` 
      : '-';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${r.name}</strong><br><span class="tag">${r.weightClass}</span></td>
      <td style="white-space:nowrap;">${r.date}</td>
      <td>${mInfo}</td>
      <td>${mText}</td>
      <td>${eInfo}</td>
      <td>${eText}</td>
      <td><button type="button" class="btn danger" onclick="deleteRecord('${r.name}', '${r.date}')">刪除</button></td>
    `;
    tbody.appendChild(tr);
  });

  const avg = arr => arr.length ? (arr.reduce((a,b) => a+b, 0) / arr.length).toFixed(1) : '-';
  document.getElementById('avg-m-weight').innerText = mWeights.length ? `${avg(mWeights)} kg` : '-';
  document.getElementById('avg-e-weight').innerText = eWeights.length ? `${avg(eWeights)} kg` : '-';
  document.getElementById('avg-scores').innerText = `${avg(energies)} / ${avg(sats)} 分`;
  document.getElementById('avg-fatigue').innerText = fats.length ? `${avg(fats)} 分` : '-';

  if (mode === 'single') {
    renderChart([...targetRecords].reverse());
  }
}

function renderChart(chronologicalRecords) {
  const ctx = document.getElementById('trendChart').getContext('2d');
  if (chartInstance) chartInstance.destroy();

  const labels = chronologicalRecords.map(r => r.date.slice(5));
  const mWeightData = chronologicalRecords.map(r => r.morning ? r.morning.weight : null);
  const eWeightData = chronologicalRecords.map(r => r.evening ? r.evening.weight : null);
  const fatigueData = chronologicalRecords.map(r => r.evening ? r.evening.fatigue : null);

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: '早上體重 (kg)',
          data: mWeightData,
          borderColor: '#2563eb',
          backgroundColor: '#2563eb',
          spanGaps: true,
          yAxisID: 'y'
        },
        {
          label: '睡前體重 (kg)',
          data: eWeightData,
          borderColor: '#0ea5e9',
          borderDash: [5, 5],
          spanGaps: true,
          yAxisID: 'y'
        },
        {
          label: '疲勞程度 (1-10分)',
          data: fatigueData,
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          fill: true,
          spanGaps: true,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: { type: 'linear', display: true, position: 'left', title: { display: true, text: '體重 (kg)' } },
        y1: { type: 'linear', display: true, position: 'right', min: 0, max: 10, grid: { drawOnChartArea: false }, title: { display: true, text: '疲勞分數' } }
      }
    }
  });
}

// 刪除特定選手某一天的整筆紀錄
function deleteRecord(name, date) {
  showAlert(`確定要刪除「${name}」在「${date}」的整天紀錄嗎？`, () => {
    let records = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    records = records.filter(r => !(r.name === name && r.date === date));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    
    populateAthleteFilters();
    renderDashboard();
    showAlert('紀錄已成功刪除！', null, '🗑️');
  }, '🗑️');
}

// 匯出目前畫面上篩選出來的數據為 CSV
function exportCSV() {
  if (!currentFilteredRecords || currentFilteredRecords.length === 0) {
    showAlert('目前畫面沒有可匯出的資料！');
    return;
  }
  
  let csv = '\uFEFF姓名,日期,參賽量級,早上體重,早上測量時間,今天精神,恢復與精神總結,睡前體重,晚上測量時間,訓練滿意度,今天訓練狀況,疲勞程度,疲勞與受傷描寫\n';
  
  currentFilteredRecords.forEach(r => {
    const m = r.morning || {};
    const e = r.evening || {};
    const row = [
      r.name, r.date, r.weightClass,
      m.weight || '', m.time || '', m.energy || '', `"${(m.summary || '').replace(/"/g, '""')}"`,
      e.weight || '', e.time || '', e.satisfaction || '', `"${(e.training || '').replace(/"/g, '""')}"`, e.fatigue || '', `"${(e.injury || '').replace(/"/g, '""')}"`
    ];
    csv += row.join(',') + '\n';
  });

  const mode = document.getElementById('filter-mode').value;
  let fileNamePrefix = '全隊選手';
  if (mode === 'single') fileNamePrefix = document.getElementById('filter-athlete').value;
  else if (mode === 'custom') fileNamePrefix = '部分篩選選手';

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${fileNamePrefix}_訓練與體重監控報表.csv`;
  link.click();
}
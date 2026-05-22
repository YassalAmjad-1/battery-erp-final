const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase Configuration
const SUPABASE_URL = 'https://hclayqwbgmhaptknedoq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjbGF5cXdiZ21oYXB0a25lZG9xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NDE4MTEsImV4cCI6MjA5NTAxNzgxMX0.MfxGGgnpOqPk9Q-2I37o2F1NuNsAPQ2HgU44M8ORiiM';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

app.use(cors());
app.use(express.json());

// Get all production data
app.get('/api/data', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('production_entries')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(500);
        
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Save new production entry
app.post('/api/entry', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('production_entries')
            .insert([req.body])
            .select();
        
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Get dashboard stats
app.get('/api/stats', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('production_entries')
            .select('date, actual_qty, department');
        
        if (error) throw error;
        
        const today = new Date().toISOString().split('T')[0];
        const todayTotal = data.filter(d => d.date === today).reduce((s,d)=>s+(d.actual_qty||0),0);
        const allTimeTotal = data.reduce((s,d)=>s+(d.actual_qty||0),0);
        
        res.json({ success: true, todayTotal, allTimeTotal, totalRecords: data.length });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Frontend
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TX Battery Manufacturing ERP | Cloud Production System</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        .card { background: white; border-radius: 16px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .btn { padding: 10px 20px; border-radius: 10px; border: none; cursor: pointer; font-weight: 600; transition: all 0.2s; }
        .btn-primary { background: #3b82f6; color: white; }
        .btn-primary:hover { background: #2563eb; }
        .btn-success { background: #10b981; color: white; }
        .btn-success:hover { background: #059669; }
        .nav { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
        .nav-btn { padding: 10px 20px; background: #e2e8f0; border: none; border-radius: 10px; cursor: pointer; font-weight: 500; transition: all 0.2s; }
        .nav-btn.active { background: #1e293b; color: white; }
        .progress-bar { background: #e2e8f0; border-radius: 10px; height: 8px; overflow: hidden; }
        .progress-fill { height: 100%; border-radius: 10px; transition: width 0.3s; }
        .kpi-card { background: linear-gradient(135deg, #1e293b, #0f172a); color: white; border-radius: 16px; padding: 16px; text-align: center; }
        input, select { padding: 10px; border: 1px solid #cbd5e1; border-radius: 10px; width: 100%; margin: 5px 0; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
        th { background: #f8fafc; font-weight: 600; }
        .flex { display: flex; gap: 15px; flex-wrap: wrap; }
        .flex > div { flex: 1; }
        .status-badge { padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 600; display: inline-block; }
        .status-running { background: #d1fae5; color: #065f46; }
        .status-downtime { background: #fee2e2; color: #991b1b; }
        @media (max-width: 768px) { body { padding: 10px; } .nav-btn { padding: 6px 12px; font-size: 12px; } }
    </style>
</head>
<body>
<div id="app" style="max-width: 1400px; margin: 0 auto; padding: 20px;"></div>

<script>
    const DEPARTMENTS = [
        'Ball Milling', 'Tubular Grid', 'Oxide Filling', 'Grid Casting', 'Pasting',
        'Acid Pickling', 'Curing Chamber', 'Cutting & Brushing', 'COS',
        'Group Insertion', 'Assembly', 'Tubular Charging', 'Molding',
        'Acid Dilution', 'Packing'
    ];
    
    const SHIFTS = ['Shift A', 'Shift B'];
    const HOUR_SLOTS = [6,7,8,9,10,11,12,13,14,15,16,17,18,19,20];
    
    let productionData = [];
    let dailySchedule = { tx1800: 55, tx2500: 42 };
    let currentTab = 'dashboard';
    let currentPage = 1;
    let message = '';
    let stats = { todayTotal: 0, allTimeTotal: 0, totalRecords: 0 };
    
    async function loadData() {
        try {
            const [dataRes, statsRes] = await Promise.all([
                fetch('/api/data'),
                fetch('/api/stats')
            ]);
            const data = await dataRes.json();
            const statsData = await statsRes.json();
            
            if (data.success) productionData = data.data || [];
            if (statsData.success) stats = statsData;
            
            showMessage('✅ Connected to Cloud Database', 'green');
        } catch(e) {
            showMessage('⚠️ Connection issue', 'yellow');
        }
        render();
    }
    
    async function saveEntry(entry) {
        try {
            const res = await fetch('/api/entry', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(entry)
            });
            const data = await res.json();
            if (data.success) {
                showMessage('✅ Entry saved to cloud!', 'green');
                loadData();
            }
        } catch(e) {
            showMessage('❌ Error saving entry', 'red');
        }
    }
    
    function getToday() { return new Date().toISOString().split('T')[0]; }
    function showMessage(msg, type) { message = msg; render(); setTimeout(() => { message = ''; render(); }, 3000); }
    
    function calculateTarget(dept) {
        const s1800 = dailySchedule.tx1800;
        const s2500 = dailySchedule.tx2500;
        if (dept === 'Ball Milling') return (s1800 * 12.174) + (s2500 * 17.106);
        if (dept === 'Tubular Grid' || dept === 'Oxide Filling' || dept === 'Acid Pickling') return (s1800 * 12) + (s2500 * 18);
        if (dept === 'Grid Casting' || dept === 'Pasting') return (s1800 * 18) + (s2500 * 24);
        if (dept === 'COS' || dept === 'Group Insertion' || dept === 'Assembly' || dept === 'Tubular Charging' || dept === 'Packing') return s1800 + s2500;
        return 100;
    }
    
    function getTodayCumulative(dept) {
        const today = getToday();
        let total = 0;
        for (let e of productionData) {
            if (e.date === today && e.department === dept) {
                total += e.actual_qty || 0;
            }
        }
        return total;
    }
    
    function renderDashboard() {
        let deptHtml = '';
        for (let dept of DEPARTMENTS) {
            const target = calculateTarget(dept);
            const actual = getTodayCumulative(dept);
            const percent = target > 0 ? (actual / target) * 100 : 0;
            const color = percent >= 90 ? '#10b981' : (percent >= 75 ? '#f59e0b' : '#ef4444');
            deptHtml += '<div class="card"><div class="flex justify-between"><span class="font-medium">' + dept + '</span><span>' + Math.round(actual) + ' / ' + Math.round(target) + '</span></div><div class="progress-bar mt-2"><div class="progress-fill" style="width: ' + Math.min(100, percent) + '%; background: ' + color + ';"></div></div></div>';
        }
        
        return '<div class="flex justify-between items-center mb-4"><h1 class="text-2xl font-bold">📊 Dashboard</h1><div class="text-sm bg-green-100 text-green-700 px-3 py-1 rounded-full">☁️ Cloud Connected</div></div><div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6"><div class="kpi-card"><div class="text-xs">Today\'s Production</div><div class="text-2xl font-bold">' + stats.todayTotal + '</div></div><div class="kpi-card"><div class="text-xs">Total Production</div><div class="text-2xl font-bold">' + Math.round(stats.allTimeTotal/1000) + 'k</div></div><div class="kpi-card"><div class="text-xs">TX-1800 Plan</div><div class="text-xl"><input type="number" id="s1800" value="' + dailySchedule.tx1800 + '" class="bg-slate-800 border border-slate-700 rounded p-1 w-full text-center text-white"></div></div><div class="kpi-card"><div class="text-xs">TX-2500 Plan</div><div class="text-xl"><input type="number" id="s2500" value="' + dailySchedule.tx2500 + '" class="bg-slate-800 border border-slate-700 rounded p-1 w-full text-center text-white"></div></div></div><div class="card"><div class="flex justify-between items-center"><h3 class="font-bold">📅 Daily Schedule</h3><button onclick="updateSchedule()" class="btn btn-primary">Update Schedule</button></div></div><h2 class="font-bold text-lg mb-3 mt-4">📊 Department Progress (Today)</h2>' + deptHtml;
    }
    
    function renderProductionForm() {
        const dept = document.getElementById('dynamicDept')?.value || DEPARTMENTS[0];
        const target = calculateTarget(dept);
        const cumulative = getTodayCumulative(dept);
        const percent = target > 0 ? (cumulative / target) * 100 : 0;
        
        return '<h1 class="text-2xl font-bold mb-4">🏭 Production Entry</h1><div class="card"><div class="bg-green-50 p-4 rounded-lg mb-4"><div class="flex justify-between"><span class="font-bold">' + dept + '</span><span class="text-lg font-bold text-green-600">Daily Target: ' + Math.round(target) + '</span></div><div class="progress-bar mt-2"><div class="progress-fill" style="width: ' + percent + '%; background: #10b981;"></div></div><div class="flex justify-between mt-1 text-sm"><span>✅ Completed: ' + Math.round(cumulative) + '</span><span>🎯 Remaining: ' + Math.max(0, Math.round(target - cumulative)) + '</span></div></div><div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4"><div><label>Department</label><select id="dynamicDept" class="w-full border rounded-lg p-2" onchange="render()">' + DEPARTMENTS.map(d => '<option ' + (dept === d ? 'selected' : '') + '>' + d + '</option>').join('') + '</select></div><div><label>Shift</label><select id="entryShift" class="w-full border rounded-lg p-2"><option>Shift A</option><option>Shift B</option></select></div><div><label>Hour</label><select id="entryHour" class="w-full border rounded-lg p-2">' + HOUR_SLOTS.map(h => '<option value="' + h + '">' + h + ':00</option>').join('') + '</select></div><div><label>Status</label><select id="entryStatus" class="w-full border rounded-lg p-2"><option>Running</option><option>Downtime</option><option>Maintenance</option></select></div></div><div class="mb-4"><label>Actual Production</label><input type="number" id="actualQty" class="w-full border rounded-lg p-2" placeholder="Enter quantity produced"></div><button onclick="submitEntry()" class="btn btn-success w-full py-3 text-lg">✅ Submit Entry</button></div><div class="card"><h3 class="font-bold mb-3">📋 Recent Entries (Today)</h3><div id="recentEntries"></div></div>';
    }
    
    window.submitEntry = async function() {
        const dept = document.getElementById('dynamicDept')?.value;
        const shift = document.getElementById('entryShift')?.value;
        const hour = parseInt(document.getElementById('entryHour')?.value);
        const actual = parseInt(document.getElementById('actualQty')?.value);
        const status = document.getElementById('entryStatus')?.value;
        
        if (!actual || actual <= 0) { alert('Please enter quantity'); return; }
        
        await saveEntry({
            date: getToday(),
            department: dept,
            shift: shift,
            hour_slot: hour,
            actual_qty: actual,
            machine_status: status,
            target_qty: calculateTarget(dept),
            efficiency: (actual / calculateTarget(dept)) * 100
        });
        
        document.getElementById('actualQty').value = '';
        render();
    };
    
    window.updateSchedule = function() {
        dailySchedule.tx1800 = parseInt(document.getElementById('s1800').value) || 0;
        dailySchedule.tx2500 = parseInt(document.getElementById('s2500').value) || 0;
        showMessage('✅ Schedule updated', 'green');
        render();
    };
    
    function renderAnalytics() {
        const deptStats = {};
        for (let e of productionData) {
            deptStats[e.department] = (deptStats[e.department] || 0) + (e.actual_qty||0);
        }
        let deptHtml = '<div class="space-y-2">';
        for (let [dept, total] of Object.entries(deptStats).slice(0,10)) {
            deptHtml += '<div class="flex justify-between"><span>' + dept + '</span><span class="font-bold">' + total.toLocaleString() + ' units</span></div>';
        }
        deptHtml += '</div>';
        
        return '<h1 class="text-2xl font-bold mb-4">📈 Analytics</h1><div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6"><div class="card"><h3 class="font-bold mb-3">Total Production: ' + Math.round(stats.allTimeTotal/1000) + 'k</h3><h3>Total Records: ' + stats.totalRecords + '</h3></div><div class="card"><h3 class="font-bold mb-3">📊 Department-wise Production</h3>' + deptHtml + '</div></div><div class="card"><h3 class="font-bold mb-3">📋 Recent Records</h3><div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="border-b"><th>Date</th><th>Hour</th><th>Dept</th><th>Shift</th><th>Actual</th><th>Target</th><th>Efficiency</th></tr></thead><tbody id="analyticsTable"></tbody></table></div></div>';
    }
    
    function renderHistory() {
        const itemsPerPage = 10;
        const start = (currentPage - 1) * itemsPerPage;
        const paginated = productionData.slice(start, start + itemsPerPage);
        const totalPages = Math.ceil(productionData.length / itemsPerPage);
        let rows = '';
        for (let e of paginated) {
            rows += '<tr class="border-b"><td class="p-2">' + e.date + '</td><td class="p-2">' + e.hour_slot + ':00</td><td class="p-2">' + e.department + '</td><td class="p-2">' + e.shift + '</td><td class="p-2 text-right">' + e.actual_qty + '</td><td class="p-2"><span class="status-badge ' + (e.machine_status === 'Running' ? 'status-running' : 'status-downtime') + '">' + (e.machine_status || 'Running') + '</span></td></tr>';
        }
        return '<h1 class="text-2xl font-bold mb-4">📋 Production History</h1><div class="card overflow-x-auto"><table class="w-full text-sm"><thead><tr class="border-b"><th>Date</th><th>Hour</th><th>Dept</th><th>Shift</th><th>Actual</th><th>Status</th><tr></thead><tbody>' + rows + '</tbody></table></div><div class="flex justify-between mt-4"><button onclick="changePage(-1)" class="px-4 py-2 border rounded">Previous</button><span>Page ' + currentPage + ' of ' + totalPages + '</span><button onclick="changePage(1)" class="px-4 py-2 border rounded">Next</button></div>';
    }
    
    function renderInventory() { return '<h1 class="text-2xl font-bold mb-4">📦 Inventory</h1><div class="card"><div class="grid grid-cols-2 md:grid-cols-3 gap-4"><div class="bg-gray-50 p-3 rounded"><strong>Red Oxide</strong><br>3,000 kg</div><div class="bg-gray-50 p-3 rounded"><strong>Refine Lead</strong><br>10,000 kg</div><div class="bg-gray-50 p-3 rounded"><strong>Lead Alloy</strong><br>2,000 kg</div></div></div>'; }
    function renderMaintenance() { return '<h1 class="text-2xl font-bold mb-4">🔧 Maintenance</h1><div class="card"><button class="btn btn-primary" onclick="alert(\'Maintenance logged\')">Log Maintenance</button></div>'; }
    
    function changePage(delta) { const newPage = currentPage + delta; if (newPage >= 1 && newPage <= Math.ceil(productionData.length / 10)) { currentPage = newPage; render(); } }
    
    function updateRecentEntries() {
        const recentDiv = document.getElementById('recentEntries');
        if (recentDiv) {
            const todayEntries = productionData.filter(e => e.date === getToday()).slice(0, 10);
            recentDiv.innerHTML = todayEntries.map(e => '<div class="border-b py-2 flex justify-between"><span>' + e.hour_slot + ':00 - ' + e.department + '</span><span class="font-bold">' + e.actual_qty + ' units</span></div>').join('');
            if (todayEntries.length === 0) recentDiv.innerHTML = '<div class="py-2 text-gray-500">No entries yet today</div>';
        }
        const analyticsTable = document.getElementById('analyticsTable');
        if (analyticsTable) {
            analyticsTable.innerHTML = productionData.slice(0, 20).map(e => '<tr class="border-b"><td>' + e.date + '</td><td>' + e.hour_slot + ':00</td><td>' + e.department + '</td><td>' + e.shift + '</td><td>' + e.actual_qty + '</td><td>' + Math.round(e.target_qty || 0) + '</td><td>' + Math.round(e.efficiency || 0) + '%</td></tr>').join('');
        }
    }
    
    function setTab(tab) {
        currentTab = tab;
        currentPage = 1;
        render();
        if (tab === 'production' || tab === 'analytics') setTimeout(updateRecentEntries, 100);
    }
    
    function render() {
        let content = '';
        if (currentTab === 'dashboard') content = renderDashboard();
        else if (currentTab === 'production') content = renderProductionForm();
        else if (currentTab === 'analytics') content = renderAnalytics();
        else if (currentTab === 'inventory') content = renderInventory();
        else if (currentTab === 'history') content = renderHistory();
        else if (currentTab === 'maintenance') content = renderMaintenance();
        
        document.getElementById('app').innerHTML = '<div class="nav"><button class="nav-btn ' + (currentTab === 'dashboard' ? 'active' : '') + '" onclick="setTab(\'dashboard\')">📊 Dashboard</button><button class="nav-btn ' + (currentTab === 'production' ? 'active' : '') + '" onclick="setTab(\'production\')">🏭 Production</button><button class="nav-btn ' + (currentTab === 'analytics' ? 'active' : '') + '" onclick="setTab(\'analytics\')">📈 Analytics</button><button class="nav-btn ' + (currentTab === 'inventory' ? 'active' : '') + '" onclick="setTab(\'inventory\')">📦 Inventory</button><button class="nav-btn ' + (currentTab === 'history' ? 'active' : '') + '" onclick="setTab(\'history\')">📋 History</button><button class="nav-btn ' + (currentTab === 'maintenance' ? 'active' : '') + '" onclick="setTab(\'maintenance\')">🔧 Maintenance</button></div>' + content + (message ? '<div class="fixed top-20 right-4 ' + (message.includes('✅') ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700') + ' px-4 py-2 rounded-lg shadow">' + message + '</div>' : '') + '<div class="text-center text-gray-400 text-xs mt-8 pt-4 border-t">☁️ TX Battery ERP | Cloud Database | All Data Shared</div>';
        
        if (currentTab === 'production' || currentTab === 'analytics') setTimeout(updateRecentEntries, 50);
    }
    
    window.setTab = setTab;
    window.changePage = changePage;
    loadData();
</script>
</body>
</html>`);
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

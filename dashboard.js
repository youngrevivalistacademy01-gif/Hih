// ---------- State ----------
let currentUser = null;
let studentRow = null;
let enrollment = null;
let allClasses = [];
let modulesInCurrentClass = [];
let progressMap = {};
let activeModule = null;

// ---------- Init ----------
async function init() {
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();

    if (userError || !user) {
        window.location.href = '../login.html';
        return;
    }
    currentUser = user;

    try {
        await loadStudentData();
        await loadClasses();
        await loadCurrentClassModules();
        renderHeader();
        renderJourneyMap();
        renderCurrentClass();
        maybeShowWelcome();
    } catch (err) {
        console.error('Dashboard load failed:', err);
        alert('Something went wrong loading your dashboard. Please refresh the page.');
    }
}

async function loadStudentData() {
    const { data, error } = await supabaseClient
        .from('students')
        .select('*')
        .eq('id', currentUser.id)
        .single();
    if (error || !data) throw new Error('Could not load student profile.');
    studentRow = data;

    const { data: enrollData, error: enrollError } = await supabaseClient
        .from('student_enrollment')
        .select('*, classes(*)')
        .eq('student_id', currentUser.id)
        .single();
    if (enrollError || !enrollData) throw new Error('Could not load enrollment.');
    enrollment = enrollData;
}

async function loadClasses() {
    const { data, error } = await supabaseClient
        .from('classes')
        .select('*')
        .order('sequence_order', { ascending: true });
    if (error) throw error;
    allClasses = data;
}

async function loadCurrentClassModules() {
    const { data: modules, error: modError } = await supabaseClient
        .from('modules')
        .select('*')
        .eq('class_id', enrollment.current_class_id)
        .order('sequence_order', { ascending: true });
    if (modError) throw modError;
    modulesInCurrentClass = modules;

    const { data: progress, error: progError } = await supabaseClient
        .from('student_progress')
        .select('module_id, completed')
        .eq('student_id', currentUser.id);
    if (progError) throw progError;

    progressMap = {};
    (progress || []).forEach(p => { progressMap[p.module_id] = p.completed; });
}

// ---------- Render: header ----------
function renderHeader() {
    const firstName = studentRow.full_name.split(' ')[0];
    document.getElementById('headerMatric').textContent = studentRow.matric_number || 'YRA/—';
    document.getElementById('headerName').textContent = studentRow.full_name;
    document.getElementById('heroName').textContent = firstName;
    document.getElementById('welcomeName').textContent = firstName;
    document.getElementById('welcomeMatric').textContent = studentRow.matric_number || 'YRA/—';
}

// ---------- Render: journey map ----------
function renderJourneyMap() {
    const map = document.getElementById('journeyMap');
    map.innerHTML = '';

    allClasses.forEach(cls => {
        let state = 'locked';
        if (cls.id === enrollment.current_class_id) state = 'current';
        else if (cls.sequence_order < enrollment.classes.sequence_order) state = 'completed';

        const icon = state === 'completed' ? 'fa-check' : state === 'current' ? 'fa-book-open' : 'fa-lock';

        const node = document.createElement('div');
        node.className = `journey-node ${state}`;
        node.innerHTML = `
            <div class="node-icon"><i class="fas ${icon}"></i></div>
            <h4>${cls.title}</h4>
            <span>${state === 'completed' ? 'Completed' : state === 'current' ? 'In progress' : 'Locked'}</span>
        `;
        map.appendChild(node);
    });
}

// ---------- Render: current class + modules ----------
function renderCurrentClass() {
    const cls = enrollment.classes;
    document.getElementById('currentClassTitle').textContent = cls.title;
    document.getElementById('currentClassDesc').textContent = cls.description || '';

    const total = modulesInCurrentClass.length;
    const completed = modulesInCurrentClass.filter(m => progressMap[m.id]).length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    document.getElementById('progressPercent').textContent = `${percent}%`;
    const ring = document.getElementById('progressRing');
    const circumference = 264;
    ring.style.strokeDashoffset = circumference - (circumference * percent / 100);

    const list = document.getElementById('modulesList');
    list.innerHTML = '';

    modulesInCurrentClass.forEach((mod, index) => {
        const isCompleted = !!progressMap[mod.id];
        const prevMod = modulesInCurrentClass[index - 1];
        const isLocked = prevMod ? !progressMap[prevMod.id] : false;

        let state = isCompleted ? 'completed' : isLocked ? 'locked' : '';
        const icon = isCompleted ? 'fa-check' : isLocked ? 'fa-lock' : 'fa-headphones';

        const item = document.createElement('div');
        item.className = `module-item ${state}`;
        item.innerHTML = `
            <div class="module-status"><i class="fas ${icon}"></i></div>
            <div class="module-info">
                <h4>${mod.title}</h4>
                <span>${isCompleted ? 'Completed' : isLocked ? 'Complete the previous lesson to unlock' : 'Tap to listen'}</span>
            </div>
        `;

        if (!isLocked) {
            item.addEventListener('click', () => openAudioPanel(mod));
        }

        list.appendChild(item);
    });
}

// ---------- Welcome overlay (first-time only) ----------
function maybeShowWelcome() {
    const seen = localStorage.getItem(`yra_welcomed_${currentUser.id}`);
    if (seen) return;
    document.getElementById('welcomeOverlay').classList.remove('hidden');
}

document.getElementById('beginJourneyBtn').addEventListener('click', () => {
    document.getElementById('welcomeOverlay').classList.add('hidden');
    localStorage.setItem(`yra_welcomed_${currentUser.id}`, 'true');
});

// ---------- Audio panel ----------
const audioPanel = document.getElementById('audioPanel');
const audioElement = document.getElementById('audioElement');
const audioPlayBtn = document.getElementById('audioPlayBtn');
const audioProgressFill = document.getElementById('audioProgressFill');
const audioProgressTrack = document.querySelector('.audio-progress-track');
const audioTime = document.getElementById('audioTime');
const markCompleteBtn = document.getElementById('markCompleteBtn');

function openAudioPanel(mod) {
    activeModule = mod;
    document.getElementById('audioModuleLabel').textContent = `MODULE ${mod.sequence_order}`;
    document.getElementById('audioModuleTitle').textContent = mod.title;
    document.getElementById('audioModuleFocus').textContent = mod.focus_points || '';

    audioElement.src = mod.audio_url || '';
    audioElement.pause();
    audioPlayBtn.innerHTML = '<i class="fas fa-play"></i>';
    audioProgressFill.style.width = '0%';
    audioTime.textContent = '0:00 / 0:00';

    const isCompleted = !!progressMap[mod.id];
    markCompleteBtn.disabled = isCompleted;
    markCompleteBtn.innerHTML = isCompleted
        ? '<i class="fas fa-check"></i> COMPLETED'
        : '<i class="fas fa-check"></i> MARK AS COMPLETE';

    audioPanel.classList.add('open');
}

document.getElementById('audioClose').addEventListener('click', () => {
    audioPanel.classList.remove('open');
    audioElement.pause();
});

audioPlayBtn.addEventListener('click', () => {
    if (!audioElement.src) return;
    if (audioElement.paused) {
        audioElement.play();
        audioPlayBtn.innerHTML = '<i class="fas fa-pause"></i>';
    } else {
        audioElement.pause();
        audioPlayBtn.innerHTML = '<i class="fas fa-play"></i>';
    }
});

audioElement.addEventListener('timeupdate', () => {
    if (!audioElement.duration) return;
    const percent = (audioElement.currentTime / audioElement.duration) * 100;
    audioProgressFill.style.width = `${percent}%`;
    audioTime.textContent = `${formatTime(audioElement.currentTime)} / ${formatTime(audioElement.duration)}`;
});

audioElement.addEventListener('ended', () => {
    audioPlayBtn.innerHTML = '<i class="fas fa-play"></i>';
});

audioProgressTrack.addEventListener('click', (e) => {
    if (!audioElement.duration) return;
    const rect = audioProgressTrack.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = clickX / rect.width;
    audioElement.currentTime = percent * audioElement.duration;
});

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

// ---------- Mark complete ----------
markCompleteBtn.addEventListener('click', async () => {
    if (!activeModule || markCompleteBtn.disabled) return;

    markCompleteBtn.disabled = true;
    markCompleteBtn.textContent = 'SAVING...';

    try {
        const { error } = await supabaseClient
            .from('student_progress')
            .upsert({
                student_id: currentUser.id,
                module_id: activeModule.id,
                completed: true,
                completed_at: new Date().toISOString()
            }, { onConflict: 'student_id,module_id' });

        if (error) throw error;

        progressMap[activeModule.id] = true;
        markCompleteBtn.innerHTML = '<i class="fas fa-check"></i> COMPLETED';

        await loadStudentData();
        await loadClasses();
        await loadCurrentClassModules();
        renderJourneyMap();
        renderCurrentClass();

    } catch (err) {
        console.error('Failed to mark complete:', err);
        markCompleteBtn.disabled = false;
        markCompleteBtn.innerHTML = '<i class="fas fa-check"></i> MARK AS COMPLETE';
        alert('Could not save your progress. Please try again.');
    }
});

// ---------- Logout ----------
document.getElementById('logoutBtn').addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    window.location.href = '../login.html';
});

// ---------- Go ----------
init();

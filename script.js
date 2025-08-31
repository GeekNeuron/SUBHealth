document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const fileInput = document.getElementById('file-input');
    const reReadBtn = document.getElementById('re-read-btn');
    const encodingFixer = document.getElementById('encoding-fixer');
    const resultsCard = document.getElementById('results-card');
    const summaryStats = document.getElementById('summary-stats');
    const fixCommonBtn = document.getElementById('fix-common-btn');
    const removeHiBtn = document.getElementById('remove-hi-btn');
    const removeStylesBtn = document.getElementById('remove-styles-btn');
    const subtitleList = document.getElementById('subtitle-list');
    const outputEncodingSelect = document.getElementById('output-encoding');
    const saveBtn = document.getElementById('save-btn');

    let subtitles = [];
    let currentFile = null;

    // Event Listeners
    fileInput.addEventListener('change', (e) => handleFileSelect(e.target.files[0]));
    reReadBtn.addEventListener('click', () => loadFile(currentFile, 'windows-1256'));
    fixCommonBtn.addEventListener('click', fixCommonIssues);
    removeHiBtn.addEventListener('click', removeHiTags);
    removeStylesBtn.addEventListener('click', removeStyleTags);
    saveBtn.addEventListener('click', saveFile);

    function handleFileSelect(file) {
        if (!file) return;
        currentFile = file;
        encodingFixer.classList.remove('hidden');
        loadFile(file);
    }

    function loadFile(file, encoding = 'UTF-8') {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                subtitles = parseSrtAdvanced(e.target.result);
                analyzeSubtitles();
                resultsCard.classList.remove('hidden');
            } catch (error) {
                alert(`Error parsing file: ${error.message}`);
            }
        };
        reader.readAsText(file, encoding);
    }

    function analyzeSubtitles() {
        const issuesCount = { syntax: 0, overlap: 0, short_duration: 0, long_duration: 0, cpl: 0, cps: 0, formatting: 0 };
        subtitles.forEach((sub, i) => {
            if(sub.isError) {
                issuesCount.syntax++;
                return;
            }
            sub.issues = []; // Reset issues before re-analyzing
            // Timing checks
            if (i < subtitles.length - 1 && !subtitles[i+1].isError) {
                if (sub.endTimeMs > subtitles[i+1].startTimeMs) {
                    sub.issues.push({ type: 'overlap', message: 'Overlaps with next subtitle' });
                    issuesCount.overlap++;
                }
            }
            const duration = sub.endTimeMs - sub.startTimeMs;
            if (duration < 1000) { sub.issues.push({ type: 'short_duration', message: `Short duration (${duration}ms)` }); issuesCount.short_duration++; }
            if (duration > 7000) { sub.issues.push({ type: 'long_duration', message: `Long duration (${(duration/1000).toFixed(1)}s)` }); issuesCount.long_duration++; }
            // Text checks
            const lines = sub.text.split('\n');
            if (lines.some(line => line.length > 42)) { sub.issues.push({ type: 'cpl', message: 'High characters per line (>42)' }); issuesCount.cpl++; }
            const cps = duration > 0 ? sub.text.length / (duration / 1000) : 0;
            if (cps > 21) { sub.issues.push({ type: 'cps', message: `High reading speed (${cps.toFixed(1)} CPS)` }); issuesCount.cps++; }
            if(lines.length > 2) { sub.issues.push({ type: 'formatting', message: 'More than two lines of text' }); issuesCount.formatting++; }
        });
        renderResults(issuesCount);
    }

    function renderResults(issuesCount) {
        subtitleList.innerHTML = '';
        subtitles.forEach(sub => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'subtitle-item';
            const issueClasses = sub.issues.map(issue => `issue-${issue.type.replace('_', '-')}`);
            itemDiv.classList.add(...issueClasses);
            let issuesHTML = '<div class="issues">';
            sub.issues.forEach(issue => {
                let tagClass = 'issue-tag-info';
                if (['syntax', 'overlap', 'short_duration'].includes(issue.type)) tagClass = 'issue-tag-danger';
                else if (['long_duration', 'cpl', 'cps'].includes(issue.type)) tagClass = 'issue-tag-warning';
                issuesHTML += `<span class="issue-tag ${tagClass}" title="${issue.message}">${issue.type.replace('_', ' ')}</span>`;
            });
            issuesHTML += '</div>';
            if (sub.isError) {
                itemDiv.innerHTML = `<div class="subtitle-header"><span>Block ${sub.index}</span><span style="color:red; font-weight:bold;">SYNTAX ERROR</span></div><div class="raw-block">${sub.raw.replace(/</g, "&lt;")}</div>${issuesHTML}`;
            } else {
                 itemDiv.innerHTML = `<div class="subtitle-header"><span>${sub.index}</span><span>${sub.startTime} --> ${sub.endTime}</span></div><div class="subtitle-text">${sub.text.replace(/\n/g, '<br>')}</div>${sub.issues.length > 0 ? issuesHTML : ''}`;
            }
            subtitleList.appendChild(itemDiv);
        });
        summaryStats.innerHTML = '';
        if(issuesCount.syntax > 0) summaryStats.innerHTML += `<span class="stat-danger">${issuesCount.syntax} Syntax Errors</span>`;
        if(issuesCount.overlap > 0) summaryStats.innerHTML += `<span class="stat-danger">${issuesCount.overlap} Overlaps</span>`;
        if(Object.values(issuesCount).every(v => v === 0)) summaryStats.innerHTML = `<span class="stat-success">No issues found!</span>`;
    }

    function fixCommonIssues() {
        subtitles.forEach((sub, i) => {
            if (sub.isError) return;
            // Fix overlaps
            if (i < subtitles.length - 1 && !subtitles[i+1].isError) {
                if (sub.endTimeMs > subtitles[i+1].startTimeMs) {
                    sub.endTimeMs = subtitles[i+1].startTimeMs - 50;
                }
            }
            // Fix short duration
            if (sub.endTimeMs - sub.startTimeMs < 1000) {
                sub.endTimeMs = sub.startTimeMs + 1000;
            }
            sub.startTime = millisecondsToTime(sub.startTimeMs);
            sub.endTime = millisecondsToTime(sub.endTimeMs);
        });
        analyzeSubtitles(); // Re-analyze after fixing
    }

    function removeHiTags() {
        if (!confirm('Are you sure you want to remove all text inside brackets [] and parentheses ()? This cannot be undone.')) return;
        subtitles.forEach(sub => {
            if (sub.isError) return;
            // This regex removes content inside [] and (), including the brackets/parentheses themselves.
            sub.text = sub.text.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').trim();
        });
        analyzeSubtitles();
    }

    function removeStyleTags() {
        if (!confirm('Are you sure you want to remove all styling tags like <i>, <b>, etc.? This cannot be undone.')) return;
        subtitles.forEach(sub => {
            if (sub.isError) return;
            // This regex removes any HTML-like tags.
            sub.text = sub.text.replace(/<.*?>/g, '').trim();
        });
        analyzeSubtitles();
    }

    function saveFile() {
        const validSubtitles = subtitles.filter(sub => !sub.isError);
        const content = buildSrt(validSubtitles);
        const encoding = outputEncodingSelect.value;
        const blob = new Blob([content], { type: `text/plain;charset=${encoding}` });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = currentFile.name.replace('.srt', '_fixed.srt');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
    
    // --- Advanced SRT Parser and Helper Functions ---
    function parseSrtAdvanced(data) {
        const blocks = data.trim().replace(/\r/g, '').split(/\n\s*\n/);
        return blocks.map((block, i) => {
            const lines = block.split('\n').filter(line => line.trim() !== '');
            const result = { index: i + 1, raw: block, issues: [], isError: false };
            if (lines.length < 2) { result.isError = true; result.issues.push({ type: 'syntax', message: 'Block has too few lines' }); return result; }
            let timeLineIndex = lines.findIndex(line => line.includes('-->'));
            if (timeLineIndex === -1) { result.isError = true; result.issues.push({ type: 'syntax', message: 'Timestamp missing' }); return result; }
            const timeMatch = lines[timeLineIndex].match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);
            if (!timeMatch) { result.isError = true; result.issues.push({ type: 'syntax', message: `Invalid timestamp format` }); return result; }
            result.index = parseInt(lines[0], 10) || (i + 1);
            result.startTime = timeMatch[1]; result.endTime = timeMatch[2];
            result.startTimeMs = timeToMilliseconds(result.startTime); result.endTimeMs = timeToMilliseconds(result.endTime);
            result.text = lines.slice(timeLineIndex + 1).join('\n');
            if (result.endTimeMs <= result.startTimeMs) { result.issues.push({ type: 'syntax', message: 'End time is before start time' }); }
            if (!result.text) { result.issues.push({ type: 'formatting', message: 'Subtitle has no text' }); }
            return result;
        });
    }
    function buildSrt(subs) { return subs.map(s => `${s.index}\n${s.startTime} --> ${s.endTime}\n${s.text}`).join('\n\n') + '\n\n'; }
    function timeToMilliseconds(t) { const p = t.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/); return p ? (+p[1]*36e5 + +p[2]*6e4 + +p[3]*1e3 + +p[4]) : 0; }
    function millisecondsToTime(ms) { if(ms<0)ms=0; let h=Math.floor(ms/36e5);ms%=36e5;let m=Math.floor(ms/6e4);ms%=6e4;let s=Math.floor(ms/1e3); return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(ms%1e3).padStart(3,'0')}`; }
});

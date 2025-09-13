document.addEventListener('DOMContentLoaded', async () => {
    let currentUser = { logged_in: false, user_id: null };

    // 현재 로그인 상태 확인
    try {
        const sessionResponse = await fetch('/api/check-session');
        currentUser = await sessionResponse.json();
    } catch (error) {
        console.error("Session check failed:", error);
    }
    
    // 제보 목록 불러오기
    try {
        const response = await fetch('/api/reports');
        const reports = await response.json();
        const feedContainer = document.getElementById('community-feed');
        
        if (reports.length === 0) {
            feedContainer.innerHTML = '<p class="placeholder">아직 제보가 없습니다.</p>';
            return;
        }

        feedContainer.innerHTML = ''; // 기존 내용 비우기
        reports.forEach(r => {
            const reportDiv = document.createElement('div');
            reportDiv.className = 'community-report-item';
            
            let imageTag = r.image_filename ? `<img src="/uploads/${r.image_filename}" class="report-image" alt="제보 이미지">` : '';
            
            let actionButtons = '';
            if (currentUser.logged_in && currentUser.user_id === r.user_id) {
                actionButtons = `<div class="report-actions-placeholder">내 제보</div>`;
            }

            reportDiv.innerHTML = `
                <div class="report-header">
                    <strong>${r.username}님의 제보 (심각도: ${r.severity})</strong>
                    ${actionButtons}
                </div>
                <p class="report-content">${r.content}</p>
                ${imageTag}
            `;
            feedContainer.appendChild(reportDiv);
        });
    } catch (error) {
        console.error("Failed to load reports:", error);
        document.getElementById('community-feed').innerHTML = '<p class="placeholder">제보를 불러오는 데 실패했습니다.</p>';
    }
});
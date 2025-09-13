// --- 1. 초기 설정 및 전역 변수 ---
let currentUser = { logged_in: false, username: "", user_id: null };
let locations = {};
let currentOverlays = [];
let isReportingMode = false;
let mapClickLat, mapClickLng;
let latestReportId = 0;
let reportIdToDelete = null;

// 3개 상습 침수 지역 정보
const FLOOD_ZONES = [
  {
    id: "nogok",
    name: "노곡동",
    sido: "대구광역시",
    sigungu: "북구",
    dong: "노곡동",
    lat: 35.9063,
    lng: 128.5629,
  },
  {
    id: "dongchon",
    name: "동촌유원지",
    sido: "대구광역시",
    sigungu: "동구",
    dong: "효목동",
    lat: 35.8825,
    lng: 128.6499,
  },
  {
    id: "jukjeon",
    name: "죽전네거리&서남시장",
    sido: "대구광역시",
    sigungu: "달서구",
    dong: "죽전동",
    lat: 35.8523,
    lng: 128.5425,
  },
];

const mapContainer = document.getElementById("map");
const mapOption = {
  center: new kakao.maps.LatLng(35.8571, 128.5894),
  level: 9,
}; // 3개 지역 중심점
const map = new kakao.maps.Map(mapContainer, mapOption);
const geocoder = new kakao.maps.services.Geocoder();

const sidoSelect = document.getElementById("sido-select");
const sigunguSelect = document.getElementById("sigungu-select");
const dongSelect = document.getElementById("dong-select");
const searchBtn = document.getElementById("search-btn");
const searchInput = document.getElementById("location-search");

const authModal = document.getElementById("auth-modal");
const authForm = document.getElementById("auth-form");
const reportPostModal = document.getElementById("report-post-modal");
const editReportModal = document.getElementById("edit-report-modal");
const confirmModal = document.getElementById("confirm-modal");

const signupUsernameInput = document.getElementById("signup-username");
const signupEmailInput = document.getElementById("signup-email");
const loginUsernameInput = document.getElementById("login-username");
const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirm-password");

const checkUsernameBtn = document.getElementById("check-username-btn");
const checkEmailBtn = document.getElementById("check-email-btn");

const usernameFeedback = document.getElementById("username-feedback");
const emailFeedback = document.getElementById("email-feedback");
const passwordFeedback = document.getElementById("password-feedback");
const confirmPasswordFeedback = document.getElementById(
  "confirm-password-feedback"
);

document.addEventListener("DOMContentLoaded", () => {
  Promise.all([
    checkLoginStatus(),
    loadLocations(),
    updateReports(true),
    addFloodZoneMarkers(),
  ])
    .then(() => {
      setupEventListeners();
      // 빠른 선택 버튼 추가
      addQuickSelectButtons();
      // 실시간 업데이트 (1분마다)
      setInterval(() => updateReports(false), 60000);
    })
    .catch((error) => console.error("Initialization failed:", error));
});

// 빠른 선택 버튼 추가
function addQuickSelectButtons() {
  const quickSelectDiv = document.createElement("div");
  quickSelectDiv.innerHTML = `
        <div style="background: #ff6b6b; color: white; padding: 10px; border-radius: 8px; margin-bottom: 15px;">
            <h3 style="margin: 0 0 10px 0; font-size: 16px;">⚠️ 상습 침수 지역 바로가기</h3>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                ${FLOOD_ZONES.map(
                  (zone) => `
                    <button onclick="selectFloodZone('${zone.id}')" 
                            style="background: white; color: #ff6b6b; border: none; padding: 8px 12px; 
                                   border-radius: 5px; cursor: pointer; font-weight: bold;">
                        ${zone.name}
                    </button>
                `
                ).join("")}
            </div>
        </div>
    `;

  const weatherCard = document.getElementById("weather-info-card");
  weatherCard.parentNode.insertBefore(quickSelectDiv, weatherCard);
}

// 상습 침수 지역 선택 함수
window.selectFloodZone = function (zoneId) {
  const zone = FLOOD_ZONES.find((z) => z.id === zoneId);
  if (zone) {
    // 셀렉트 박스 설정
    sidoSelect.value = zone.sido;
    sidoSelect.dispatchEvent(new Event("change"));

    setTimeout(() => {
      sigunguSelect.value = zone.sigungu;
      sigunguSelect.dispatchEvent(new Event("change"));

      setTimeout(() => {
        dongSelect.value = zone.dong;
        // 날씨 정보 업데이트
        updateWeatherInfo(zone.sido, zone.sigungu, zone.dong);
      }, 100);
    }, 100);
  }
};

// 커스텀 alert 함수
function showCenterAlert(message) {
  const alertDiv = document.createElement("div");
  alertDiv.className = "center-alert-overlay";
  alertDiv.textContent = message;
  document.body.appendChild(alertDiv);

  setTimeout(() => {
    alertDiv.style.opacity = "0";
    setTimeout(() => alertDiv.remove(), 300);
  }, 3000);
}

// 3개 지역 마커 추가
function addFloodZoneMarkers() {
  FLOOD_ZONES.forEach((zone) => {
    const markerPosition = new kakao.maps.LatLng(zone.lat, zone.lng);

    // 커스텀 오버레이로 특별 마커 생성
    const content = document.createElement("div");
    content.className = "flood-zone-marker";
    content.innerHTML = `
            <div style="background: #ff6b6b; color: white; padding: 8px 12px; 
                        border-radius: 20px; font-weight: bold; font-size: 14px; 
                        box-shadow: 0 2px 6px rgba(0,0,0,0.3); cursor: pointer;
                        border: 2px solid white;">
                🚨 ${zone.name}
            </div>
        `;

    const customOverlay = new kakao.maps.CustomOverlay({
      position: markerPosition,
      content: content,
      yAnchor: 1.5,
    });

    customOverlay.setMap(map);

    // 클릭 이벤트
    content.addEventListener("click", () => {
      selectFloodZone(zone.id);
    });
  });
}

async function checkLoginStatus() {
  try {
    const response = await fetch("/api/check-session");
    currentUser = await response.json();
    updateAuthUI();
  } catch (error) {
    console.error("Session check failed:", error);
  }
}

function updateAuthUI() {
  const authStatusDiv = document.getElementById("auth-status");
  const reportBtn = document.getElementById("report-btn");

  if (currentUser.logged_in) {
    authStatusDiv.innerHTML = `
            <div id="profile-status">
                <div id="profile-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                </div>
                <span id="welcome-msg">${currentUser.username}님</span>
                <button id="logout-btn">로그아웃</button>
            </div>
        `;
    document
      .getElementById("logout-btn")
      .addEventListener("click", handleLogout);
    if (reportBtn) reportBtn.style.display = "block";
  } else {
    authStatusDiv.innerHTML = `
            <button id="login-btn">로그인</button>
            <button id="signup-btn">회원가입</button>
        `;
    document
      .getElementById("login-btn")
      .addEventListener("click", () => openAuthModal(true));
    document
      .getElementById("signup-btn")
      .addEventListener("click", () => openAuthModal(false));
    if (reportBtn) reportBtn.style.display = "none";
  }
}

async function loadLocations() {
  try {
    const response = await fetch("/api/locations");
    locations = await response.json();

    // 대구광역시만 표시
    sidoSelect.innerHTML = '<option value="">시/도 선택</option>';
    sidoSelect.add(new Option("대구광역시", "대구광역시"));
  } catch (error) {
    console.error("Failed to load locations:", error);
  }
}

async function updateReports(isInitialLoad = false) {
  try {
    const response = await fetch("/api/reports", { cache: "no-cache" });
    const reports = await response.json();
    const reportFeed = document.getElementById("report-feed");

    if (currentOverlays)
      currentOverlays.forEach((overlay) => {
        if (overlay.infowindow && overlay.infowindow.getMap()) {
          overlay.infowindow.close();
        }
        overlay.setMap(null);
      });
    currentOverlays = [];

    if (!reportFeed || reports.length === 0) {
      if (reportFeed)
        reportFeed.innerHTML =
          '<p class="placeholder">아직 제보가 없습니다.</p>';
    } else {
      reportFeed.innerHTML = "";
      reports.forEach((r) => {
        const reportDiv = document.createElement("div");
        reportDiv.className = "report-item";
        let imageTag = r.image_filename
          ? `<img src="/uploads/${r.image_filename}" class="report-image" alt="제보 이미지">`
          : "";
        let actionButtons = "";
        if (currentUser.logged_in && currentUser.user_id === r.user_id) {
          actionButtons = `<div class="report-actions"><button class="edit-btn" onclick="handleEdit(${r.id}, '${r.content}', '${r.severity}')">수정</button><button class="delete-btn" onclick="handleDelete(${r.id})">삭제</button></div>`;
        }
        const zoneName = r.zone_name ? ` (${r.zone_name})` : "";
        reportDiv.innerHTML = `<div class="report-header"><strong>${r.username}${zoneName} (${r.severity})</strong>${actionButtons}</div><p class="report-content">${r.content}</p>${imageTag}`;
        reportFeed.appendChild(reportDiv);
      });
    }

    reports.forEach((r) => {
      const markerContent = document.createElement("div");
      markerContent.className = "custom-marker";
      markerContent.innerHTML = r.severity.charAt(0);

      const now = new Date();
      const createdAt = new Date(r.created_at);
      const ageInMinutes = (now - createdAt) / 1000 / 60;

      if (ageInMinutes < 5) {
        markerContent.classList.add("new-marker");
      } else {
        markerContent.classList.add("old-marker");
      }

      const customOverlay = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(r.lat, r.lng),
        content: markerContent,
      });

      const infowindowContent = `<div class="infowindow-content"><strong>${
        r.username
      }님의 제보 (${r.severity})</strong><p>${r.content}</p>${
        r.image_filename
          ? `<img src="/uploads/${r.image_filename}" class="infowindow-image">`
          : ""
      }</div>`;
      const infowindow = new kakao.maps.InfoWindow({
        content: infowindowContent,
        removable: true,
      });

      markerContent.addEventListener("click", () => {
        infowindow.open(map, customOverlay.getPosition());
      });

      customOverlay.infowindow = infowindow;
      customOverlay.setMap(map);
      currentOverlays.push(customOverlay);
    });

    if (
      !isInitialLoad &&
      reports.length > 0 &&
      reports[0].id > latestReportId
    ) {
      showNotification("새로운 침수 제보가 등록되었습니다!");
    }

    if (reports.length > 0) {
      latestReportId = reports[0].id;
    }
  } catch (error) {
    console.error("Failed to update reports:", error);
  }
}

function showNotification(message) {
  const container = document.getElementById("notification-container");
  const notification = document.createElement("div");
  notification.className = "notification";
  notification.innerText = message;
  container.appendChild(notification);
  setTimeout(() => {
    notification.style.opacity = "0";
    setTimeout(() => notification.remove(), 500);
  }, 4500);
}

function setupEventListeners() {
  searchBtn.addEventListener("click", handleSearchAndMoveMap);
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearchAndMoveMap();
    }
  });
  document
    .getElementById("report-btn")
    .addEventListener("click", handleReportClick);
  kakao.maps.event.addListener(map, "click", handleMapClickForReport);

  sidoSelect.addEventListener("change", () => {
    const selectedSido = sidoSelect.value;
    sigunguSelect.innerHTML = '<option value="">시/군/구 선택</option>';
    dongSelect.innerHTML = '<option value="">읍/면/동 선택</option>';
    if (selectedSido && locations[selectedSido]) {
      // 달서구와 동구만 표시
      ["달서구", "동구", "북구"].forEach((sigungu) => {
        if (locations[selectedSido][sigungu]) {
          sigunguSelect.add(new Option(sigungu, sigungu));
        }
      });
    }
  });

  sigunguSelect.addEventListener("change", () => {
    const selectedSido = sidoSelect.value;
    const selectedSigungu = sigunguSelect.value;
    dongSelect.innerHTML = '<option value="">읍/면/동 선택</option>';
    if (
      selectedSido &&
      selectedSigungu &&
      locations[selectedSido]?.[selectedSigungu]
    ) {
      // 3개 지역의 동만 표시
      const validDongs =
        selectedSigungu === "달서구"
          ? ["죽전동"]
          : selectedSigungu === "북구"
          ? ["노곡동"]
          : ["효목동"];
      Object.keys(locations[selectedSido][selectedSigungu]).forEach((dong) => {
        if (validDongs.includes(dong)) {
          dongSelect.add(new Option(dong, dong));
        }
      });
    }
  });

  document
    .getElementById("modal-close-btn")
    .addEventListener("click", closeAuthModal);
  document
    .getElementById("modal-switch-link")
    .addEventListener("click", (e) => {
      e.preventDefault();
      openAuthModal(!isLoginMode);
    });
  authForm.addEventListener("submit", handleAuthFormSubmit);

  checkUsernameBtn.addEventListener("click", handleCheckUsername);
  checkEmailBtn.addEventListener("click", handleCheckEmail);

  passwordInput.addEventListener("input", validatePassword);
  confirmPasswordInput.addEventListener("input", validatePassword);

  signupUsernameInput.addEventListener("input", () =>
    resetInputValidation(
      signupUsernameInput,
      usernameFeedback,
      checkUsernameBtn
    )
  );
  signupEmailInput.addEventListener("input", () =>
    resetInputValidation(signupEmailInput, emailFeedback, checkEmailBtn)
  );

  document
    .getElementById("password-toggle-btn")
    .addEventListener("click", (e) => {
      e.preventDefault();
      const btn = e.currentTarget;
      const iconEye = btn.querySelector(".icon-eye");
      const iconEyeSlash = btn.querySelector(".icon-eye-slash");
      if (passwordInput.type === "password") {
        passwordInput.type = "text";
        iconEye.style.display = "none";
        iconEyeSlash.style.display = "block";
      } else {
        passwordInput.type = "password";
        iconEye.style.display = "block";
        iconEyeSlash.style.display = "none";
      }
    });

  document
    .getElementById("report-modal-close-btn")
    .addEventListener("click", closeReportModal);
  document
    .getElementById("report-post-form")
    .addEventListener("submit", handleReportPostSubmit);
  document
    .getElementById("edit-modal-close-btn")
    .addEventListener("click", closeEditModal);
  document
    .getElementById("edit-report-form")
    .addEventListener("submit", handleEditReportSubmit);

  document
    .getElementById("confirm-cancel-btn")
    .addEventListener("click", () => {
      confirmModal.style.display = "none";
    });
  document
    .getElementById("confirm-delete-btn")
    .addEventListener("click", () => {
      if (reportIdToDelete !== null) {
        performDelete(reportIdToDelete);
      }
      confirmModal.style.display = "none";
    });
}

function resetInputValidation(inputEl, feedbackEl, checkBtnEl) {
  if (inputEl === signupUsernameInput) isUsernameAvailable = false;
  if (inputEl === signupEmailInput) isEmailAvailable = false;

  inputEl.classList.remove("is-valid", "is-invalid");
  feedbackEl.textContent = "";
  if (checkBtnEl) {
    checkBtnEl.classList.remove("checked-available");
    checkBtnEl.textContent = "중복확인";
  }
}

let isLoginMode = true;
let isUsernameAvailable = false,
  isEmailAvailable = false;

function openAuthModal(loginMode) {
  isLoginMode = loginMode;
  authForm.reset();
  [
    signupUsernameInput,
    signupEmailInput,
    loginUsernameInput,
    passwordInput,
    confirmPasswordInput,
  ].forEach((el) => el && el.classList.remove("is-valid", "is-invalid"));
  [usernameFeedback, emailFeedback, confirmPasswordFeedback].forEach(
    (el) => el && (el.textContent = "")
  );

  isUsernameAvailable = false;
  isEmailAvailable = false;
  resetInputValidation(signupUsernameInput, usernameFeedback, checkUsernameBtn);
  resetInputValidation(signupEmailInput, emailFeedback, checkEmailBtn);

  document.getElementById("modal-title").textContent = isLoginMode
    ? "로그인"
    : "회원가입";
  document.getElementById("modal-submit-btn").textContent = isLoginMode
    ? "로그인"
    : "회원가입";
  document.getElementById("signup-fields").style.display = isLoginMode
    ? "none"
    : "flex";
  document.getElementById("login-fields").style.display = isLoginMode
    ? "flex"
    : "none";
  document.getElementById("confirm-password-field").style.display = isLoginMode
    ? "none"
    : "flex";
  passwordFeedback.style.display = isLoginMode ? "none" : "block";

  const switchText = document.getElementById("modal-switch-text");
  const switchLink = document.getElementById("modal-switch-link");
  switchText.textContent = isLoginMode
    ? "계정이 없으신가요?"
    : "이미 계정이 있으신가요?";
  switchLink.textContent = isLoginMode ? "회원가입" : "로그인";

  validatePassword();
  authModal.style.display = "flex";
}

function closeAuthModal() {
  authModal.style.display = "none";
}

async function handleCheckUsername(e) {
  e.preventDefault();
  const username = signupUsernameInput.value;
  const response = await fetch("/api/check-username", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });
  const data = await response.json();
  usernameFeedback.textContent = data.message;
  isUsernameAvailable = data.is_available;
  usernameFeedback.className = `feedback-msg ${
    data.is_available ? "success" : "error"
  }`;
  signupUsernameInput.classList.toggle("is-valid", data.is_available);
  signupUsernameInput.classList.toggle("is-invalid", !data.is_available);
  checkUsernameBtn.classList.toggle("checked-available", data.is_available);
  if (data.is_available) {
    checkUsernameBtn.textContent = "확인완료";
  }
}

async function handleCheckEmail(e) {
  e.preventDefault();
  const email = signupEmailInput.value;
  const response = await fetch("/api/check-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const data = await response.json();
  emailFeedback.textContent = data.message;
  isEmailAvailable = data.is_available;
  emailFeedback.className = `feedback-msg ${
    data.is_available ? "success" : "error"
  }`;
  signupEmailInput.classList.toggle("is-valid", data.is_available);
  signupEmailInput.classList.toggle("is-invalid", !data.is_available);
  checkEmailBtn.classList.toggle("checked-available", data.is_available);
  if (data.is_available) {
    checkEmailBtn.textContent = "확인완료";
  }
}

function validatePassword() {
  if (isLoginMode) {
    passwordFeedback.style.display = "none";
    return true;
  }
  passwordFeedback.style.display = "block";

  const password = passwordInput.value;
  const confirm = confirmPasswordInput.value;
  let isAllValid = true;

  const criteria = {
    length: document.getElementById("pass-length").classList,
    special: document.getElementById("pass-special").classList,
    num: document.getElementById("pass-num").classList,
  };

  const isLengthValid = password.length >= 8;
  const hasSpecial = /[\W_]/.test(password);
  const hasNumber = /\d/.test(password);

  criteria.length.toggle("valid", isLengthValid);
  criteria.special.toggle("valid", hasSpecial);
  criteria.num.toggle("valid", hasNumber);

  const isPasswordValid = isLengthValid && hasSpecial && hasNumber;
  if (!isPasswordValid) isAllValid = false;

  if (confirm) {
    if (password === confirm && isPasswordValid) {
      confirmPasswordFeedback.textContent = "비밀번호가 일치합니다.";
      confirmPasswordFeedback.className = "feedback-msg success";
    } else {
      confirmPasswordFeedback.textContent = "비밀번호가 일치하지 않습니다.";
      confirmPasswordFeedback.className = "feedback-msg error";
      isAllValid = false;
    }
  } else {
    if (!isLoginMode) isAllValid = false;
  }
  return isAllValid;
}

async function handleAuthFormSubmit(e) {
  e.preventDefault();

  const endpoint = isLoginMode ? "/api/login" : "/api/signup";
  const body = {};

  if (isLoginMode) {
    body.username = loginUsernameInput.value.trim();
    body.password = passwordInput.value.trim();
  } else {
    body.username = signupUsernameInput.value.trim();
    body.email = signupEmailInput.value.trim();
    body.password = passwordInput.value.trim();
    if (!isUsernameAvailable || !isEmailAvailable || !validatePassword()) {
      alert(
        "입력 정보를 모두 올바르게 입력해주세요.\n(아이디, 이메일 중복확인 필수)"
      );
      return;
    }
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();

    if (response.ok) {
      closeAuthModal();
      showNotification(data.message);
      currentUser = {
        logged_in: data.logged_in,
        username: data.username,
        user_id: data.user_id,
      };
      updateAuthUI();
      await updateReports(true);
    } else {
      alert(data.error);
    }
  } catch (error) {
    console.error("Authentication error:", error);
    showCenterAlert("요청 처리 중 오류가 발생했습니다.");
  }
}

async function handleLogout() {
  await fetch("/api/logout");
  showNotification("로그아웃 되었습니다.");
  currentUser = { logged_in: false, username: "", user_id: null };
  updateAuthUI();
  await updateReports(true);
}

function handleSearchAndMoveMap() {
  const searchValue = searchInput.value.trim();
  if (searchValue) {
    // 3개 지역 중 하나인지 확인
    const zone = FLOOD_ZONES.find(
      (z) => z.name.includes(searchValue) || z.dong === searchValue
    );
    if (zone) {
      selectFloodZone(zone.id);
    } else {
      showCenterAlert(
        "모니터링 대상 지역이 아닙니다.\n(노곡동, 동촌유원지, 죽전네거리만 검색 가능)"
      );
    }
  } else {
    const sido = sidoSelect.value;
    const sigungu = sigunguSelect.value;
    const dong = dongSelect.value;
    if (sido && sigungu && dong) {
      updateWeatherInfo(sido, sigungu, dong);
    } else {
      showCenterAlert("모든 지역을 선택해주세요.");
    }
  }
}

async function updateWeatherInfo(sido, sigungu, dong) {
  try {
    const response = await fetch(
      `/api/risk-info?sido=${sido}&sigungu=${sigungu}&dong=${dong}`
    );
    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error || "Failed to fetch risk info");
    }

    const data = await response.json();
    const weatherCard = document.getElementById("weather-info-card");
    document.getElementById("area-name").innerText = data.area_name;

    // 강수량에 mm 단위 추가
    document.getElementById("rainfall").innerText = `${data.rainfall} mm/h`;

    const riskLevelEl = document.getElementById("risk-level");
    riskLevelEl.textContent = data.risk_level; // 공백 없이 텍스트만 설정

    const riskClassMap = {
      안전: "safe",
      주의: "warning",
      위험: "danger",
      심각: "danger",
    };
    riskLevelEl.className = "risk-level";
    riskLevelEl.classList.add(riskClassMap[data.risk_level] || "safe");

    weatherCard.style.display = "block";

    // 해당 지역으로 지도 이동
    const zone = FLOOD_ZONES.find((z) => z.dong === dong);
    if (zone) {
      const coords = new kakao.maps.LatLng(zone.lat, zone.lng);
      map.setCenter(coords);
      map.setLevel(5);
    }
  } catch (error) {
    console.error("Error updating weather info:", error);
    showCenterAlert(`날씨 정보를 가져오는 데 실패했습니다: ${error.message}`); // alert 대신 showCenterAlert 사용
  }
}

function handleReportClick() {
  if (!currentUser.logged_in) {
    showCenterAlert("로그인 후 제보할 수 있습니다."); // alert 대신 showCenterAlert 사용
    openAuthModal(true);
    return;
  }
  isReportingMode = true;
  showCenterAlert("3개 상습 침수 지역 중 한 곳을 클릭하여 제보해주세요.");
}

function openReportModal(lat, lng) {
  if (!currentUser.logged_in) {
    showCenterAlert("로그인 후 제보할 수 있습니다.");
    openAuthModal(true);
    return;
  }

  // 클릭한 위치가 3개 지역 중 하나인지 확인
  const nearestZone = findNearestFloodZone(lat, lng);

  document.getElementById("report-post-form").reset();
  document.getElementById("report-lat-input").value = nearestZone.lat;
  document.getElementById("report-lng-input").value = nearestZone.lng;

  // 지역명 표시 (hidden input 추가 필요)
  const zoneInput = document.createElement("input");
  zoneInput.type = "hidden";
  zoneInput.name = "zone_name";
  zoneInput.value = nearestZone.name;
  document.getElementById("report-post-form").appendChild(zoneInput);

  reportPostModal.style.display = "flex";
}

function findNearestFloodZone(lat, lng) {
  let nearestZone = FLOOD_ZONES[0];
  let minDistance = Number.MAX_VALUE;

  FLOOD_ZONES.forEach((zone) => {
    const distance = Math.sqrt(
      Math.pow(zone.lat - lat, 2) + Math.pow(zone.lng - lng, 2)
    );
    if (distance < minDistance) {
      minDistance = distance;
      nearestZone = zone;
    }
  });

  return nearestZone;
}

function closeReportModal() {
  reportPostModal.style.display = "none";
}

function handleMapClickForReport(mouseEvent) {
  if (!isReportingMode) return;

  mapClickLat = mouseEvent.latLng.getLat();
  mapClickLng = mouseEvent.latLng.getLng();
  openReportModal(mapClickLat, mapClickLng);

  isReportingMode = false;
}

async function handleReportPostSubmit(e) {
  e.preventDefault();
  const formData = new FormData(document.getElementById("report-post-form"));
  try {
    const response = await fetch("/api/reports", {
      method: "POST",
      body: formData,
    });
    const data = await response.json();
    if (response.ok) {
      showNotification("제보가 성공적으로 등록되었습니다.");
      closeReportModal();
      await updateReports(false);
    } else {
      showCenterAlert(data.error || "제보 등록에 실패했습니다.");
    }
  } catch (error) {
    console.error("제보 제출 오류:", error);
    showCenterAlert("제보 제출 중 오류가 발생했습니다.");
  }
}

// 나머지 함수들 (수정, 삭제 등)
window.handleEdit = function (reportId, currentContent, currentSeverity) {
  openEditModal(reportId, currentContent, currentSeverity);
};

function openEditModal(reportId, content, severity) {
  document.getElementById("edit-report-id").value = reportId;
  document.getElementById("edit-content-input").value = content;
  const severityRadio = document.querySelector(
    `input[name="edit-severity"][value="${severity}"]`
  );
  if (severityRadio) severityRadio.checked = true;
  editReportModal.style.display = "flex";
}

function closeEditModal() {
  editReportModal.style.display = "none";
}

async function handleEditReportSubmit(e) {
  e.preventDefault();
  const reportId = document.getElementById("edit-report-id").value;
  const newContent = document.getElementById("edit-content-input").value;
  const newSeverity = document.querySelector(
    'input[name="edit-severity"]:checked'
  ).value;

  const response = await fetch(`/api/reports/${reportId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: newContent, severity: newSeverity }),
  });
  const data = await response.json();
  if (response.ok) {
    showNotification(data.message);
    closeEditModal();
    await updateReports(false);
  } else {
    alert(data.error);
  }
}

window.handleDelete = function (reportId) {
  reportIdToDelete = reportId;
  confirmModal.style.display = "flex";
};

async function performDelete(reportId) {
  const response = await fetch(`/api/reports/${reportId}`, {
    method: "DELETE",
  });
  const data = await response.json();
  if (response.ok) {
    showNotification(data.message);
    await updateReports(false);
  } else {
    alert(data.error);
  }
  reportIdToDelete = null;
}

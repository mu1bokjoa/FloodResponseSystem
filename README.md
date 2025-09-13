# FloodResponseSystem

AI 기반 침수 피해 대응 및 커뮤니티 구축 플랫폼🌧️
사용자 참여형 지도 기반 실시간 침수 위험 등록 및 시민 제보 플랫폼

## 프로젝트 개요
기상청의 실시간 강수량 정보와 Random Foreset 모델을 활용해서 현재 지역의 침수 위험 수준을 예측하고, 시민들이 직접 현장 상황을 제보할 수 있는 플랫폼입니다.

## 개발 동기
대구·경북 지역은 여름철 국지성 폭우로 인해 갑작스러운 침수가 자주 발생합니다. 2025년 7월 중순 노곡동 인근 침수 사고와 같은 상황에서는 대피 시간이 매우 짧기 때문에, 지금 당장 위험한 곳이 어디인지 실시간으로 확인하는 것이 중요합니다.

## 서비스 핵심 가치
### 빠른 확인: 실시간 강수량을 바탕으로 즉시 위험도 확인
### 현장 중심: 시민들이 올린 사진과 제보를 통해 실제 상황 공유
### 확장 가능성: 현재는 기상청 데이터와 간단한 모델이지만, 향후 하천 수위 센서와 결합 가능

## 기술 스택
Frontend
HTML, CSS, JavaScript
Kakao Map API

Backend
Python Flask Framework
SQLite Database

Machine Learning
scikit-learn RandomForest
입력: 강수량, 수위
출력: 침수 위험도 예측

Data Source
기상청 초단기 실황 API (RN1: 1시간 강수량)
공공데이터 포털

## Get Started

### Installation

1. Clone FloodResponse
```bash
git clone https://github.com/mu1bokjoa/FloodResponseSystem.git
cd FloodResponse
```

2. Create the environment, here we show an example using conda.
```bash
python -m venv floodresponse
floodresponse\Scripts\activate
pip install -r requirements.txt
```

### Running
```bash
# The Main File(app.py) Should be run at "FloodResponse/backend"
# It will be start when the model download is finished.
# model : Random Forest
python app.py
```


## 주요 기능
### 회원 관리
- 회원가입, 로그인, 로그아웃
- 로그인 상태에 따른 제보 작성 권한 관리

### 침수 위험 조회
- 상습 침수 지역 선택 기능
- 기상청 데이터 + ML 모델 기반 위험도 분석
- 실시간 데이터 자동 갱신

### 제보 시스템
- 위치, 텍스트, 사진·영상 업로드
- 실시간 제보 공유 및 지도 표시
- 개인정보 보호를 위한 작성자 권한 관리

### 지도 UI
- 대구 주요 상습 침수 지역 원클릭 조회
- 노곡동
- 동촌유원지
- 죽전네거리/서남시장
- 최근 제보 강조 표시
- 주기적 데이터 자동 갱신

### 향후 계획
- 하천 수위 센서 데이터 연동
- 머신러닝 모델 고도화
- 푸시 알림 기능 추가
- 대구·경북 외 지역 확장

주의사항: 이 서비스는 참고용으로만 사용하시고, 실제 재해 상황에서는 공식 기관의 안내를 따라주세요.
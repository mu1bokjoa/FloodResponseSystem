import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score
import joblib

print("1. 데이터 로딩 시작...")
try:
    df = pd.read_csv("flood_dataset_final.csv")
except FileNotFoundError:
    print("오류: 'flood_dataset_final.csv' 파일을 찾을 수 없습니다. 먼저 데이터셋 파일을 생성해주세요.")
    exit()
    
# --- 아래 코드 추가 ---
# features로 사용할 열에 숫자가 아닌 값이 있는지 확인합니다.
features = ['rainfall_mm', 'river_level_m']
for col in features:
    # errors='coerce'는 숫자로 바꿀 수 없는 값을 NaT(Not a Time) 또는 NaN(Not a Number)으로 만듭니다.
    # isna()는 이런 NaN 값을 찾아냅니다.
    problematic_rows = df[pd.to_numeric(df[col], errors='coerce').isna()]
    if not problematic_rows.empty:
        print(f"'{col}' 열에서 숫자가 아닌 값을 포함한 행을 찾았습니다:")
        print(problematic_rows)
# --- 여기까지 추가 ---

risk_map = {'안전': 0, '주의': 1, '위험': 2, '심각': 3}
df['risk_level_encoded'] = df['risk_level'].map(risk_map)

print("2. 데이터 전처리 및 분리...")
features = ['rainfall_mm', 'river_level_m']
# 숫자로 변환된 열의 이름을 변수로 지정
target = 'risk_level_encoded'

X = df[features]
# 수정: AI가 이해할 수 있도록 숫자로 변환된 열(target)을 정답 데이터로 사용 ###
y = df[target]

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

print(f"훈련 데이터: {len(X_train)}개, 테스트 데이터: {len(X_test)}개")

print("3. AI 모델 학습 시작...")
model = RandomForestClassifier(n_estimators=100, max_depth=10, random_state=42)
model.fit(X_train, y_train)

print("4. 모델 성능 평가...")
y_pred = model.predict(X_test)
accuracy = accuracy_score(y_test, y_pred)
print(f"모델 정확도: {accuracy * 100:.2f}%")

print("5. 학습된 모델 파일로 저장...")
joblib.dump(model, 'flood_predictor_model.pkl')

print("학습 및 모델 저장 완료! (backend 폴더로 flood_predictor_model.pkl 파일을 이동해주세요)")
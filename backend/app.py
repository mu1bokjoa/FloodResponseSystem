import os
import json
import pandas as pd
import joblib
from datetime import datetime, timezone, timedelta
from flask import Flask, jsonify, request, render_template, session, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
import uuid
import logging
import requests

# --- 1. 기본 설정 ---
basedir = os.path.dirname(os.path.abspath(__file__))
instance_path = os.path.join(basedir, 'instance')
os.makedirs(instance_path, exist_ok=True)
db_path = os.path.join(instance_path, 'flood_data.db')
UPLOAD_FOLDER = os.path.join(basedir, 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'mp4', 'mov'}
frontend_folder = os.path.join(basedir, '..', 'frontend')

# API 키 설정
KMA_API_KEY = os.environ.get('KMA_API_KEY', 'Z+7QNSYIXFms1bOgUWG9vvFORODUXGWaEmPiSOYvXJ4kQ4Bg9flUJ69JhnzAVR/wdLh7UvoZI+sPQ7nBZMJo1g==')

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

app = Flask(__name__,
            template_folder=frontend_folder,
            static_folder=frontend_folder,
            static_url_path='/frontend')
            
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['SECRET_KEY'] = 'dev-secret-key-for-a-secure-session-v3'
db = SQLAlchemy(app)
logging.basicConfig(level=logging.INFO)

# 3개 상습 침수 지역 데이터
FLOOD_ZONES = {
    "대구광역시": {
        "북구": {
            "노곡동": {"nx": 88, "ny": 89, "river_sensor": "1018683", "name": "노곡동", "lat": 35.9063, "lng": 128.5629}
        },
        "달서구": {
            "죽전동": {"nx": 86, "ny": 87, "river_sensor": "1018683", "name": "죽전네거리/서남시장", "lat": 35.8523, "lng": 128.5425}
        },
        "동구": {
            "효목동": {"nx": 91, "ny": 91, "river_sensor": "1018662", "name": "동촌유원지", "lat": 35.8825, "lng": 128.6499}
        }
    }
}

# 간단한 격자 좌표 데이터 (3개 지역만)
GRID_COORDS = [
    {"1단계": "대구광역시", "2단계": "달서구", "3단계": "", "격자 X": 88, "격자 Y": 89},
    {"1단계": "대구광역시", "2단계": "북구", "3단계": "", "격자 X": 89, "격자 Y": 91},
    {"1단계": "대구광역시", "2단계": "동구", "3단계": "", "격자 X": 91, "격자 Y": 91}
]

try:
    flood_model = joblib.load(os.path.join(basedir, 'flood_predictor_model.pkl'))
    print("AI 모델 로드 성공!")
except FileNotFoundError:
    flood_model = None
    print("경고: 학습된 AI 모델 파일(flood_predictor_model.pkl)을 찾을 수 없습니다.")

# --- 2. 데이터베이스 모델 ---
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)
    def set_password(self, password): self.password_hash = generate_password_hash(password)
    def check_password(self, password): return check_password_hash(self.password_hash, password)

class Report(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    lat = db.Column(db.Float, nullable=False)
    lng = db.Column(db.Float, nullable=False)
    content = db.Column(db.String(200), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    user = db.relationship('User', backref=db.backref('reports', lazy=True))
    severity = db.Column(db.String(50), nullable=False, default='주의')
    image_filename = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    zone_name = db.Column(db.String(100), nullable=True)  # 지역명 추가

with app.app_context():
    db.create_all()

# --- 유틸리티 함수 ---
def get_ultra_srt_base_time():
    now = datetime.now()
    check_time = now - timedelta(minutes=10)
    minutes = (check_time.minute // 10) * 10
    base_time = check_time.replace(minute=minutes, second=0, microsecond=0)
    
    if minutes == 0 and check_time.minute < 10:
        base_time = base_time - timedelta(hours=1)
        base_time = base_time.replace(minute=50)
    
    base_date = base_time.strftime('%Y%m%d')
    base_time_str = base_time.strftime('%H%M')
    
    return base_date, base_time_str

def get_weather_data(nx, ny):
    """기상청 API를 통한 실시간 날씨 데이터 조회"""
    try:
        base_date, base_time = get_ultra_srt_base_time()
        
        url = "http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst"
        params = {
            'serviceKey': KMA_API_KEY,
            'pageNo': '1',
            'numOfRows': '100',
            'dataType': 'JSON',
            'base_date': base_date,
            'base_time': base_time,
            'nx': str(nx),
            'ny': str(ny)
        }
        
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        if data.get('response', {}).get('header', {}).get('resultCode') == '00':
            items = data.get('response', {}).get('body', {}).get('items', {}).get('item', [])
            weather = {item.get('category'): item.get('obsrValue') for item in items}
            
            rainfall = 0.0
            rn1_value = weather.get('RN1')
            if rn1_value and rn1_value != '강수없음':
                try:
                    rainfall = float(rn1_value)
                except:
                    rainfall = 0.0
            
            return rainfall
        return 0.0
    except Exception as e:
        app.logger.error(f"날씨 API 오류: {e}")
        return 0.0

# --- 3. API 엔드포인트 ---
@app.route('/')
def index(): 
    return render_template('index.html')

@app.route('/community')
def community_page():
    return render_template('community.html')

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

# 사용자 인증 API (변경 없음)
@app.route('/api/check-username', methods=['POST'])
def check_username():
    username = request.json.get('username')
    if not username:
        return jsonify({"is_available": False, "message": "아이디를 입력해주세요."})
    if User.query.filter_by(username=username).first():
        return jsonify({"is_available": False, "message": "이미 사용 중인 아이디입니다."})
    return jsonify({"is_available": True, "message": "사용 가능한 아이디입니다."})

@app.route('/api/check-email', methods=['POST'])
def check_email():
    email = request.json.get('email')
    if not email:
        return jsonify({"is_available": False, "message": "이메일을 입력해주세요."})
    if User.query.filter_by(email=email).first():
        return jsonify({"is_available": False, "message": "이미 가입된 이메일입니다."})
    return jsonify({"is_available": True, "message": "사용 가능한 이메일입니다."})

@app.route('/api/signup', methods=['POST'])
def signup():
    data = request.json
    username, email, password = data.get('username'), data.get('email'), data.get('password')

    if not all([username, email, password]):
        return jsonify({"error": "모든 항목을 입력해주세요."}), 400
    
    if User.query.filter_by(username=username).first(): 
        return jsonify({"error": "이미 사용 중인 아이디입니다."}), 409
    if User.query.filter_by(email=email).first(): 
        return jsonify({"error": "이미 가입된 이메일입니다."}), 409
    
    new_user = User(username=username, email=email)
    new_user.set_password(password)
    
    db.session.add(new_user)
    db.session.commit()

    session['user_id'] = new_user.id
    session['username'] = new_user.username
    
    return jsonify({
        "message": "회원가입이 완료되었습니다.",
        "logged_in": True,
        "username": new_user.username,
        "user_id": new_user.id
    }), 201

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    username, password = data.get('username'), data.get('password')
    
    user = User.query.filter_by(username=username).first()

    if not user or not user.check_password(password):
        return jsonify({"error": "아이디 또는 비밀번호를 확인하세요."}), 401

    session['user_id'] = user.id
    session['username'] = user.username
    
    return jsonify({
        "message": "로그인 되었습니다.",
        "logged_in": True,
        "username": user.username,
        "user_id": user.id
    }), 200

@app.route('/api/logout')
def logout():
    session.clear()
    return jsonify({"message": "로그아웃 되었습니다."}), 200

@app.route('/api/check-session')
def check_session():
    if 'user_id' in session:
        user = db.session.get(User, session['user_id'])
        if user:
            return jsonify({"logged_in": True, "username": user.username, "user_id": user.id})
    return jsonify({"logged_in": False})

# 지역 정보 API (3개 지역만)
@app.route('/api/locations')
def get_locations(): 
    return jsonify(FLOOD_ZONES)

# 위험도 정보 API (수정)
@app.route('/api/risk-info')
def risk_info():
    sido = request.args.get('sido')
    sigungu = request.args.get('sigungu')
    dong = request.args.get('dong')
    
    if not all([sido, sigungu, dong]): 
        return jsonify({"error": "지역 정보가 누락되었습니다."}), 400

    # 3개 지역 중 하나인지 확인
    zone_info = None
    if sido == "대구광역시" and sigungu in FLOOD_ZONES[sido]:
        if dong in FLOOD_ZONES[sido][sigungu]:
            zone_info = FLOOD_ZONES[sido][sigungu][dong]
    
    if not zone_info:
        return jsonify({"error": "모니터링 대상 지역이 아닙니다."}), 404
    
    # 날씨 데이터 조회
    current_rainfall = get_weather_data(zone_info['nx'], zone_info['ny'])
    current_river_level = 2.0  # 기본값 (센서 연동 시 실제값 사용)
    
    # AI 모델 예측
    if flood_model:
        try:
            input_features = pd.DataFrame({
                'rainfall_mm': [current_rainfall],
                'river_level_m': [current_river_level]
            })
            prediction = flood_model.predict(input_features)[0]
            risk_map = {0: '안전', 1: '주의', 2: '위험', 3: '심각'}
            risk_level = risk_map.get(int(prediction), '알수없음')
        except:
            risk_level = '안전' if current_rainfall < 30 else '주의' if current_rainfall < 50 else '위험'
    else:
        risk_level = '안전' if current_rainfall < 30 else '주의' if current_rainfall < 50 else '위험'

    return jsonify({
        'rainfall': f"{current_rainfall:.1f}",
        'river_level': f"{current_river_level:.2f}",
        'risk_level': risk_level,
        'area_name': f'{zone_info["name"]} ({sido} {sigungu} {dong})',
        'data_source': '실시간'
    })

# 제보 관련 API
@app.route('/api/reports', methods=['GET'])
def get_reports():
    reports = Report.query.order_by(Report.id.desc()).all()
    return jsonify([{
        'id': r.id, 
        'lat': r.lat, 
        'lng': r.lng, 
        'content': r.content, 
        'user_id': r.user.id, 
        'username': r.user.username, 
        'severity': r.severity, 
        'image_filename': r.image_filename,
        'created_at': r.created_at.isoformat() + 'Z',
        'zone_name': r.zone_name
    } for r in reports])

@app.route('/api/reports', methods=['POST'])
def create_report():
    if 'user_id' not in session: 
        return jsonify({"error": "로그인이 필요합니다."}), 401
    
    lat = request.form.get('lat')
    lng = request.form.get('lng')
    content = request.form.get('content')
    severity = request.form.get('severity')
    zone_name = request.form.get('zone_name', '')
    file = request.files.get('file')
    
    image_save_name = None
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        ext = filename.rsplit('.', 1)[1].lower()
        image_save_name = f"{uuid.uuid4().hex}.{ext}"
        file.save(os.path.join(app.config['UPLOAD_FOLDER'], image_save_name))

    new_report = Report(
        lat=float(lat), 
        lng=float(lng), 
        content=content, 
        severity=severity,
        zone_name=zone_name,
        image_filename=image_save_name, 
        user_id=session['user_id']
    )
    db.session.add(new_report)
    db.session.commit()
    
    return jsonify({'message': '제보가 등록되었습니다.'}), 201

@app.route('/api/reports/<int:report_id>', methods=['PUT'])
def update_report(report_id):
    if 'user_id' not in session: 
        return jsonify({"error": "로그인이 필요합니다."}), 401
    
    report = db.session.get(Report, report_id)
    if not report: 
        return jsonify({"error": "존재하지 않는 제보입니다."}), 404
    if report.user_id != session['user_id']: 
        return jsonify({"error": "수정 권한이 없습니다."}), 403
    
    data = request.json
    report.content = data.get('content', report.content)
    report.severity = data.get('severity', report.severity)
    db.session.commit()
    
    return jsonify({"message": "제보가 수정되었습니다."})

@app.route('/api/reports/<int:report_id>', methods=['DELETE'])
def delete_report(report_id):
    if 'user_id' not in session: 
        return jsonify({"error": "로그인이 필요합니다."}), 401
    
    report = db.session.get(Report, report_id)
    if not report: 
        return jsonify({"error": "존재하지 않는 제보입니다."}), 404
    if report.user_id != session['user_id']: 
        return jsonify({"error": "삭제 권한이 없습니다."}), 403
    
    db.session.delete(report)
    db.session.commit()
    
    return jsonify({"message": "제보가 삭제되었습니다."})

if __name__ == '__main__':
    app.run(debug=True, port=5001, host='0.0.0.0')
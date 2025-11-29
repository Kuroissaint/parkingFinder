from flask import Flask, render_template, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from urllib.parse import quote_plus

app = Flask(__name__)

# --- KONFIGURASI DATABASE ---
# GANTI PASSWORD DI SINI SESUAI POSTGRES KAMU
password_db = 'Lopunny04' 
encoded_pass = quote_plus(password_db)

# Pastikan nama database 'parking_upi' sudah dibuat di pgAdmin
app.config['SQLALCHEMY_DATABASE_URI'] = f'postgresql://postgres:{encoded_pass}@localhost:5432/parking_upi'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# --- MODEL DATABASE ---
class ParkingSlot(db.Model):
    __tablename__ = 'parking_slots'
    id = db.Column(db.String(10), primary_key=True)  # Contoh: L1-A1
    floor = db.Column(db.Integer, default=1)
    status = db.Column(db.String(20), default='empty')
    last_updated = db.Column(db.DateTime, default=datetime.utcnow)

class ParkingLog(db.Model):
    __tablename__ = 'parking_logs'
    id = db.Column(db.Integer, primary_key=True)
    slot_id = db.Column(db.String(10), db.ForeignKey('parking_slots.id'))
    action = db.Column(db.String(20)) # ENTRY / EXIT
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

# --- INISIALISASI DATA ---
def init_db():
    with app.app_context():
        db.create_all()
        
        # Cek database, jika kosong isi data baru
        if not ParkingSlot.query.first():
            print("Inisialisasi Denah Baru (4 Blok)...")
            
            # === LANTAI 1 & 2 ===
            for floor in [1, 2]:
                prefix = f"L{floor}"
                
                # BLOK A (Atas): A1 - A12
                for i in range(1, 13):
                    sid = f"{prefix}-A{i}"
                    db.session.add(ParkingSlot(id=sid, floor=floor, status='empty'))
                
                # BLOK B (Bawah): B1 - B12
                for i in range(1, 13):
                    sid = f"{prefix}-B{i}"
                    db.session.add(ParkingSlot(id=sid, floor=floor, status='empty'))

            db.session.commit()
            print("Database berhasil diupdate dengan layout A1-A12 & B1-B12!")

init_db()

# --- ROUTES ---
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/slots", methods=["GET"])
def get_slots():
    slots = ParkingSlot.query.all()
    result = {slot.id: slot.status for slot in slots}
    return jsonify(result)

@app.route("/api/update", methods=["POST"])
def update_slot():
    data = request.json
    slot_id = data.get('id')
    new_status = data.get('status')
    
    slot = ParkingSlot.query.get(slot_id)
    if slot:
        slot.status = new_status
        slot.last_updated = datetime.utcnow()
        
        # LOGGING: Catat sejarah perubahan
        action = "ENTRY" if new_status == "occupied" else "EXIT"
        log_entry = ParkingLog(slot_id=slot_id, action=action)
        db.session.add(log_entry)
        
        db.session.commit()
        return jsonify({"message": "Success", "id": slot_id, "status": new_status})
    return jsonify({"message": "Slot not found"}), 404

if __name__ == "__main__":
    app.run(debug=True)

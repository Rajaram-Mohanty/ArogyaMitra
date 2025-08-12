const mongoose = require('mongoose');

// Track connection state
let dbConnected = false;

// Schemas
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    phone: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

const reportSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, required: true },
    symptoms: { type: String, required: true },
    age: { type: Number },
    gender: { type: String },
    height: { type: Number },
    weight: { type: Number },
    preExistingConditions: { type: String },
    currentMedications: { type: String },
    additional_info: { type: String },
    preliminary_diagnosis: { type: String },
    urgency_level: { type: String },
    is_active: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

// Models can be registered before connection; Mongoose will bind them upon connect
const UserModel = mongoose.models.User || mongoose.model('User', userSchema);
const ReportModel = mongoose.models.Report || mongoose.model('Report', reportSchema);

async function connectToDatabase(uri) {
  if (!uri) {
    console.warn('MONGODB_URI not set. Running in in-memory mode.');
    return;
  }
  if (dbConnected) return; // prevent duplicate connects
  try {
    await mongoose.connect(uri, { autoIndex: true });
    dbConnected = true;
    console.log('Connected to MongoDB');
  } catch (e) {
    console.error('MongoDB connection failed:', e.message);
    console.warn('Falling back to in-memory mode.');
  }
}

function isDbConnected() {
  return dbConnected;
}

module.exports = {
  connectToDatabase,
  isDbConnected,
  UserModel,
  ReportModel,
};



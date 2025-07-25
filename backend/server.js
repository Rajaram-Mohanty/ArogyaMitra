// Node.js Express backend for ArogyaMitra API (Python-to-JS port)
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// In-memory storage
const users = [];
const diagnoses = [];

// Gemini API config
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyD1zTsKCtTJIcXi8z304TP1d5nwx094-Oc';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

// Utility: hash password
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Utility: call Gemini API
async function callGeminiAPI(prompt) {
  try {
    const response = await axios.post(
      `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
    );
    const result = response.data;
    if (result.candidates && result.candidates.length > 0) {
      return result.candidates[0].content.parts[0].text;
    }
    return 'Unable to generate diagnosis. Please consult a healthcare professional.';
  } catch (e) {
    console.error('Gemini API error:', e.message);
    return 'Unable to generate diagnosis due to technical issues. Please consult a healthcare professional.';
  }
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', service: 'ArogyaMitra API' });
});

// Register
app.post('/api/register', (req, res) => {
  const { name, email, password, phone } = req.body;
  if (users.find(u => u.email === email)) {
    return res.status(400).json({ success: false, message: 'Email already registered' });
  }
  const user_id = uuidv4();
  const hashed_password = hashPassword(password);
  users.push({ user_id, name, email, password: hashed_password, phone, created_at: new Date(), is_active: true });
  res.json({ success: true, message: 'User registered successfully', user_id, name });
});

// Login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const user = users.find(u => u.email === email);
  if (!user || user.password !== hashPassword(password)) {
    return res.status(401).json({ success: false, message: 'Invalid email or password' });
  }
  res.json({ success: true, message: 'Login successful', user_id: user.user_id, name: user.name, email: user.email });
});

// Assess symptoms
app.post('/api/assess-symptoms', async (req, res) => {
  const { user_id, symptoms, age, gender, additional_info } = req.body;
  const medical_prompt = `\nYou are an AI medical assistant helping rural healthcare access. Please provide a preliminary assessment based on the following information:\n\nPatient Information:\n- Age: ${age || 'Not specified'}\n- Gender: ${gender || 'Not specified'}\n- Symptoms: ${symptoms}\n- Additional Information: ${additional_info || 'None'}\n\nPlease provide a structured response with:\n1. PRELIMINARY DIAGNOSIS: List possible conditions (disclaimer: not a substitute for professional medical advice)\n2. URGENCY LEVEL: Low/Medium/High/Emergency\n3. IMMEDIATE RECOMMENDATIONS: What the patient should do immediately\n4. WHEN TO SEEK CARE: When to visit a healthcare facility\n5. GENERAL CARE TIPS: Home care suggestions if appropriate\n\nImportant: Always emphasize this is preliminary guidance and professional medical consultation is recommended.\nKeep language simple and accessible for rural communities.\n`;
  const ai_response = await callGeminiAPI(medical_prompt);
  const report_id = uuidv4();
  const created_at = new Date();
  diagnoses.push({ report_id, user_id, symptoms, age, gender, additional_info, preliminary_diagnosis: ai_response, created_at, is_active: true });
  // Extract urgency level (simple parsing)
  let urgency_level = 'Medium';
  if (/EMERGENCY|URGENT/i.test(ai_response)) urgency_level = 'High';
  else if (/LOW/i.test(ai_response)) urgency_level = 'Low';
  res.json({
    success: true,
    report_id,
    preliminary_diagnosis: ai_response,
    urgency_level,
    recommendations: [
      'Follow the guidance provided above',
      'Consult with a healthcare professional for proper diagnosis',
      'Keep monitoring your symptoms',
    ],
    created_at: created_at.toISOString(),
  });
});

// Get user reports
app.get('/api/user-reports/:user_id', (req, res) => {
  const { user_id } = req.params;
  const reports = diagnoses.filter(r => r.user_id === user_id && r.is_active)
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, 10)
    .map(r => ({ ...r, created_at: r.created_at.toISOString() }));
  res.json({ success: true, reports, count: reports.length });
});

// Nearby facilities (mock)
app.get('/api/nearby-facilities', (req, res) => {
  const { latitude, longitude, location } = req.query;
  const mock_facilities = [
    {
      name: 'City General Hospital',
      address: 'Main Street, Urban Center',
      phone: '+91-XXX-XXXXXXX',
      specialties: ['General Medicine', 'Emergency Care'],
      distance: '15 km',
      type: 'Hospital',
    },
    {
      name: 'District Health Center',
      address: 'Government Hospital Road',
      phone: '+91-XXX-XXXXXXX',
      specialties: ['Primary Care', 'Maternal Health'],
      distance: '8 km',
      type: 'Primary Health Center',
    },
    {
      name: 'Metro Medical Clinic',
      address: 'Shopping Complex, City Center',
      phone: '+91-XXX-XXXXXXX',
      specialties: ['General Practice', 'Pediatrics'],
      distance: '20 km',
      type: 'Clinic',
    },
  ];
  res.json({
    success: true,
    facilities: mock_facilities,
    location_searched: location || `Lat: ${latitude}, Lng: ${longitude}`,
  });
});

// Start server
const PORT = process.env.PORT || 8001;
app.listen(PORT, () => {
  console.log(`ArogyaMitra API (Node.js) running on port ${PORT}`);
});

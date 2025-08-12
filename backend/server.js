// Node.js Express backend for ArogyaMitra API (Python-to-JS port)
const express = require('express');
const cors = require('cors');

const crypto = require('crypto');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();
const { connectToDatabase, isDbConnected, UserModel, ReportModel } = require('./model');

const app = express();
app.use(cors());
app.use(express.json());

// Database connection will be established using MONGODB_URI from environment

// JWT config
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

connectToDatabase(process.env.MONGODB_URI);

// Auth middleware
function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, message: 'Missing Authorization token' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { user_id: payload.user_id, email: payload.email };
    next();
  } catch (e) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

// Gemini API config
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyD1zTsKCtTJIcXi8z304TP1d5nwx094-Oc';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

// Password helpers
async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

// JWT helper
function issueToken(user) {
  return jwt.sign({ user_id: user.user_id || user._id?.toString(), email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

// Utility: call Gemini API with comprehensive patient data
async function callGeminiAPI(patientData) {
  try {
    const {
      symptoms,
      age,
      gender,
      height,
      weight,
      preExistingConditions,
      currentMedications,
      additionalInfo
    } = patientData;

    // Calculate BMI if height and weight are provided
    let bmi = null;
    let bmiCategory = null;
    if (height && weight) {
      const heightInMeters = height / 100; // Convert cm to meters
      bmi = (weight / (heightInMeters * heightInMeters)).toFixed(1);
      
      if (bmi < 18.5) bmiCategory = 'Underweight';
      else if (bmi < 25) bmiCategory = 'Normal weight';
      else if (bmi < 30) bmiCategory = 'Overweight';
      else bmiCategory = 'Obese';
    }

    const comprehensivePrompt = `You are an expert AI-powered diagnostic chatbot specializing in rural healthcare accessibility. Your mission is to provide preliminary health assessments based on patient information and symptoms, then offer appropriate medical guidance and referrals.

<-- Core Mission: AI-Powered Diagnostic Assessment -->
You provide:
• AI-driven preliminary diagnostic analysis
• Step-by-step health assessment recommendations  
• Referral guidance to appropriate medical practitioners
• Clear, accessible medical advice for rural communities

<-- Patient Information Analysis -->
Patient Demographics:
• Age: ${age || 'Not specified'} years
• Gender: ${gender || 'Not specified'}
• Height: ${height ? height + ' cm' : 'Not specified'}
• Weight: ${weight ? weight + ' kg' : 'Not specified'}
• BMI: ${bmi ? bmi + ' (' + bmiCategory + ')' : 'Not calculated'}
• Pre-existing Conditions: ${preExistingConditions || 'None reported'}
• Current Medications: ${currentMedications || 'None reported'}

Present Health Issues:
• Current Symptoms: ${symptoms}
• Additional Information: ${additionalInfo || 'None provided'}

<-- Diagnostic Response Format -->
Provide your response in this structured format:

*PATIENT ASSESSMENT SUMMARY*
• Age: ${age || 'Not specified'} years
• BMI: ${bmi ? bmi + ' (' + bmiCategory + ')' : 'Not calculated'}
• Pre-existing Conditions: ${preExistingConditions || 'None reported'}
• Current Symptoms: ${symptoms}

*PRELIMINARY DIAGNOSTIC ANALYSIS*
1. *Primary Concern Assessment*:
   - Most likely condition(s) based on symptoms
   - Risk level: [LOW/MODERATE/HIGH/EMERGENCY]

2. *Contributing Factors*:
   - Age-related considerations
   - Weight/BMI impact (if applicable)
   - Pre-existing condition influence
   - Medication interactions (if applicable)

3. *Symptom Analysis*:
   - Duration significance
   - Severity assessment  
   - Pattern recognition
   - Red flag symptoms (if any)

*RECOMMENDED ACTIONS*
1. *Immediate Steps*:
   - Self-care measures
   - Symptom monitoring
   - When to seek emergency care

2. *Medical Consultation*:
   - Urgency level (immediate/within 24hrs/within week/routine)
   - Type of specialist needed
   - Questions to ask the doctor

3. *Nearby Medical Resources*:
   - Recommended facility type (primary care/specialist/hospital)
   - Suggested location preference (nearest urban center)
   - Telemedicine options if available

*IMPORTANT DISCLAIMERS*
- This is a preliminary assessment only
- Not a substitute for professional medical diagnosis
- Seek immediate medical attention for emergency symptoms
- Contact local emergency services if life-threatening symptoms occur

<-- Communication Guidelines -->
- Use simple, clear language suitable for rural communities
- Avoid complex medical terminology
- Provide practical, actionable advice
- Show empathy and understanding
- Include appropriate urgency indicators
- Offer reassurance when appropriate

<-- Emergency Protocols -->
If symptoms indicate potential emergency:
- Clearly state "SEEK IMMEDIATE MEDICAL ATTENTION"
- List emergency warning signs
- Provide emergency contact guidance
- Prioritize patient safety over preliminary diagnosis

Your role is to provide helpful preliminary assessment while ensuring patients understand the importance of professional medical care when needed.`;

    const response = await axios.post(
      `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: comprehensivePrompt }] }],
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
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email and password are required' });
    }
    if (!isDbConnected()) {
      return res.status(503).json({ success: false, message: 'Database not available. Please try again later.' });
    }
    const existing = await UserModel.findOne({ email });
    if (existing) return res.status(400).json({ success: false, message: 'Email already registered' });
    const passwordHash = await hashPassword(password);
    const userDoc = await UserModel.create({ name, email, passwordHash, phone });
    const token = issueToken(userDoc);
    return res.json({ success: true, message: 'User registered successfully', token, user_id: userDoc._id.toString(), name: userDoc.name, email: userDoc.email });
  } catch (e) {
    console.error('Register error:', e.message);
    return res.status(500).json({ success: false, message: 'Registration failed' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password required' });
    if (!isDbConnected()) {
      return res.status(503).json({ success: false, message: 'Database not available. Please try again later.' });
    }
    const user = await UserModel.findOne({ email });
    if (!user) return res.status(401).json({ success: false, message: 'Invalid email or password' });
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return res.status(401).json({ success: false, message: 'Invalid email or password' });
    const token = issueToken(user);
    return res.json({ success: true, message: 'Login successful', token, user_id: user._id.toString(), name: user.name, email: user.email });
  } catch (e) {
    console.error('Login error:', e.message);
    return res.status(500).json({ success: false, message: 'Login failed' });
  }
});

// Assess symptoms with comprehensive patient data
app.post('/api/assess-symptoms', authMiddleware, async (req, res) => {
  try {
    const { 
      symptoms, 
      age, 
      gender, 
      height,
      weight,
      preExistingConditions,
      currentMedications,
      additional_info 
    } = req.body;

    const user_id = req.user.user_id;

    if (!symptoms) {
      return res.status(400).json({ success: false, message: 'Symptoms are required' });
    }

    // Enforce max 3 active reports per user
    if (!isDbConnected()) {
      return res.status(503).json({ success: false, message: 'Database not available. Please try again later.' });
    }
    const activeCount = await ReportModel.countDocuments({ user: user_id, is_active: true });
    if (activeCount >= 3) {
      return res.status(409).json({ success: false, limitReached: true, message: 'Maximum 3 reports allowed. Please delete existing reports to create a new assessment.' });
    }

    // Prepare comprehensive patient data
    const patientData = {
      symptoms,
      age: age || null,
      gender: gender || null,
      height: height || null,
      weight: weight || null,
      preExistingConditions: preExistingConditions || null,
      currentMedications: currentMedications || null,
      additionalInfo: additional_info || null
    };

    const ai_response = await callGeminiAPI(patientData);

    // Extract urgency level (improved parsing)
    let urgency_level = 'Medium';
    if (/EMERGENCY|URGENT|SEEK IMMEDIATE/i.test(ai_response)) urgency_level = 'High';
    else if (/LOW|ROUTINE/i.test(ai_response)) urgency_level = 'Low';
    else if (/HIGH|SEVERE/i.test(ai_response)) urgency_level = 'High';

    const created_at = new Date();

    const doc = await ReportModel.create({
      user: user_id,
      symptoms,
      age,
      gender,
      height,
      weight,
      preExistingConditions,
      currentMedications,
      additional_info,
      preliminary_diagnosis: ai_response,
      urgency_level,
      is_active: true,
    });
    return res.json({
      success: true,
      report_id: doc._id.toString(),
      preliminary_diagnosis: ai_response,
      urgency_level,
      patient_data: { age, gender, height, weight, preExistingConditions, currentMedications },
      recommendations: [
        'Follow the guidance provided above',
        'Consult with a healthcare professional for proper diagnosis',
        'Keep monitoring your symptoms',
      ],
      created_at: doc.created_at.toISOString(),
    });
  } catch (e) {
    console.error('Assess symptoms error:', e.message);
    return res.status(500).json({ success: false, message: 'Assessment failed' });
  }
});

// Get user reports (auth required)
app.get('/api/reports', authMiddleware, async (req, res) => {
  try {
    const user_id = req.user.user_id;
    if (!isDbConnected()) {
      return res.status(503).json({ success: false, message: 'Database not available. Please try again later.' });
    }
    const docs = await ReportModel.find({ user: user_id, is_active: true }).sort({ created_at: -1 }).limit(10);
    const reports = docs.map(d => ({
      report_id: d._id.toString(),
      user_id: user_id,
      symptoms: d.symptoms,
      age: d.age,
      gender: d.gender,
      height: d.height,
      weight: d.weight,
      preExistingConditions: d.preExistingConditions,
      currentMedications: d.currentMedications,
      additional_info: d.additional_info,
      preliminary_diagnosis: d.preliminary_diagnosis,
      urgency_level: d.urgency_level,
      created_at: d.created_at.toISOString(),
      is_active: d.is_active,
    }));
    return res.json({ success: true, reports, count: reports.length });
  } catch (e) {
    console.error('Get reports error:', e.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch reports' });
  }
});

// Backward-compatible route, but enforce auth and identity match
app.get('/api/user-reports/:user_id', authMiddleware, async (req, res) => {
  try {
    const pathUserId = req.params.user_id;
    if (pathUserId !== req.user.user_id) {
      return res.status(403).json({ success: false, message: 'Forbidden: user mismatch' });
    }
    const user_id = req.user.user_id;
    if (!isDbConnected()) {
      return res.status(503).json({ success: false, message: 'Database not available. Please try again later.' });
    }
    const docs = await ReportModel.find({ user: user_id, is_active: true }).sort({ created_at: -1 }).limit(10);
    const reports = docs.map(d => ({
      report_id: d._id.toString(),
      user_id: user_id,
      symptoms: d.symptoms,
      age: d.age,
      gender: d.gender,
      height: d.height,
      weight: d.weight,
      preExistingConditions: d.preExistingConditions,
      currentMedications: d.currentMedications,
      additional_info: d.additional_info,
      preliminary_diagnosis: d.preliminary_diagnosis,
      urgency_level: d.urgency_level,
      created_at: d.created_at.toISOString(),
      is_active: d.is_active,
    }));
    return res.json({ success: true, reports, count: reports.length });
  } catch (e) {
    console.error('Get user-reports error:', e.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch reports' });
  }
});

// Delete a report
app.delete('/api/reports/:report_id', authMiddleware, async (req, res) => {
  try {
    const { report_id } = req.params;
    const user_id = req.user.user_id;
    if (!isDbConnected()) {
      return res.status(503).json({ success: false, message: 'Database not available. Please try again later.' });
    }
    const doc = await ReportModel.findOne({ _id: report_id, user: user_id });
    if (!doc) return res.status(404).json({ success: false, message: 'Report not found' });
    doc.is_active = false;
    await doc.save();
    return res.json({ success: true, message: 'Report deleted' });
  } catch (e) {
    console.error('Delete report error:', e.message);
    return res.status(500).json({ success: false, message: 'Failed to delete report' });
  }
});

// Bulk delete all active reports
app.delete('/api/reports', authMiddleware, async (req, res) => {
  try {
    const user_id = req.user.user_id;
    if (!isDbConnected()) {
      return res.status(503).json({ success: false, message: 'Database not available. Please try again later.' });
    }
    await ReportModel.updateMany({ user: user_id, is_active: true }, { $set: { is_active: false } });
    return res.json({ success: true, message: 'All reports deleted' });
  } catch (e) {
    console.error('Bulk delete reports error:', e.message);
    return res.status(500).json({ success: false, message: 'Failed to delete reports' });
  }
});

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// Nearby facilities (OpenStreetMap-powered)
app.get('/api/nearby-facilities', async (req, res) => {
  const { location, latitude, longitude } = req.query;
  console.log(`Nearby facilities request: location="${location}", lat=${latitude}, lon=${longitude}`);
  let lat, lon, display_name;
  if (latitude && longitude) {
    lat = latitude;
    lon = longitude;
    display_name = `Lat: ${lat}, Lon: ${lon}`;
  } else if (location) {
    // Geocode address
    try {
      const geoResp = await axios.get(NOMINATIM_URL, {
        params: {
          q: location,
          format: 'json',
          addressdetails: 1,
          limit: 1,
        },
        headers: { 'User-Agent': 'ArogyaMitra/1.0 (contact@example.com)' }
      });
      if (!geoResp.data || geoResp.data.length === 0) {
        return res.status(404).json({ success: false, message: 'Could not geocode address.' });
      }
      lat = geoResp.data[0].lat;
      lon = geoResp.data[0].lon;
      display_name = geoResp.data[0].display_name;
    } catch (e) {
      return res.status(500).json({ success: false, message: 'Geocoding failed', error: e.message });
    }
  } else {
    return res.status(400).json({ success: false, message: 'Either address or coordinates required.' });
  }

  try {
    // Validate coordinates
    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);
    if (isNaN(latNum) || isNaN(lonNum) || latNum < -90 || latNum > 90 || lonNum < -180 || lonNum > 180) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid coordinates provided. Latitude must be between -90 and 90, longitude between -180 and 180.' 
      });
    }

    // 2. Search for facilities using Overpass API, increasing radius if needed
    let radius = 50000; // 50km
    let facilities = [];
    let maxRadius = 300000; // 300km
    let lastError = null;
    
    while (facilities.length === 0 && radius <= maxRadius) {
      try {
        // Overpass QL: find hospitals, clinics, health_centers, doctors
        const overpassQuery = `
          [out:json][timeout:25];
          (
            node["amenity"~"hospital|clinic|doctors|health_centre"](around:${radius},${latNum},${lonNum});
            way["amenity"~"hospital|clinic|doctors|health_centre"](around:${radius},${latNum},${lonNum});
            relation["amenity"~"hospital|clinic|doctors|health_centre"](around:${radius},${latNum},${lonNum});
          );
          out center tags;
        `;
        const overpassResp = await axios.post(OVERPASS_URL, overpassQuery, {
          headers: { 'Content-Type': 'text/plain' },
          timeout: 30000
        });
        
        if (overpassResp.data && overpassResp.data.elements) {
          facilities = overpassResp.data.elements.map(el => {
            const tags = el.tags || {};
            return {
              name: tags.name || 'Unknown Facility',
              address: [tags['addr:full'], tags['addr:street'], tags['addr:city'], tags['addr:state'], tags['addr:postcode'], tags['addr:country']].filter(Boolean).join(', ') || display_name,
              type: tags.amenity || 'Unknown',
              specialties: tags.healthcare ? [tags.healthcare] : [],
              distance: null, // We'll calculate below
              lat: el.lat || (el.center && el.center.lat),
              lon: el.lon || (el.center && el.center.lon),
            };
          });
        }
      } catch (overpassError) {
        lastError = overpassError;
        console.warn(`Overpass API error at radius ${radius}m:`, overpassError.message);
        // Continue with larger radius
      }
      radius += 50000; // increase by 50km
    }

    // 3. Calculate distance for each facility
    function haversine(lat1, lon1, lat2, lon2) {
      function toRad(x) { return x * Math.PI / 180; }
      const R = 6371; // km
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c;
    }
    facilities = facilities.map(fac => {
      if (fac.lat && fac.lon) {
        fac.distance = `${haversine(parseFloat(lat), parseFloat(lon), fac.lat, fac.lon).toFixed(1)} km`;
      } else {
        fac.distance = 'Unknown';
      }
      return fac;
    });

    // 4. Sort by distance and limit to 20 results
    facilities.sort((a, b) => {
      if (a.distance === 'Unknown') return 1;
      if (b.distance === 'Unknown') return -1;
      return parseFloat(a.distance) - parseFloat(b.distance);
    });
    facilities = facilities.slice(0, 20);

    // If no facilities found after all attempts
    if (facilities.length === 0) {
      console.warn(`No facilities found within ${maxRadius/1000}km of ${display_name}`);
      return res.json({
        success: true,
        facilities: [],
        location_searched: display_name,
        message: `No healthcare facilities found within ${maxRadius/1000}km of your location. Try searching in a different area.`
      });
    }

    res.json({
      success: true,
      facilities,
      location_searched: display_name,
    });
  } catch (e) {
    console.error('Nearby facilities error:', e.message);
    
    // Provide more specific error messages
    let errorMessage = 'Failed to find facilities';
    if (e.code === 'ECONNABORTED') {
      errorMessage = 'Request timeout - external services are slow. Please try again.';
    } else if (e.response?.status === 429) {
      errorMessage = 'Rate limit exceeded - too many requests. Please wait a moment and try again.';
    } else if (e.code === 'ENOTFOUND' || e.code === 'ECONNREFUSED') {
      errorMessage = 'Unable to connect to external services. Please check your internet connection.';
    }
    
    res.status(500).json({ 
      success: false, 
      message: errorMessage, 
      error: e.message 
    });
  }
});

// Start server
const PORT = process.env.PORT || 8001;
app.listen(PORT, () => {
  console.log(`ArogyaMitra API (Node.js) running on port ${PORT}`);
});

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [currentView, setCurrentView] = useState('landing');
  const [user, setUser] = useState(null);
  const [formData, setFormData] = useState({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [diagnosis, setDiagnosis] = useState(null);
  const [userReports, setUserReports] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [facilityAddress, setFacilityAddress] = useState('');
  const [facilitySearchLoading, setFacilitySearchLoading] = useState(false);
  const [useLocationLoading, setUseLocationLoading] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [selectedFacility, setSelectedFacility] = useState(null);
  const [directionsFullScreen, setDirectionsFullScreen] = useState(false);

  const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

  useEffect(() => {
    // Check if user is logged in
    const savedUser = localStorage.getItem('arogyamitra_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
      setCurrentView('dashboard');
    }
  }, []);

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const response = await axios.post(`${backendUrl}/api/register`, formData);
      if (response.data.success) {
        setMessage('Registration successful! You can now login.');
        setCurrentView('login');
        setFormData({});
      }
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const response = await axios.post(`${backendUrl}/api/login`, formData);
      if (response.data.success) {
        const userData = response.data;
        setUser(userData);
        localStorage.setItem('arogyamitra_user', JSON.stringify(userData));
        setCurrentView('dashboard');
        setFormData({});
      }
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSymptomAssessment = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const assessmentData = {
        user_id: user.user_id,
        symptoms: formData.symptoms,
        age: formData.age ? parseInt(formData.age) : null,
        gender: formData.gender,
        height: formData.height ? parseInt(formData.height) : null,
        weight: formData.weight ? parseFloat(formData.weight) : null,
        preExistingConditions: formData.preExistingConditions,
        currentMedications: formData.currentMedications,
        additional_info: formData.additional_info
      };

      const response = await axios.post(`${backendUrl}/api/assess-symptoms`, assessmentData, {
        headers: {
          'Authorization': `Bearer ${user.token}`
        }
      });
      console.log('Assessment API response:', response);
      if (response.data.success) {
        setDiagnosis(response.data);
        setCurrentView('diagnosis-result');
        setFormData({});
      }
    } catch (error) {
      console.error('Assessment API error:', error, error.response);
      setMessage(error.response?.data?.detail || 'Assessment failed');
    } finally {
      setLoading(false);
    }
  };

  const fetchUserReports = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${backendUrl}/api/user-reports/${user.user_id}`, {
        headers: {
          'Authorization': `Bearer ${user.token}`
        }
      });
      if (response.data.success) {
        setUserReports(response.data.reports);
        setCurrentView('reports');
      }
    } catch (error) {
      setMessage('Failed to fetch reports');
    } finally {
      setLoading(false);
    }
  };

  const fetchNearbyFacilities = async (addressOrCoords) => {
    setFacilitySearchLoading(true);
    setMessage('');
    let url;
    
    if (typeof addressOrCoords === 'string') {
      // For manual address input, we need to geocode it first
      try {
        // Geocode the address to get coordinates
        const geoResponse = await axios.get(`https://nominatim.openstreetmap.org/search`, {
          params: {
            q: addressOrCoords,
            format: 'json',
            limit: 1
          },
          headers: { 'User-Agent': 'ArogyaMitra/1.0' }
        });
        
        if (geoResponse.data && geoResponse.data.length > 0) {
          const coords = geoResponse.data[0];
          const lat = parseFloat(coords.lat);
          const lon = parseFloat(coords.lon);
          
          // Set user location with geocoded coordinates
          setUserLocation({ lat, lon });
          
          // Use coordinates for facility search
          url = `${backendUrl}/api/nearby-facilities?latitude=${lat}&longitude=${lon}`;
        } else {
          setMessage('Could not find coordinates for this address');
          setFacilitySearchLoading(false);
          return;
        }
      } catch (error) {
        setMessage('Failed to geocode address');
        setFacilitySearchLoading(false);
        return;
      }
    } else if (addressOrCoords && addressOrCoords.lat && addressOrCoords.lon) {
      url = `${backendUrl}/api/nearby-facilities?latitude=${addressOrCoords.lat}&longitude=${addressOrCoords.lon}`;
      setUserLocation({ lat: addressOrCoords.lat, lon: addressOrCoords.lon });
    } else {
      setMessage('Invalid location');
      setFacilitySearchLoading(false);
      return;
    }
    
    try {
      const response = await axios.get(url);
      if (response.data.success) {
        setFacilities(response.data.facilities);
        setCurrentView('facilities');
      }
    } catch (error) {
      setMessage('Failed to fetch facilities');
    } finally {
      setFacilitySearchLoading(false);
    }
  };

  // Helper to generate OpenRouteService (OSM) directions URL (for iframe)
  const getDirectionsUrl = (facility) => {
    if (!facility.lat || !facility.lon) return null;
    const dest = `${facility.lat},${facility.lon}`;
    if (userLocation && userLocation.lat && userLocation.lon) {
      const origin = `${userLocation.lat},${userLocation.lon}`;
      // OpenRouteService directions with both origin and destination
      return `https://maps.openrouteservice.org/directions?n1=${userLocation.lat}&n2=${userLocation.lon}&n3=14&a=${userLocation.lat},${userLocation.lon},${facility.lat},${facility.lon}&b=0&c=0&k1=en-US&k2=km`;
    }
    // Only destination (shows marker)
    return `https://maps.openrouteservice.org/directions?a=${facility.lat},${facility.lon}&b=0&c=0&k1=en-US&k2=km`;
  };

  // Helper to generate a fallback URL (destination only) if routing fails
  const getFallbackDirectionsUrl = (facility) => {
    if (!facility.lat || !facility.lon) return null;
    return `https://maps.openrouteservice.org/directions?a=${facility.lat},${facility.lon}&b=0&c=0&k1=en-US&k2=km`;
  };

  // Handler for Get Directions button
  const handleGetDirections = (facility) => {
    setSelectedFacility(facility);
    setCurrentView('directions');
    setDirectionsFullScreen(false);
  };

  const handleUseMyLocation = () => {
    setUseLocationLoading(true);
    setMessage('');
    if (!navigator.geolocation) {
      setMessage('Geolocation is not supported by your browser.');
      setUseLocationLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        fetchNearbyFacilities({ lat: position.coords.latitude, lon: position.coords.longitude });
        setUseLocationLoading(false);
      },
      (error) => {
        setMessage('Unable to retrieve your location.');
        setUseLocationLoading(false);
      }
    );
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('arogyamitra_user');
    setCurrentView('landing');
    setFormData({});
    setMessage('');
  };

  const renderLandingPage = () => (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-white">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-teal-100">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-teal-500 rounded-lg flex items-center justify-center">
              <span className="text-white text-xl font-bold">A</span>
            </div>
            <h1 className="text-2xl font-bold text-teal-700">ArogyaMitra</h1>
          </div>
          <div className="space-x-4">
            <button
              onClick={() => setCurrentView('login')}
              className="px-4 py-2 text-teal-600 hover:text-teal-700 font-medium"
            >
              Login
            </button>
            <button
              onClick={() => setCurrentView('register')}
              className="px-6 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 font-medium"
            >
              Get Started
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-6xl mx-auto px-4 py-16 text-center">
        <h2 className="text-5xl font-bold text-gray-800 mb-6">
          Bridging the Gap Between You and 
          <span className="text-teal-600"> Timely Healthcare</span>
        </h2>
        <p className="text-xl text-gray-600 mb-12 max-w-3xl mx-auto">
          In rural communities, access to doctors and early diagnosis can be challenging. 
          ArogyaMitra is here to change that with AI-powered health assistance.
        </p>
        
        <button
          onClick={() => setCurrentView('register')}
          className="px-8 py-4 bg-teal-500 text-white text-lg font-semibold rounded-xl hover:bg-teal-600 transform hover:scale-105 transition-all shadow-lg"
        >
          Get Started Now
        </button>
      </section>

      {/* Features Grid */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <h3 className="text-3xl font-bold text-center text-gray-800 mb-12">
          How ArogyaMitra Helps You
        </h3>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {/* Feature 1 */}
          <div className="bg-white rounded-xl p-8 shadow-lg border border-teal-100 hover:shadow-xl transition-shadow">
            <div className="w-16 h-16 bg-teal-100 rounded-lg flex items-center justify-center mb-6">
              <span className="text-3xl">🩺</span>
            </div>
            <h4 className="text-xl font-bold text-gray-800 mb-4">AI Health Assessment</h4>
            <p className="text-gray-600">
              Check your health symptoms in a few simple steps with our AI-powered diagnostic assistant.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="bg-white rounded-xl p-8 shadow-lg border border-teal-100 hover:shadow-xl transition-shadow">
            <div className="w-16 h-16 bg-teal-100 rounded-lg flex items-center justify-center mb-6">
              <span className="text-3xl">📊</span>
            </div>
            <h4 className="text-xl font-bold text-gray-800 mb-4">Instant Health Reports</h4>
            <p className="text-gray-600">
              Get a preliminary health report instantly with personalized recommendations and guidance.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="bg-white rounded-xl p-8 shadow-lg border border-teal-100 hover:shadow-xl transition-shadow">
            <div className="w-16 h-16 bg-teal-100 rounded-lg flex items-center justify-center mb-6">
              <span className="text-3xl">🏥</span>
            </div>
            <h4 className="text-xl font-bold text-gray-800 mb-4">Find Nearby Facilities</h4>
            <p className="text-gray-600">
              Locate nearby doctors, hospitals, and health centers in urban areas when you need specialized care.
            </p>
          </div>

          {/* Feature 4 */}
          <div className="bg-white rounded-xl p-8 shadow-lg border border-teal-100 hover:shadow-xl transition-shadow">
            <div className="w-16 h-16 bg-teal-100 rounded-lg flex items-center justify-center mb-6">
              <span className="text-3xl">🌍</span>
            </div>
            <h4 className="text-xl font-bold text-gray-800 mb-4">Multilingual Support</h4>
            <p className="text-gray-600">
              Access healthcare guidance in your preferred language - making health information accessible to all.
            </p>
          </div>

          {/* Feature 5 */}
          <div className="bg-white rounded-xl p-8 shadow-lg border border-teal-100 hover:shadow-xl transition-shadow">
            <div className="w-16 h-16 bg-teal-100 rounded-lg flex items-center justify-center mb-6">
              <span className="text-3xl">📱</span>
            </div>
            <h4 className="text-xl font-bold text-gray-800 mb-4">Mobile Accessible</h4>
            <p className="text-gray-600">
              Designed to work seamlessly on basic mobile devices, ensuring broad reach in rural areas.
            </p>
          </div>

          {/* Feature 6 */}
          <div className="bg-white rounded-xl p-8 shadow-lg border border-teal-100 hover:shadow-xl transition-shadow">
            <div className="w-16 h-16 bg-teal-100 rounded-lg flex items-center justify-center mb-6">
              <span className="text-3xl">⚡</span>
            </div>
            <h4 className="text-xl font-bold text-gray-800 mb-4">Quick & Reliable</h4>
            <p className="text-gray-600">
              Get fast, reliable health guidance when you need it most, helping you make informed decisions.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-teal-500 py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h3 className="text-3xl font-bold text-white mb-6">
            Ready to Take Control of Your Health?
          </h3>
          <p className="text-xl text-teal-100 mb-8">
            Join thousands of users who trust ArogyaMitra for their healthcare needs.
          </p>
          <button
            onClick={() => setCurrentView('register')}
            className="px-8 py-4 bg-white text-teal-600 text-lg font-semibold rounded-xl hover:bg-gray-50 transform hover:scale-105 transition-all shadow-lg"
          >
            Start Your Health Journey
          </button>
        </div>
      </section>
    </div>
  );

  const renderAuthForm = (isLogin) => (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-white flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-teal-500 rounded-lg flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-2xl font-bold">A</span>
          </div>
          <h2 className="text-2xl font-bold text-gray-800">
            {isLogin ? 'Welcome Back' : 'Join ArogyaMitra'}
          </h2>
          <p className="text-gray-600 mt-2">
            {isLogin ? 'Sign in to your account' : 'Create your account to get started'}
          </p>
        </div>

        <form onSubmit={isLogin ? handleLogin : handleRegister} className="space-y-6">
          {!isLogin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
              <input
                type="text"
                name="name"
                value={formData.name || ''}
                onChange={handleInputChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                required={!isLogin}
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
            <input
              type="email"
              name="email"
              value={formData.email || ''}
              onChange={handleInputChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
            <input
              type="password"
              name="password"
              value={formData.password || ''}
              onChange={handleInputChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              required
            />
          </div>

          {!isLogin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number (Optional)</label>
              <input
                type="text"
                name="phone"
                value={formData.phone || ''}
                onChange={handleInputChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>
          )}

          {message && (
            <div className={`p-3 rounded-lg text-sm ${message.includes('successful') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-teal-500 text-white rounded-lg hover:bg-teal-600 font-medium disabled:opacity-50"
          >
            {loading ? 'Please wait...' : (isLogin ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => {
              setCurrentView(isLogin ? 'register' : 'login');
              setMessage('');
              setFormData({});
            }}
            className="text-teal-600 hover:text-teal-700 font-medium"
          >
            {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </div>

        <div className="mt-4 text-center">
          <button
            onClick={() => setCurrentView('landing')}
            className="text-gray-500 hover:text-gray-700"
          >
            ← Back to Home
          </button>
        </div>
      </div>
    </div>
  );

  const renderDashboard = () => (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-teal-500 rounded-lg flex items-center justify-center">
              <span className="text-white text-xl font-bold">A</span>
            </div>
            <h1 className="text-xl font-bold text-teal-700">ArogyaMitra</h1>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-gray-600">Welcome, {user?.name}</span>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-800 mb-2">Your Health Dashboard</h2>
          <p className="text-gray-600">Manage your health with AI-powered assistance</p>
        </div>

        {/* Dashboard Actions */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <div
            onClick={() => setCurrentView('symptom-assessment')}
            className="bg-white rounded-xl p-6 shadow-lg border border-gray-200 hover:shadow-xl transition-shadow cursor-pointer"
          >
            <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center mb-4">
              <span className="text-2xl">🩺</span>
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">New Health Assessment</h3>
            <p className="text-gray-600">Describe your symptoms and get AI-powered health guidance</p>
          </div>

          <div
            onClick={fetchUserReports}
            className="bg-white rounded-xl p-6 shadow-lg border border-gray-200 hover:shadow-xl transition-shadow cursor-pointer"
          >
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
              <span className="text-2xl">📊</span>
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">My Health Reports</h3>
            <p className="text-gray-600">View your previous assessments and recommendations</p>
          </div>

          <div
            onClick={() => setCurrentView('facilities')}
            className="bg-white rounded-xl p-6 shadow-lg border border-gray-200 hover:shadow-xl transition-shadow cursor-pointer"
          >
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
              <span className="text-2xl">🏥</span>
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">Find Healthcare Facilities</h3>
            <p className="text-gray-600">Locate nearby hospitals and clinics in urban centers</p>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-xl p-6 shadow-lg">
          <h3 className="text-xl font-bold text-gray-800 mb-4">Getting Started</h3>
          <div className="space-y-3">
            <div className="flex items-center space-x-3 p-3 bg-teal-50 rounded-lg">
              <span className="text-teal-600">✓</span>
              <span className="text-gray-700">Account created successfully</span>
            </div>
            <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
              <span className="text-gray-400">○</span>
              <span className="text-gray-600">Complete your first health assessment</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderSymptomAssessment = () => (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-teal-700">Health Assessment</h1>
          <button
            onClick={() => setCurrentView('dashboard')}
            className="text-gray-600 hover:text-gray-800"
          >
            ← Back to Dashboard
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-xl p-8 shadow-lg">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">Describe Your Symptoms</h2>
          
          <form onSubmit={handleSymptomAssessment} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                What symptoms are you experiencing? *
              </label>
              <textarea
                name="symptoms"
                value={formData.symptoms || ''}
                onChange={handleInputChange}
                rows={4}
                placeholder="Please describe your symptoms in detail..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                required
              />
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Age</label>
                <input
                  type="number"
                  name="age"
                  value={formData.age || ''}
                  onChange={handleInputChange}
                  placeholder="Enter your age"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Gender</label>
                <select
                  name="gender"
                  value={formData.gender || ''}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                >
                  <option value="">Select Gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Height (cm)</label>
                <input
                  type="number"
                  name="height"
                  value={formData.height || ''}
                  onChange={handleInputChange}
                  placeholder="Enter height in cm"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Weight (kg)</label>
                <input
                  type="number"
                  name="weight"
                  value={formData.weight || ''}
                  onChange={handleInputChange}
                  placeholder="Enter weight in kg"
                  step="0.1"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Pre-existing Health Conditions (Optional)
              </label>
              <textarea
                name="preExistingConditions"
                value={formData.preExistingConditions || ''}
                onChange={handleInputChange}
                rows={2}
                placeholder="e.g., Diabetes, Hypertension, Asthma, etc. (Leave empty if none)"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Current Medications (Optional)
              </label>
              <textarea
                name="currentMedications"
                value={formData.currentMedications || ''}
                onChange={handleInputChange}
                rows={2}
                placeholder="e.g., Metformin 500mg twice daily, Amlodipine 5mg once daily, etc. (Leave empty if none)"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Additional Information (Optional)
              </label>
              <textarea
                name="additional_info"
                value={formData.additional_info || ''}
                onChange={handleInputChange}
                rows={3}
                placeholder="Any additional medical history, current medications, or other relevant information..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>

            {message && (
              <div className="p-3 rounded-lg text-sm bg-red-100 text-red-700">
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-teal-500 text-white rounded-lg hover:bg-teal-600 font-medium disabled:opacity-50"
            >
              {loading ? 'Analyzing Symptoms...' : 'Get AI Health Assessment'}
            </button>
          </form>

          <div className="mt-6 p-4 bg-yellow-50 rounded-lg">
            <p className="text-sm text-yellow-800">
              <strong>Disclaimer:</strong> This is a preliminary assessment tool and should not replace professional medical advice. 
              Always consult with a qualified healthcare provider for proper diagnosis and treatment.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderDiagnosisResult = () => (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-teal-700">Health Assessment Result</h1>
          <button
            onClick={() => setCurrentView('dashboard')}
            className="text-gray-600 hover:text-gray-800"
          >
            ← Back to Dashboard
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-xl p-8 shadow-lg mb-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-800">Your Health Assessment</h2>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              diagnosis?.urgency_level === 'High' ? 'bg-red-100 text-red-700' :
              diagnosis?.urgency_level === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
              'bg-green-100 text-green-700'
            }`}>
              {diagnosis?.urgency_level} Priority
            </span>
          </div>

          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-3">AI-Generated Assessment</h3>
              <div className="bg-gray-50 rounded-lg p-4">
                <pre className="whitespace-pre-wrap text-gray-700 font-sans">
                  {diagnosis?.preliminary_diagnosis}
                </pre>
              </div>
            </div>

            {diagnosis?.patient_data && (
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-3">Patient Information Used</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  {diagnosis.patient_data.age && (
                    <div className="bg-green-50 rounded-lg p-3">
                      <h4 className="font-medium text-green-800 text-sm">Age</h4>
                      <p className="text-green-700">{diagnosis.patient_data.age} years</p>
                    </div>
                  )}
                  {diagnosis.patient_data.gender && (
                    <div className="bg-green-50 rounded-lg p-3">
                      <h4 className="font-medium text-green-800 text-sm">Gender</h4>
                      <p className="text-green-700 capitalize">{diagnosis.patient_data.gender}</p>
                    </div>
                  )}
                  {diagnosis.patient_data.height && (
                    <div className="bg-green-50 rounded-lg p-3">
                      <h4 className="font-medium text-green-800 text-sm">Height</h4>
                      <p className="text-green-700">{diagnosis.patient_data.height} cm</p>
                    </div>
                  )}
                  {diagnosis.patient_data.weight && (
                    <div className="bg-green-50 rounded-lg p-3">
                      <h4 className="font-medium text-green-800 text-sm">Weight</h4>
                      <p className="text-green-700">{diagnosis.patient_data.weight} kg</p>
                    </div>
                  )}
                  {diagnosis.patient_data.preExistingConditions && (
                    <div className="bg-green-50 rounded-lg p-3 md:col-span-2">
                      <h4 className="font-medium text-green-800 text-sm">Pre-existing Conditions</h4>
                      <p className="text-green-700">{diagnosis.patient_data.preExistingConditions}</p>
                    </div>
                  )}
                  {diagnosis.patient_data.currentMedications && (
                    <div className="bg-green-50 rounded-lg p-3 md:col-span-2">
                      <h4 className="font-medium text-green-800 text-sm">Current Medications</h4>
                      <p className="text-green-700">{diagnosis.patient_data.currentMedications}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-teal-50 rounded-lg p-4">
                <h4 className="font-semibold text-teal-800 mb-2">Report ID</h4>
                <p className="text-sm text-teal-700">{diagnosis?.report_id}</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-4">
                <h4 className="font-semibold text-blue-800 mb-2">Generated On</h4>
                <p className="text-sm text-blue-700">
                  {new Date(diagnosis?.created_at).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <button
            onClick={() => setCurrentView('symptom-assessment')}
            className="bg-teal-500 text-white p-4 rounded-lg hover:bg-teal-600 font-medium"
          >
            New Assessment
          </button>
          <button
            onClick={() => setCurrentView('facilities')}
            className="bg-blue-500 text-white p-4 rounded-lg hover:bg-blue-600 font-medium"
          >
            Find Healthcare Facilities
          </button>
        </div>

        <div className="mt-6 p-4 bg-red-50 rounded-lg">
          <p className="text-sm text-red-800">
            <strong>Important:</strong> This assessment is for informational purposes only. 
            If you're experiencing severe symptoms or this is a medical emergency, please contact emergency services or visit the nearest hospital immediately.
          </p>
        </div>
      </div>
    </div>
  );

  const renderReports = () => (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-teal-700">My Health Reports</h1>
          <button
            onClick={() => setCurrentView('dashboard')}
            className="text-gray-600 hover:text-gray-800"
          >
            ← Back to Dashboard
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {userReports.length > 0 ? (
          <div className="space-y-6">
            {userReports.map((report, index) => (
              <div key={report.report_id} className="bg-white rounded-xl p-6 shadow-lg">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-lg font-semibold text-gray-800">
                    Report #{index + 1}
                  </h3>
                  <span className="text-sm text-gray-500">
                    {new Date(report.created_at).toLocaleDateString()}
                  </span>
                </div>
                
                <div className="mb-4">
                  <h4 className="font-medium text-gray-700 mb-2">Symptoms Reported:</h4>
                  <p className="text-gray-600 bg-gray-50 p-3 rounded-lg">{report.symptoms}</p>
                </div>

                {(report.age || report.gender || report.height || report.weight || report.preExistingConditions || report.currentMedications) && (
                  <div className="mb-4">
                    <h4 className="font-medium text-gray-700 mb-2">Patient Information:</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 bg-gray-50 p-3 rounded-lg">
                      {report.age && (
                        <div>
                          <span className="text-sm font-medium text-gray-600">Age:</span>
                          <span className="ml-2 text-gray-800">{report.age} years</span>
                        </div>
                      )}
                      {report.gender && (
                        <div>
                          <span className="text-sm font-medium text-gray-600">Gender:</span>
                          <span className="ml-2 text-gray-800 capitalize">{report.gender}</span>
                        </div>
                      )}
                      {report.height && (
                        <div>
                          <span className="text-sm font-medium text-gray-600">Height:</span>
                          <span className="ml-2 text-gray-800">{report.height} cm</span>
                        </div>
                      )}
                      {report.weight && (
                        <div>
                          <span className="text-sm font-medium text-gray-600">Weight:</span>
                          <span className="ml-2 text-gray-800">{report.weight} kg</span>
                        </div>
                      )}
                      {report.preExistingConditions && (
                        <div className="col-span-2 md:col-span-3">
                          <span className="text-sm font-medium text-gray-600">Pre-existing Conditions:</span>
                          <span className="ml-2 text-gray-800">{report.preExistingConditions}</span>
                        </div>
                      )}
                      {report.currentMedications && (
                        <div className="col-span-2 md:col-span-3">
                          <span className="text-sm font-medium text-gray-600">Current Medications:</span>
                          <span className="ml-2 text-gray-800">{report.currentMedications}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="font-medium text-gray-700 mb-2">Assessment:</h4>
                  <div className="text-gray-600 bg-gray-50 p-3 rounded-lg">
                    <pre className="whitespace-pre-wrap font-sans text-sm">
                      {report.preliminary_diagnosis}
                    </pre>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">📊</span>
            </div>
            <h3 className="text-xl font-semibold text-gray-800 mb-2">No Reports Yet</h3>
            <p className="text-gray-600 mb-6">You haven't completed any health assessments yet.</p>
            <button
              onClick={() => setCurrentView('symptom-assessment')}
              className="px-6 py-3 bg-teal-500 text-white rounded-lg hover:bg-teal-600 font-medium"
            >
              Start Your First Assessment
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const renderFacilities = () => (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-teal-700">Nearby Healthcare Facilities</h1>
          <button
            onClick={() => setCurrentView('dashboard')}
            className="text-gray-600 hover:text-gray-800"
          >
            ← Back to Dashboard
          </button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8">
        <form
          onSubmit={e => {
            e.preventDefault();
            if (facilityAddress.trim()) fetchNearbyFacilities(facilityAddress);
          }}
          className="mb-8 bg-white p-6 rounded-xl shadow-lg"
        >
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Enter your detailed address to find nearby medical facilities:
          </label>
          <input
            type="text"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 mb-4"
            placeholder="e.g. 123 Main Street, Village Name, District, State, Country"
            value={facilityAddress}
            onChange={e => setFacilityAddress(e.target.value)}
            required
          />
          <div className="flex gap-2 mb-4">
            <button
              type="submit"
              className="flex-1 py-3 bg-teal-500 text-white rounded-lg hover:bg-teal-600 font-medium disabled:opacity-50"
              disabled={facilitySearchLoading}
            >
              {facilitySearchLoading ? 'Searching...' : 'Find Facilities'}
            </button>
            <button
              type="button"
              className="flex-1 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium disabled:opacity-50"
              onClick={handleUseMyLocation}
              disabled={useLocationLoading}
            >
              {useLocationLoading ? 'Locating...' : 'Use My Location'}
            </button>
          </div>
        </form>

        {message && (
          <div className="p-3 rounded-lg text-sm bg-red-100 text-red-700 mb-4">
            {message}
          </div>
        )}
      </div>

      <div className="max-w-6xl mx-auto px-4 pb-8">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {facilities.map((facility, index) => (
            <div key={index} className="bg-white rounded-xl p-6 shadow-lg">
              <div className="flex items-start justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-800">{facility.name}</h3>
                <span className="bg-teal-100 text-teal-700 px-2 py-1 rounded text-sm">
                  {facility.distance}
                </span>
              </div>
              
              <div className="space-y-3">
                <div>
                  <span className="text-sm font-medium text-gray-600">Type:</span>
                  <span className="ml-2 text-gray-800">{facility.type}</span>
                </div>
                
                <div>
                  <span className="text-sm font-medium text-gray-600">Address:</span>
                  <p className="text-gray-800 text-sm mt-1">{facility.address}</p>
                </div>
                
                <div>
                  <span className="text-sm font-medium text-gray-600">Phone:</span>
                  <span className="ml-2 text-gray-800">{facility.phone}</span>
                </div>
                
                <div>
                  <span className="text-sm font-medium text-gray-600">Specialties:</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {facility.specialties.map((specialty, idx) => (
                      <span key={idx} className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs">
                        {specialty}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              
              <div className="mt-4 flex space-x-2">
                <button className="flex-1 bg-teal-500 text-white px-4 py-2 rounded-lg hover:bg-teal-600 text-sm">
                  Call Now
                </button>
                <button
                  className="flex-1 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 text-sm"
                  onClick={() => handleGetDirections(facility)}
                  disabled={!facility.lat || !facility.lon}
                  style={{ opacity: facility.lat && facility.lon ? 1 : 0.5 }}
                >
                  Get Directions
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // Directions page
  const renderDirections = () => {
    if (!selectedFacility) return null;
    const mapUrl = getDirectionsUrl(selectedFacility);
    const fallbackUrl = getFallbackDirectionsUrl(selectedFacility);
    
    return (
      <div className={`min-h-screen bg-gray-50 ${directionsFullScreen ? 'fixed inset-0 z-50 bg-black' : ''}`} style={{ transition: 'all 0.3s' }}>
        <header className={`bg-white shadow-sm border-b ${directionsFullScreen ? 'hidden' : ''}`}>
          <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
            <h1 className="text-xl font-bold text-teal-700">Directions to Facility</h1>
            <button
              onClick={() => setCurrentView('facilities')}
              className="text-gray-600 hover:text-gray-800"
            >
              ← Back to Facilities
            </button>
          </div>
        </header>
        <div className={`flex flex-col items-center justify-center ${directionsFullScreen ? 'h-screen' : 'min-h-[70vh]'} w-full`}>
          <div className={`w-full ${directionsFullScreen ? 'h-full' : 'max-w-5xl h-[70vh]'} relative`}>
            {mapUrl ? (
              <iframe
                title="Directions Map"
                src={mapUrl}
                width="100%"
                height={directionsFullScreen ? '100%' : '100%'}
                style={{ border: 0, minHeight: directionsFullScreen ? '100vh' : '60vh', borderRadius: directionsFullScreen ? 0 : 16 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            ) : (
              <div className="text-center text-gray-600 py-12">Unable to load map directions.</div>
            )}
            <button
              onClick={() => setDirectionsFullScreen(f => !f)}
              className={`absolute top-4 right-4 px-4 py-2 rounded-lg font-medium shadow-lg ${directionsFullScreen ? 'bg-white text-teal-700' : 'bg-teal-500 text-white'} hover:bg-teal-600`}
              style={{ zIndex: 10 }}
            >
              {directionsFullScreen ? 'Exit Full Screen' : 'Full Screen'}
            </button>
          </div>
          {!directionsFullScreen && (
            <div className="max-w-4xl w-full bg-white rounded-xl shadow-lg p-6 mt-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-2">{selectedFacility.name}</h2>
              <div className="mb-2 text-gray-700">{selectedFacility.address}</div>
              <div className="mb-2 text-gray-700">Type: {selectedFacility.type}</div>
              {selectedFacility.distance && <div className="mb-2 text-gray-700">Distance: {selectedFacility.distance}</div>}
              {selectedFacility.specialties && selectedFacility.specialties.length > 0 && (
                <div className="mb-2 text-gray-700">Specialties: {selectedFacility.specialties.join(', ')}</div>
              )}
              
              {/* Show facility location info and troubleshooting */}
              <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                <h3 className="font-semibold text-blue-800 mb-2">Facility Location</h3>
                <p className="text-sm text-blue-700 mb-2">
                  <strong>Coordinates:</strong> {selectedFacility.lat}, {selectedFacility.lon}
                </p>
                {userLocation && (
                  <p className="text-sm text-blue-700 mb-2">
                    <strong>Your Location:</strong> {userLocation.lat}, {userLocation.lon}
                  </p>
                )}
                <p className="text-sm text-blue-700">
                  <strong>Distance:</strong> {selectedFacility.distance}
                </p>
              </div>
              
              {/* Troubleshooting for routing errors */}
              <div className="mt-4 p-4 bg-yellow-50 rounded-lg">
                <p className="text-sm text-yellow-800 mb-2">
                  <strong>If you see a routing error:</strong>
                </p>
                <ul className="text-sm text-yellow-700 list-disc list-inside space-y-1">
                  <li>Enter your exact address manually in the search bar above the map</li>
                  <li>Use a nearby landmark or intersection as your starting point</li>
                  <li>The facility location is marked on the map - you can navigate manually</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };


  // Main render logic
  return (
    <div className="App">
      {currentView === 'landing' && renderLandingPage()}
      {currentView === 'login' && renderAuthForm(true)}
      {currentView === 'register' && renderAuthForm(false)}
      {currentView === 'dashboard' && renderDashboard()}
      {currentView === 'symptom-assessment' && renderSymptomAssessment()}
      {currentView === 'diagnosis-result' && renderDiagnosisResult()}
      {currentView === 'reports' && renderReports()}
      {currentView === 'facilities' && renderFacilities()}
      {currentView === 'directions' && renderDirections()}
    </div>
  );
}

export default App;
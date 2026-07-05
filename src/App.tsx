import React, { useState, useEffect } from 'react';
import LandingPage from './components/LandingPage';
import AuthPage from './components/AuthPage';
import CandidateDashboard from './components/CandidateDashboard';
import RecruiterDashboard from './components/RecruiterDashboard';
import AdminDashboard from './components/AdminDashboard';
import AssessmentInterface from './components/AssessmentInterface';

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('talent_ai_token'));
  const [user, setUser] = useState<{ id: string; email: string; name: string; role: string } | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [loading, setLoading] = useState(false);

  // Active testing sandbox details
  const [activeAssessment, setActiveAssessment] = useState<{ applicationId: string; subType: 'coding' | 'hr' | 'technical' } | null>(null);

  const fetchCurrentUser = async (authToken: string) => {
    setLoading(true);
    try {
      const response = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
      } else {
        // Clear stale session
        localStorage.removeItem('talent_ai_token');
        setToken(null);
        setUser(null);
      }
    } catch (e) {
      console.error("Failed to connect with authentication nodes:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchCurrentUser(token);
    }
  }, [token]);

  const handleLoginSuccess = (newToken: string, loggedUser: { id: string; email: string; name: string; role: string }) => {
    localStorage.setItem('talent_ai_token', newToken);
    setToken(newToken);
    setUser(loggedUser);
    setShowAuth(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('talent_ai_token');
    setToken(null);
    setUser(null);
    setActiveAssessment(null);
    setShowAuth(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white font-sans">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin" />
          <h4 className="text-sm font-semibold text-slate-300">Synchronizing user sessions...</h4>
        </div>
      </div>
    );
  }

  // Render assessment testing sandbox
  if (activeAssessment && token) {
    return (
      <AssessmentInterface
        applicationId={activeAssessment.applicationId}
        subType={activeAssessment.subType}
        onBack={() => setActiveAssessment(null)}
      />
    );
  }

  // Render Role Workspaces if logged in
  if (user && token) {
    if (user.role === 'candidate') {
      return (
        <CandidateDashboard
          token={token}
          user={user}
          onLogout={handleLogout}
          onEnterAssessment={(applicationId, subType) => {
            setActiveAssessment({ applicationId, subType });
          }}
        />
      );
    } else if (user.role === 'recruiter') {
      return (
        <RecruiterDashboard
          token={token}
          user={user}
          onLogout={handleLogout}
        />
      );
    } else if (user.role === 'admin') {
      return (
        <AdminDashboard
          token={token}
          user={user}
          onLogout={handleLogout}
        />
      );
    }
  }

  // Fallback to landing/auth views
  if (showAuth) {
    return (
      <AuthPage
        onBack={() => setShowAuth(false)}
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }

  return (
    <LandingPage
      onGetStarted={() => setShowAuth(true)}
    />
  );
}

import React, { useState, useEffect } from 'react';
import './App.css';
import LoadingPage from './components/LoadingPage';
import Login from './components/Login';
import RoleModal from './components/RoleModal';
import TeacherDashboard from './components/TeacherDashboard';
import StudentDashboard from './components/StudentDashboard';
import MainApp from './components/MainApp';
import Toast from './components/Toast';
import ResetPassword from './components/ResetPassword';
import { AppProvider } from './context/AppContext';
import api from './utils/api';

function App() {
  const [currentScreen, setCurrentScreen] = useState('loading');
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('collabcode-token'));
  const [currentRoom, setCurrentRoom] = useState(null);
  const [toast, setToast] = useState({ show: false, message: '' });

  useEffect(() => {
    // Check if user was logged in
    const savedUser = localStorage.getItem('collabcode-user');
    const savedRole = localStorage.getItem('collabcode-role');
    const savedToken = localStorage.getItem('collabcode-token');
    const savedRoom = localStorage.getItem('collabcode-current-room');
    
    // Check for room in URL
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get('room');

    // ── Detect magic-link reset params ────────────────────────────────
    const resetToken = urlParams.get('reset_token');
    const resetEmail = urlParams.get('email');
    if (resetToken && resetEmail) {
      setCurrentScreen('reset-password');
      return;
    }
    // ─────────────────────────────────────────────────────────────────
    
    if (savedUser && savedRole && savedToken) {
      const parsedUser = JSON.parse(savedUser);
      setUser(parsedUser);
      setRole(savedRole);
      setToken(savedToken);

      if (roomFromUrl) {
        // Direct join if user is logged in
        handleJoinRoom({ roomId: roomFromUrl, name: 'Direct Session' });
      } else if (savedRoom) {
        setCurrentRoom(JSON.parse(savedRoom));
        setCurrentScreen('main-app');
      } else {
        setCurrentScreen(savedRole === 'teacher' ? 'teacher-dashboard' : 'student-dashboard');
      }
    } else {
      // If not logged in but has room in URL, we wait for login then redirect
      if (roomFromUrl) {
        localStorage.setItem('collabcode-pending-room', roomFromUrl);
      }
      
      const timer = setTimeout(() => {
        setCurrentScreen('login');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  const handleLogin = async (email, password) => {
    try {
      const data = await api.post('/auth/login', { email, password });
      setUser(data.user);
      setToken(data.token);
      localStorage.setItem('collabcode-user', JSON.stringify(data.user));
      localStorage.setItem('collabcode-token', data.token);
      
      const userRole = (data.user.role || 'student').toLowerCase();
      setRole(userRole);
      localStorage.setItem('collabcode-role', userRole);

      // Check for pending room join
      const pendingRoom = localStorage.getItem('collabcode-pending-room');
      if (pendingRoom) {
        localStorage.removeItem('collabcode-pending-room');
        handleJoinRoom({ roomId: pendingRoom, name: 'Direct Session' });
      } else {
        setCurrentScreen(userRole === 'teacher' ? 'teacher-dashboard' : 'student-dashboard');
      }

      showToast('Login successful!');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleSignup = async (username, email, password, role) => {
    try {
      const data = await api.post('/auth/signup', { username, email, password, role });
      setUser(data.user);
      setToken(data.token);
      const userRole = data.user.role.toLowerCase();
      setRole(userRole);
      localStorage.setItem('collabcode-user', JSON.stringify(data.user));
      localStorage.setItem('collabcode-token', data.token);
      localStorage.setItem('collabcode-role', userRole);
      
      setCurrentScreen(userRole === 'teacher' ? 'teacher-dashboard' : 'student-dashboard');
      showToast('Account created successfully!');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleRoleSelect = (selectedRole) => {
    setRole(selectedRole);
    localStorage.setItem('collabcode-role', selectedRole);
    setCurrentScreen(selectedRole === 'teacher' ? 'teacher-dashboard' : 'student-dashboard');
    showToast(`Welcome, ${selectedRole}!`);
  };

  const handleJoinRoom = (room) => {
    setCurrentRoom(room);
    localStorage.setItem('collabcode-current-room', JSON.stringify(room));
    setCurrentScreen('main-app');
  };

  const handleBackToRole = () => {
    setCurrentScreen('role');
  };

  const handleExitRoom = () => {
    setCurrentRoom(null);
    localStorage.removeItem('collabcode-current-room');
    
    // Defensive role check: Default to student-dashboard unless clearly a teacher
    const userRole = String(user?.role || role || '').toLowerCase();
    if (userRole === 'teacher' || userRole === 'host') {
      setCurrentScreen('teacher-dashboard');
    } else {
      setCurrentScreen('student-dashboard');
    }
  };

  const handleLogout = () => {
    setUser(null);
    setRole(null);
    setToken(null);
    setCurrentRoom(null);
    localStorage.removeItem('collabcode-user');
    localStorage.removeItem('collabcode-role');
    localStorage.removeItem('collabcode-token');
    localStorage.removeItem('collabcode-current-room');
    setCurrentScreen('login');
    showToast('Logged out successfully');
  };

  return (
    <AppProvider>
      <div className="app">
        {currentScreen === 'loading' && <LoadingPage />}

        {currentScreen === 'reset-password' && (
          <ResetPassword
            showToast={showToast}
            onDone={() => {
              // Clear the magic-link params from the URL, then go to login
              window.history.replaceState({}, document.title, window.location.pathname);
              setCurrentScreen('login');
            }}
          />
        )}

        {currentScreen === 'login' && (
          <Login onLogin={handleLogin} onSignup={handleSignup} showToast={showToast} />
        )}
        
        {currentScreen === 'role' && (
          <RoleModal 
            onSelectRole={handleRoleSelect} 
            showToast={showToast}
          />
        )}
        
        {currentScreen === 'teacher-dashboard' && (
          <TeacherDashboard 
            user={user}
            token={token}
            onJoinRoom={handleJoinRoom}
            onBack={handleBackToRole}
            onLogout={handleLogout}
            showToast={showToast}
          />
        )}
        
        {currentScreen === 'student-dashboard' && (
          <StudentDashboard 
            user={user}
            token={token}
            onJoinRoom={handleJoinRoom}
            onBack={handleBackToRole}
            onLogout={handleLogout}
            showToast={showToast}
          />
        )}
        
        {currentScreen === 'main-app' && (
          <MainApp 
            user={user}
            role={role}
            currentRoom={currentRoom}
            onLogout={handleLogout}
            onExitRoom={handleExitRoom}
            showToast={showToast}
          />
        )}
        
        <Toast show={toast.show} message={toast.message} type={toast.type} />
      </div>
    </AppProvider>
  );
}

export default App;

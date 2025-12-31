import React, { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import Login from './components/Login';
import SubscriptionManager from './components/SubscriptionManager';
import BookingTest from './components/BookingTest';
import './App.css';

const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY);

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(null);
  const [activeView, setActiveView] = useState('booking'); // 'booking' or 'subscription'

  useEffect(() => {
    if (token) {
      // Try to get user from localStorage first
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        try {
          setUser(JSON.parse(storedUser));
        } catch (e) {
          console.error('Invalid user data');
          handleLogout();
        }
      }
    }
  }, [token]);

  const handleLogin = (newToken, userData) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(userData));
    setToken(newToken);
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken('');
    setUser(null);
  };

  return (
    <div className="App">
      <div className="container">
        <header className="app-header">
          <h1>🔥 Active Circle - Booking & Subscription Test</h1>
          {user && (
            <div className="user-info">
              <span>
                👤 {user.email} ({user.role || user.grantRole || 'member'})
              </span>
              <div className="header-actions">
                {token && (
                  <div className="view-switcher">
                    <button
                      className={activeView === 'booking' ? 'active' : ''}
                      onClick={() => setActiveView('booking')}
                    >
                      Booking Test
                    </button>
                    <button
                      className={activeView === 'subscription' ? 'active' : ''}
                      onClick={() => setActiveView('subscription')}
                    >
                      Subscription
                    </button>
                  </div>
                )}
                <button onClick={handleLogout} className="btn-logout">
                  Logout
                </button>
              </div>
            </div>
          )}
        </header>

        {!token ? (
          <Login onLogin={handleLogin} />
        ) : activeView === 'booking' ? (
          <Elements stripe={stripePromise}>
            <BookingTest token={token} user={user} />
          </Elements>
        ) : (
          <Elements stripe={stripePromise}>
            <SubscriptionManager 
              token={token} 
              user={user} 
              onUserUpdate={(updatedUser) => {
                setUser(updatedUser);
                localStorage.setItem('user', JSON.stringify(updatedUser));
              }}
            />
          </Elements>
        )}
      </div>
    </div>
  );
}

export default App;

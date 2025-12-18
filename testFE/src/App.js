import React, { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import Login from './components/Login';
import SubscriptionManager from './components/SubscriptionManager';
import './App.css';

const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY);

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(null);

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
          <h1>🔥 Active Circle - Stripe Subscription Test</h1>
          {user && (
            <div className="user-info">
              <span>
                👤 {user.email} ({user.role})
              </span>
              <button onClick={handleLogout} className="btn-logout">
                Logout
              </button>
            </div>
          )}
        </header>

        {!token ? (
          <Login onLogin={handleLogin} />
        ) : (
          <Elements stripe={stripePromise}>
            <SubscriptionManager token={token} user={user} />
          </Elements>
        )}
      </div>
    </div>
  );
}

export default App;

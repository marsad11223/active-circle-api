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
      // Decode JWT to get user info (simple decode, not validation)
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUser(payload);
      } catch (e) {
        console.error('Invalid token');
        handleLogout();
      }
    }
  }, [token]);

  const handleLogin = (newToken) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
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
              <span>👤 {user.email} ({user.role})</span>
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


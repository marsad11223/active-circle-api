import React, { useState, useEffect } from 'react';
import axios from 'axios';
import CheckoutForm from './CheckoutForm';
import './SubscriptionManager.css';

const API_URL = process.env.REACT_APP_API_URL;

function SubscriptionManager({ token, user, onUserUpdate }) {
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [clientSecret, setClientSecret] = useState('');
  const [showCheckout, setShowCheckout] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [currentUser, setCurrentUser] = useState(user);

  const fetchSubscriptionStatus = async () => {
    try {
      const response = await axios.get(`${API_URL}/subscription/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSubscription(response.data);
    } catch (err) {
      setError('Failed to fetch subscription status');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscriptionStatus();
    setCurrentUser(user);
  }, [token, user]);

  const handleCreateSubscription = async () => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await axios.post(
        `${API_URL}/subscription/create`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      setClientSecret(response.data.clientSecret);
      setShowCheckout(true);

      // Show different message for members vs hosts
      if (currentUser.role === 'member') {
        setSuccess(
          '💳 Payment intent created! Complete payment to become a host. Your role will remain "member" until payment succeeds.',
        );
      } else {
        setSuccess('Subscription created! Please complete payment.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create subscription');
    } finally {
      setLoading(false);
    }
  };

  const fetchUserData = async () => {
    try {
      // Get user data using the user ID
      if (!currentUser?._id) {
        console.warn('No user ID available to fetch user data');
        return;
      }

      const response = await axios.get(`${API_URL}/users/${currentUser._id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const updatedUser = response.data;
      setCurrentUser(updatedUser);
      if (onUserUpdate) {
        onUserUpdate(updatedUser);
      }
      // Also update localStorage
      localStorage.setItem('user', JSON.stringify(updatedUser));
    } catch (err) {
      console.error('Failed to fetch user data:', err);
    }
  };

  const handleCancelSubscription = async () => {
    if (!window.confirm('Are you sure you want to cancel your subscription?')) {
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await axios.delete(`${API_URL}/subscription/cancel`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setSuccess(response.data.message);
      await fetchSubscriptionStatus();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to cancel subscription');
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentSuccess = async (paymentIntentId) => {
    setLoading(true);
    setError('');
    const wasMember = currentUser.role === 'member';
    setSuccess('Payment successful! Activating subscription...');

    try {
      // Call the confirm-payment endpoint to pay invoice and activate subscription
      const response = await axios.post(
        `${API_URL}/subscription/confirm-payment`,
        { paymentIntentId },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (wasMember) {
        setSuccess(
          '🎉 Payment successful! You are now a host! Your role has been upgraded.',
        );
      } else {
        setSuccess('🎉 Payment successful! Your subscription is now active.');
      }

      setShowCheckout(false);
      setClientSecret('');

      // Refresh subscription status and user data
      setTimeout(async () => {
        await fetchSubscriptionStatus();
        await fetchUserData();
      }, 1000);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          'Payment succeeded but failed to activate subscription. Please refresh the page.',
      );
      // Still close checkout and refresh status
      setShowCheckout(false);
      setTimeout(async () => {
        await fetchSubscriptionStatus();
        await fetchUserData();
      }, 2000);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !subscription) {
    return (
      <div className="content loading">Loading subscription status...</div>
    );
  }

  return (
    <div className="content">
      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      <div className="subscription-header">
        <h2>Subscription Management</h2>
        <div className="user-role-info">
          <p>
            <strong>Current Role:</strong>{' '}
            <span
              className={`role-badge role-${currentUser.role || currentUser.grantRole || 'member'}`}
            >
              {currentUser.role || currentUser.grantRole || 'member'}
            </span>
          </p>
          {currentUser.role === 'member' && (
            <div className="info-box">
              ℹ️ You are currently a <strong>member</strong>. Subscribe to
              become a <strong>host</strong>! Your role will only change to
              "host" after successful payment.
            </div>
          )}
        </div>
      </div>

      {subscription?.hasSubscription ? (
        <div className="subscription-details">
          <div className="info-box">
            <h3>
              Current Subscription
              <span className={`status-badge status-${subscription.status}`}>
                {subscription.status}
              </span>
            </h3>
            <div className="detail-row">
              <span className="label">Status:</span>
              <span className="value">{subscription.status}</span>
            </div>
            <div className="detail-row">
              <span className="label">Period Start:</span>
              <span className="value">
                {new Date(subscription.currentPeriodStart).toLocaleDateString()}
              </span>
            </div>
            <div className="detail-row">
              <span className="label">Period End:</span>
              <span className="value">
                {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
              </span>
            </div>
            <div className="detail-row">
              <span className="label">Next Billing:</span>
              <span className="value">
                {subscription.cancelAtPeriodEnd
                  ? '❌ Canceled (active until period end)'
                  : `£5.99 on ${new Date(
                      subscription.currentPeriodEnd,
                    ).toLocaleDateString()}`}
              </span>
            </div>
          </div>

          {subscription.status === 'active' &&
            !subscription.cancelAtPeriodEnd && (
              <button
                onClick={handleCancelSubscription}
                className="btn-danger"
                disabled={loading}
              >
                Cancel Subscription
              </button>
            )}
        </div>
      ) : (
        <div className="no-subscription">
          <div className="pricing-card">
            <h3>Host Monthly Subscription</h3>
            <div className="price">
              <span className="currency">£</span>
              <span className="amount">5.99</span>
              <span className="period">/month</span>
            </div>
            <ul className="features">
              <li>✓ Access to all host features</li>
              <li>✓ Create and manage events</li>
              <li>✓ Member management tools</li>
              <li>✓ Priority support</li>
              {currentUser.role === 'member' && (
                <li>✓ Upgrade from member to host</li>
              )}
            </ul>

            <button
              onClick={handleCreateSubscription}
              className="btn-primary"
              disabled={loading}
            >
              {loading
                ? 'Creating...'
                : currentUser.role === 'member'
                  ? 'Become a Host - Subscribe Now'
                  : 'Subscribe Now'}
            </button>

            {currentUser.role === 'member' && (
              <div
                className="info-box"
                style={{ marginTop: '15px', fontSize: '0.9em' }}
              >
                <strong>🧪 Test Flow:</strong> Click "Become a Host" to create a
                payment intent. Your role will remain "member" until payment
                succeeds. Try with:
                <ul style={{ marginTop: '8px', paddingLeft: '20px' }}>
                  <li>
                    <strong>Success card (4242...):</strong> Payment succeeds →
                    Role becomes "host"
                  </li>
                  <li>
                    <strong>Decline card (4000...0002):</strong> Payment fails →
                    Role stays "member"
                  </li>
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {showCheckout && clientSecret && (
        <div className="checkout-modal">
          <div className="checkout-content">
            <button
              className="close-button"
              onClick={() => {
                setShowCheckout(false);
                setClientSecret('');
              }}
            >
              ×
            </button>
            <h3>Complete Your Payment</h3>
            <CheckoutForm
              clientSecret={clientSecret}
              onSuccess={handlePaymentSuccess}
              onError={(msg) => {
                setError(msg);
                setShowCheckout(false);
              }}
            />
          </div>
        </div>
      )}

      <div className="test-cards-info">
        <h4>🧪 Test Card Numbers</h4>
        <div className="test-cards">
          <div className="test-card">
            <strong>Success:</strong> 4242 4242 4242 4242
          </div>
          <div className="test-card">
            <strong>Decline:</strong> 4000 0000 0000 0002
          </div>
          <div className="test-card">
            <strong>3D Secure:</strong> 4000 0025 0000 3155
          </div>
        </div>
        <p className="test-note">
          Use any future expiry date, any 3-digit CVC, and any postal code
        </p>
      </div>
    </div>
  );
}

export default SubscriptionManager;

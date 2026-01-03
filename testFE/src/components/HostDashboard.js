import React, { useState, useEffect } from 'react';
import { useStripe, useElements, CardNumberElement, CardExpiryElement, CardCvcElement } from '@stripe/react-stripe-js';
import axios from 'axios';
import './HostDashboard.css';

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: '16px',
      color: '#424770',
      '::placeholder': {
        color: '#aab7c4',
      },
    },
    invalid: {
      color: '#9e2146',
    },
  },
};

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';

function HostDashboard({ token, user }) {
  const stripe = useStripe();
  const elements = useElements();
  
  const [activeTab, setActiveTab] = useState('overview');
  const [earningsSummary, setEarningsSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [withdrawalRequests, setWithdrawalRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Payment method form state
  const [showAddCard, setShowAddCard] = useState(false);
  const [processingCard, setProcessingCard] = useState(false);
  const [cardError, setCardError] = useState('');
  
  // Withdrawal form state
  const [showWithdrawalForm, setShowWithdrawalForm] = useState(false);
  const [withdrawalAmount, setWithdrawalAmount] = useState('');

  useEffect(() => {
    if (token && user?.role === 'host') {
      loadDashboardData();
    }
  }, [token, user]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadEarningsSummary(),
        loadTransactions(),
        loadPaymentMethods(),
        loadWithdrawalRequests(),
      ]);
    } catch (err) {
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const loadEarningsSummary = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/payouts/host/earnings-summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setEarningsSummary(response.data);
    } catch (err) {
      console.error('Error loading earnings:', err);
    }
  };

  const loadTransactions = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/payouts/host/transactions?page=1&limit=20`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setTransactions(response.data.transactions || []);
    } catch (err) {
      console.error('Error loading transactions:', err);
    }
  };

  const loadPaymentMethods = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/payouts/host/payment-methods`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPaymentMethods(response.data || []);
    } catch (err) {
      console.error('Error loading payment methods:', err);
    }
  };

  const loadWithdrawalRequests = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/payouts/host/withdrawal-requests`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setWithdrawalRequests(response.data || []);
    } catch (err) {
      console.error('Error loading withdrawal requests:', err);
    }
  };

  const handleAddCard = async (event) => {
    event.preventDefault();
    
    if (!stripe || !elements) {
      setCardError('Stripe not loaded');
      return;
    }

    setProcessingCard(true);
    setCardError('');

    try {
      const cardElement = elements.getElement(CardNumberElement);
      
      // Create payment method
      const { error: stripeError, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
      });

      if (stripeError) {
        setCardError(stripeError.message);
        setProcessingCard(false);
        return;
      }

      // Send payment method to backend
      const response = await axios.post(
        `${API_BASE_URL}/payouts/host/payment-methods`,
        { paymentMethodId: paymentMethod.id },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setSuccess('Payment method added successfully!');
      setShowAddCard(false);
      await loadPaymentMethods();
      
      // Clear form
      elements.getElement(CardNumberElement).clear();
      elements.getElement(CardExpiryElement).clear();
      elements.getElement(CardCvcElement).clear();
    } catch (err) {
      setCardError(err.response?.data?.message || 'Failed to add payment method');
    } finally {
      setProcessingCard(false);
    }
  };

  const handleDeletePaymentMethod = async (paymentMethodId) => {
    if (!window.confirm('Are you sure you want to delete this payment method?')) {
      return;
    }

    try {
      await axios.delete(
        `${API_BASE_URL}/payouts/host/payment-methods/${paymentMethodId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSuccess('Payment method deleted successfully!');
      await loadPaymentMethods();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete payment method');
    }
  };

  const handleWithdrawalRequest = async (event) => {
    event.preventDefault();
    
    const amount = parseFloat(withdrawalAmount);
    if (!amount || amount <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    if (amount > (earningsSummary?.availableBalance || 0)) {
      setError('Insufficient balance');
      return;
    }

    try {
      await axios.post(
        `${API_BASE_URL}/payouts/host/withdrawal-request`,
        { amount },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSuccess('Withdrawal request submitted successfully!');
      setShowWithdrawalForm(false);
      setWithdrawalAmount('');
      await loadDashboardData();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit withdrawal request');
    }
  };

  if (user?.role !== 'host') {
    return (
      <div className="host-dashboard">
        <div className="error-message">
          ⚠️ This dashboard is only available for hosts.
        </div>
      </div>
    );
  }

  return (
    <div className="host-dashboard">
      <div className="dashboard-header">
        <h1>💰 Host Earnings & Payouts</h1>
        <p>Manage your earnings, payment methods, and withdrawal requests</p>
      </div>

      {error && (
        <div className="alert alert-error" onClick={() => setError('')}>
          ❌ {error}
        </div>
      )}

      {success && (
        <div className="alert alert-success" onClick={() => setSuccess('')}>
          ✅ {success}
        </div>
      )}

      <div className="dashboard-tabs">
        <button
          className={activeTab === 'overview' ? 'active' : ''}
          onClick={() => setActiveTab('overview')}
        >
          📊 Overview
        </button>
        <button
          className={activeTab === 'transactions' ? 'active' : ''}
          onClick={() => setActiveTab('transactions')}
        >
          📝 Transactions
        </button>
        <button
          className={activeTab === 'payouts' ? 'active' : ''}
          onClick={() => setActiveTab('payouts')}
        >
          💸 Payouts
        </button>
        <button
          className={activeTab === 'payment-methods' ? 'active' : ''}
          onClick={() => setActiveTab('payment-methods')}
        >
          💳 Payment Methods
        </button>
      </div>

      <div className="dashboard-content">
        {loading && <div className="loading">Loading...</div>}

        {activeTab === 'overview' && earningsSummary && (
          <div className="overview-section">
            <div className="earnings-cards">
              <div className="earnings-card">
                <div className="card-icon">💰</div>
                <div className="card-content">
                  <h3>Total Earnings</h3>
                  <p className="amount">£{earningsSummary.totalEarnings?.toFixed(2) || '0.00'}</p>
                  <span className="card-description">All time earnings from completed bookings</span>
                </div>
              </div>

              <div className="earnings-card">
                <div className="card-icon">⏳</div>
                <div className="card-content">
                  <h3>Pending Payouts</h3>
                  <p className="amount">£{earningsSummary.pendingPayouts?.toFixed(2) || '0.00'}</p>
                  <span className="card-description">Awaiting payout processing</span>
                </div>
              </div>

              <div className="earnings-card">
                <div className="card-icon">✅</div>
                <div className="card-content">
                  <h3>Total Paid Out</h3>
                  <p className="amount">£{earningsSummary.totalPaidOut?.toFixed(2) || '0.00'}</p>
                  <span className="card-description">Successfully paid out to your account</span>
                </div>
              </div>

              <div className="earnings-card highlight">
                <div className="card-icon">💵</div>
                <div className="card-content">
                  <h3>Available Balance</h3>
                  <p className="amount">£{earningsSummary.availableBalance?.toFixed(2) || '0.00'}</p>
                  <span className="card-description">Available for withdrawal</span>
                </div>
              </div>
            </div>

            {earningsSummary.availableBalance > 0 && (
              <div className="quick-actions">
                <button
                  className="btn-primary"
                  onClick={() => setShowWithdrawalForm(true)}
                  disabled={paymentMethods.length === 0}
                >
                  💸 Request Withdrawal
                </button>
                {paymentMethods.length === 0 && (
                  <p className="warning-text">
                    ⚠️ Please add a payment method first to request withdrawal
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'transactions' && (
          <div className="transactions-section">
            <h2>Transaction History</h2>
            {transactions.length === 0 ? (
              <p className="empty-state">No transactions yet</p>
            ) : (
              <div className="transactions-list">
                {transactions.map((transaction) => (
                  <div key={transaction._id} className="transaction-item">
                    <div className="transaction-info">
                      <h4>{transaction.activity?.title || 'Activity'}</h4>
                      <p>
                        {transaction.member?.name || 'Member'} •{' '}
                        {new Date(transaction.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="transaction-amount">
                      <p className="amount">£{transaction.earnings?.toFixed(2) || '0.00'}</p>
                      <span className={`status-badge ${transaction.paymentStatus}`}>
                        {transaction.paymentStatus}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'payouts' && (
          <div className="payouts-section">
            <div className="section-header">
              <h2>Withdrawal Requests</h2>
              {earningsSummary?.availableBalance > 0 && paymentMethods.length > 0 && (
                <button
                  className="btn-primary"
                  onClick={() => setShowWithdrawalForm(true)}
                >
                  + New Request
                </button>
              )}
            </div>

            {withdrawalRequests.length === 0 ? (
              <p className="empty-state">No withdrawal requests yet</p>
            ) : (
              <div className="withdrawal-requests-list">
                {withdrawalRequests.map((request) => (
                  <div key={request._id} className="withdrawal-request-item">
                    <div className="request-info">
                      <h4>£{request.requestedAmount?.toFixed(2)}</h4>
                      <p>
                        Status: <span className={`status-badge ${request.status}`}>{request.status}</span>
                      </p>
                      <p className="date">
                        Requested: {new Date(request.requestedAt).toLocaleDateString()}
                      </p>
                      {request.rejectionReason && (
                        <p className="rejection-reason">Reason: {request.rejectionReason}</p>
                      )}
                    </div>
                    {request.netAmount && (
                      <div className="request-amount">
                        <p>Net Amount: £{request.netAmount.toFixed(2)}</p>
                        {request.stripeFee && (
                          <p className="fee">Fee: £{request.stripeFee.toFixed(2)}</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'payment-methods' && (
          <div className="payment-methods-section">
            <div className="section-header">
              <h2>Payment Methods</h2>
              <button
                className="btn-primary"
                onClick={() => setShowAddCard(true)}
              >
                + Add Payment Method
              </button>
            </div>

            {paymentMethods.length === 0 ? (
              <p className="empty-state">No payment methods added yet</p>
            ) : (
              <div className="payment-methods-list">
                {paymentMethods.map((pm) => (
                  <div key={pm.stripePaymentMethodId} className="payment-method-item">
                    <div className="pm-info">
                      <div className="pm-icon">💳</div>
                      <div>
                        <h4>
                          {pm.brand || 'Card'} •••• {pm.last4 || '****'}
                          {pm.isDefault && <span className="default-badge">Default</span>}
                        </h4>
                        <p>{pm.type || 'card'}</p>
                      </div>
                    </div>
                    <button
                      className="btn-danger"
                      onClick={() => handleDeletePaymentMethod(pm.stripePaymentMethodId)}
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Card Modal */}
      {showAddCard && (
        <div className="modal-overlay" onClick={() => setShowAddCard(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Payment Method</h2>
              <button className="close-btn" onClick={() => setShowAddCard(false)}>×</button>
            </div>
            <form onSubmit={handleAddCard} className="add-card-form">
              {cardError && <div className="error">{cardError}</div>}
              
              <div className="form-group">
                <label>Card Number</label>
                <div className="card-element">
                  <CardNumberElement options={CARD_ELEMENT_OPTIONS} />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Expiry Date</label>
                  <div className="card-element">
                    <CardExpiryElement options={CARD_ELEMENT_OPTIONS} />
                  </div>
                </div>

                <div className="form-group">
                  <label>CVC</label>
                  <div className="card-element">
                    <CardCvcElement options={CARD_ELEMENT_OPTIONS} />
                  </div>
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowAddCard(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={!stripe || processingCard}
                >
                  {processingCard ? 'Adding...' : 'Add Card'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Withdrawal Request Modal */}
      {showWithdrawalForm && (
        <div className="modal-overlay" onClick={() => setShowWithdrawalForm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Request Withdrawal</h2>
              <button className="close-btn" onClick={() => setShowWithdrawalForm(false)}>×</button>
            </div>
            <form onSubmit={handleWithdrawalRequest} className="withdrawal-form">
              <div className="form-group">
                <label>Available Balance: £{earningsSummary?.availableBalance?.toFixed(2) || '0.00'}</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={earningsSummary?.availableBalance || 0}
                  value={withdrawalAmount}
                  onChange={(e) => setWithdrawalAmount(e.target.value)}
                  placeholder="Enter amount"
                  required
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowWithdrawalForm(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default HostDashboard;


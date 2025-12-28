import React, { useState, useEffect } from 'react';
import axios from 'axios';
import PaymentModal from './PaymentModal';
import './BookingTest.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

function BookingTest({ token, user }) {
  const [activeTab, setActiveTab] = useState('browse');
  const [activities, setActivities] = useState([]);
  const [myBookings, setMyBookings] = useState([]);
  const [pendingBookings, setPendingBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState(null);

  // Activity creation form state
  const [activityForm, setActivityForm] = useState({
    title: 'Yoga Session in Central Park',
    description: 'Join us for a relaxing yoga session in the beautiful Central Park. All levels welcome!',
    category: ['Fitness', 'Wellness'],
    location: 'Central Park, New York, NY',
    date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7 days from now
    time: '10:00',
    maxParticipants: 20,
    price: 25,
    recurring: 'one-time', // Valid values: one-time, daily, weekly, monthly, yearly
    additionalInformation: 'Bring your own yoga mat. Water will be provided.',
    picture: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800',
  });

  useEffect(() => {
    if (token) {
      loadActivities();
      if (user?.role === 'member' || user?.grantRole === 'member') {
        loadMyBookings();
      }
      if (user?.role === 'host' || user?.grantRole === 'host') {
        loadPendingBookings();
      }
    }
  }, [token, user]);

  // Reload pending bookings when switching to pending bookings tab
  useEffect(() => {
    if (activeTab === 'pending-bookings' && token && (user?.role === 'host' || user?.grantRole === 'host')) {
      loadPendingBookings();
    }
  }, [activeTab, token, user]);

  // Reload activities when switching to browse tab
  useEffect(() => {
    if (activeTab === 'browse' && token) {
      loadActivities();
    }
  }, [activeTab, token, user]);

  const loadActivities = async () => {
    try {
      setLoading(true);
      // If user is a host, show only their activities
      const isHost = user?.role === 'host' || user?.grantRole === 'host';
      let response;
      if (isHost && token) {
        // Fetch host's own activities
        response = await axios.get(`${API_URL}/activities/host/my-activities`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        // This endpoint returns activities directly as array
        setActivities(response.data?.data || response.data || []);
      } else {
        // For members or public, browse all activities
        response = await axios.get(`${API_URL}/activities/browse`);
        // API returns { activities: [...], total: number }
        setActivities(response.data?.activities || response.data?.data || []);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load activities');
    } finally {
      setLoading(false);
    }
  };

  const loadMyBookings = async () => {
    try {
      const response = await axios.get(`${API_URL}/bookings/member/my-bookings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMyBookings(response.data?.data || []);
    } catch (err) {
      console.error('Failed to load bookings:', err);
    }
  };

  const loadPendingBookings = async () => {
    try {
      const response = await axios.get(`${API_URL}/bookings/host/pending`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('Pending bookings response:', response.data);
      // API might return bookings directly or wrapped in data
      const bookings = response.data?.data || response.data || [];
      console.log('Setting pending bookings:', bookings);
      setPendingBookings(Array.isArray(bookings) ? bookings : []);
    } catch (err) {
      console.error('Failed to load pending bookings:', err);
      console.error('Error response:', err.response?.data);
      setError(err.response?.data?.message || 'Failed to load pending bookings');
      setPendingBookings([]);
    }
  };

  const handleCreateActivity = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const response = await axios.post(
        `${API_URL}/activities`,
        activityForm,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setSuccess('Activity created successfully!');
      setActivityForm({
        ...activityForm,
        title: '',
        description: '',
      });
      loadActivities();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create activity');
    } finally {
      setLoading(false);
    }
  };

  const handleBookActivity = (activityId, price, activityTitle) => {
    if (price > 0) {
      // For paid activities, show payment modal
      setSelectedActivity({ id: activityId, price, title: activityTitle });
      setShowPaymentModal(true);
    } else {
      // Free activity - book immediately
      bookActivity(activityId, null);
    }
  };

  const bookActivity = async (activityId, paymentMethodId) => {
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const requestBody = { activityId };
      if (paymentMethodId) {
        requestBody.paymentMethodId = paymentMethodId;
      }

      const response = await axios.post(
        `${API_URL}/bookings`,
        requestBody,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      
      const booking = response.data?.data || response.data;
      
      if (paymentMethodId) {
        setSuccess(
          `Booking created! Status: ${booking.status}. ` +
          `Payment Status: ${booking.paymentStatus || 'pending'}. ` +
          `💰 Payment is held in escrow until host approves.`
        );
      } else {
        setSuccess(`Booking confirmed! Status: ${booking.status}`);
      }
      
      loadMyBookings();
      loadActivities();
      setShowPaymentModal(false);
      setSelectedActivity(null);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to book activity');
      console.error('Booking error:', err.response?.data || err);
      setShowPaymentModal(false);
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentSuccess = (paymentMethodId) => {
    if (selectedActivity) {
      bookActivity(selectedActivity.id, paymentMethodId);
    }
  };

  const handlePaymentError = (errorMessage) => {
    setError(errorMessage);
    setShowPaymentModal(false);
  };

  const handleApproveBooking = async (bookingId) => {
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const response = await axios.put(
        `${API_URL}/bookings/${bookingId}/approve`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setSuccess('Booking approved! Payment will be transferred to host.');
      loadPendingBookings();
      loadActivities();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to approve booking');
    } finally {
      setLoading(false);
    }
  };

  const handleDeclineBooking = async (bookingId) => {
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const response = await axios.put(
        `${API_URL}/bookings/${bookingId}/decline`,
        { status: 'cancelled' },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setSuccess('Booking declined! Payment will be refunded to member.');
      loadPendingBookings();
      loadActivities();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to decline booking');
    } finally {
      setLoading(false);
    }
  };

  const isMember = user?.role === 'member' || user?.grantRole === 'member';
  const isHost = user?.role === 'host' || user?.grantRole === 'host';

  return (
    <div className="booking-test-container">
      {showPaymentModal && selectedActivity && (
        <PaymentModal
          isOpen={showPaymentModal}
          onClose={() => {
            setShowPaymentModal(false);
            setSelectedActivity(null);
          }}
          amount={selectedActivity.price}
          activityTitle={selectedActivity.title}
          onSuccess={handlePaymentSuccess}
          onError={handlePaymentError}
        />
      )}
      <div className="tabs">
        <button
          className={activeTab === 'browse' ? 'active' : ''}
          onClick={() => setActiveTab('browse')}
        >
          Browse Activities
        </button>
        {isMember && (
          <button
            className={activeTab === 'my-bookings' ? 'active' : ''}
            onClick={() => setActiveTab('my-bookings')}
          >
            My Bookings
          </button>
        )}
        {isHost && (
          <>
            <button
              className={activeTab === 'create-activity' ? 'active' : ''}
              onClick={() => setActiveTab('create-activity')}
            >
              Create Activity
            </button>
            <button
              className={activeTab === 'pending-bookings' ? 'active' : ''}
              onClick={() => setActiveTab('pending-bookings')}
            >
              Pending Bookings ({pendingBookings.length})
            </button>
          </>
        )}
      </div>

      {error && <div className="alert error">{error}</div>}
      {success && <div className="alert success">{success}</div>}

      {activeTab === 'browse' && (
        <div className="activities-list">
          <h2>Available Activities</h2>
          {loading ? (
            <p>Loading...</p>
          ) : activities.length === 0 ? (
            <p>No activities found.</p>
          ) : (
            <div className="activity-grid">
              {activities.map((activity) => (
                <div key={activity._id} className="activity-card">
                  {activity.picture && (
                    <img src={activity.picture} alt={activity.title} />
                  )}
                  <div className="activity-info">
                    <h3>{activity.title}</h3>
                    <p>{activity.description}</p>
                    <div className="activity-details">
                      <p><strong>Category:</strong> {Array.isArray(activity.category) ? activity.category.join(', ') : activity.category}</p>
                      <p><strong>Location:</strong> {activity.location}</p>
                      <p><strong>Date:</strong> {new Date(activity.date).toLocaleDateString()}</p>
                      <p><strong>Time:</strong> {activity.time}</p>
                      <p><strong>Price:</strong> {activity.price > 0 ? `$${activity.price}` : 'Free'}</p>
                      <p><strong>Participants:</strong> {activity.currentParticipants || 0}/{activity.maxParticipants}</p>
                    </div>
                    {isMember && (
                      <button
                        className="btn-book"
                        onClick={() => handleBookActivity(activity._id, activity.price || 0, activity.title)}
                        disabled={loading || (activity.currentParticipants || 0) >= activity.maxParticipants}
                      >
                        {activity.price > 0 ? `Book for $${activity.price}` : 'Book Free Activity'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'my-bookings' && isMember && (
        <div className="bookings-list">
          <h2>My Bookings</h2>
          {myBookings.length === 0 ? (
            <p>You have no bookings yet.</p>
          ) : (
            <div className="booking-grid">
              {myBookings.map((booking) => (
                <div key={booking._id} className="booking-card">
                  <div className="booking-status">
                    <span className={`status-badge ${booking.status}`}>
                      {booking.status.toUpperCase()}
                    </span>
                    {booking.paymentStatus && (
                      <span className={`payment-badge ${booking.paymentStatus}`}>
                        Payment: {booking.paymentStatus.toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="booking-info">
                    <p><strong>Amount:</strong> ${booking.amount}</p>
                    {booking.paymentIntentId && (
                      <p><strong>Payment Intent:</strong> {booking.paymentIntentId}</p>
                    )}
                    {booking.paymentStatus === 'pending' && (
                      <p className="escrow-info">💰 Payment is held in escrow</p>
                    )}
                    {booking.paymentStatus === 'transferred' && (
                      <p className="escrow-info">✅ Payment transferred to host</p>
                    )}
                    {booking.paymentStatus === 'refunded' && (
                      <p className="escrow-info">↩️ Payment refunded</p>
                    )}
                    <p><strong>Created:</strong> {new Date(booking.created_at).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'create-activity' && isHost && (
        <div className="create-activity-form">
          <h2>Create New Activity</h2>
          <form onSubmit={handleCreateActivity}>
            <div className="form-group">
              <label>Title *</label>
              <input
                type="text"
                value={activityForm.title}
                onChange={(e) => setActivityForm({ ...activityForm, title: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label>Description *</label>
              <textarea
                value={activityForm.description}
                onChange={(e) => setActivityForm({ ...activityForm, description: e.target.value })}
                rows="4"
                required
              />
            </div>

            <div className="form-group">
              <label>Category * (comma-separated)</label>
              <input
                type="text"
                value={activityForm.category.join(', ')}
                onChange={(e) => setActivityForm({ ...activityForm, category: e.target.value.split(',').map(c => c.trim()) })}
                placeholder="Fitness, Wellness"
                required
              />
            </div>

            <div className="form-group">
              <label>Location *</label>
              <input
                type="text"
                value={activityForm.location}
                onChange={(e) => setActivityForm({ ...activityForm, location: e.target.value })}
                required
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Date *</label>
                <input
                  type="date"
                  value={activityForm.date}
                  onChange={(e) => setActivityForm({ ...activityForm, date: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Time *</label>
                <input
                  type="time"
                  value={activityForm.time}
                  onChange={(e) => setActivityForm({ ...activityForm, time: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Max Participants *</label>
                <input
                  type="number"
                  value={activityForm.maxParticipants}
                  onChange={(e) => setActivityForm({ ...activityForm, maxParticipants: parseInt(e.target.value) })}
                  min="1"
                  max="1000"
                  required
                />
              </div>

              <div className="form-group">
                <label>Price ($) * (0 for free)</label>
                <input
                  type="number"
                  value={activityForm.price}
                  onChange={(e) => setActivityForm({ ...activityForm, price: parseFloat(e.target.value) || 0 })}
                  min="0"
                  step="0.01"
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>Recurring *</label>
              <select
                value={activityForm.recurring}
                onChange={(e) => setActivityForm({ ...activityForm, recurring: e.target.value })}
                required
              >
                <option value="one-time">One Time</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>

            <div className="form-group">
              <label>Picture URL *</label>
              <input
                type="url"
                value={activityForm.picture}
                onChange={(e) => setActivityForm({ ...activityForm, picture: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label>Additional Information</label>
              <textarea
                value={activityForm.additionalInformation}
                onChange={(e) => setActivityForm({ ...activityForm, additionalInformation: e.target.value })}
                rows="3"
              />
            </div>

            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Creating...' : 'Create Activity'}
            </button>
          </form>
        </div>
      )}

      {activeTab === 'pending-bookings' && isHost && (
        <div className="pending-bookings-list">
          <h2>Pending Bookings</h2>
          {pendingBookings.length === 0 ? (
            <p>No pending bookings.</p>
          ) : (
            <div className="booking-grid">
              {pendingBookings.map((booking) => (
                <div key={booking._id} className="booking-card">
                  <div className="booking-status">
                    <span className={`status-badge ${booking.status}`}>
                      {booking.status.toUpperCase()}
                    </span>
                    {booking.paymentStatus && (
                      <span className={`payment-badge ${booking.paymentStatus}`}>
                        Payment: {booking.paymentStatus.toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="booking-info">
                    <p><strong>Amount:</strong> ${booking.amount}</p>
                    {booking.paymentStatus === 'pending' && (
                      <p className="escrow-info">💰 Payment is held in escrow - waiting for your decision</p>
                    )}
                    {booking.paymentIntentId && (
                      <p><strong>Payment Intent:</strong> {booking.paymentIntentId}</p>
                    )}
                    <p><strong>Created:</strong> {new Date(booking.created_at).toLocaleString()}</p>
                  </div>
                  <div className="booking-actions">
                    <button
                      className="btn-approve"
                      onClick={() => handleApproveBooking(booking._id)}
                      disabled={loading}
                    >
                      ✅ Approve
                    </button>
                    <button
                      className="btn-decline"
                      onClick={() => handleDeclineBooking(booking._id)}
                      disabled={loading}
                    >
                      ❌ Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default BookingTest;


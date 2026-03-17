import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { propertiesApi, bookingsApi, communicationsApi } from '@/lib/api';
import toast from 'react-hot-toast';
import axios from 'axios';

interface Property {
  id: number;
  title: string;
  description: string;
  address: string;
  city: string;
  country: string;
  property_type: string;
  bedrooms: number;
  bathrooms: number;
  max_guests: number;
  square_feet: number;
  amenities: Record<string, boolean> | string | any;
  family_features: Record<string, boolean> | string | any;
  base_price: number;
  cleaning_fee: number;
  service_fee: number;
  security_deposit: number;
  featured_image: string;
  images: { id: number; image: string; is_featured: boolean }[] | Record<string, any> | any;
  host: {
    id: number;
    name: string;
    profile_picture: string;
  };
  average_rating: number;
  total_reviews: number;
  views_count: number;
}

interface User {
  id?: number;
  email?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  phone_number?: string;
  phone?: string;
  profile_picture?: string;
  [key: string]: any;
}

interface AvailabilityDate {
  date: string;
  is_available: boolean;
  price_override: number | null;
  is_booked: boolean;
}

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800';

// Helper: safely parse a field that might be a JSON string or already an object
function safeParse(value: any): any {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
}

// Helper: safely get entries from an object-like field (handles string JSON, arrays, objects)
function safeObjectEntries(value: any): [string, any][] {
  const parsed = safeParse(value);
  if (!parsed) return [];
  if (Array.isArray(parsed)) return [];
  if (typeof parsed !== 'object') return [];
  return Object.entries(parsed);
}

// Helper: convert HTTP to HTTPS for ngrok URLs
const getSecureImageUrl = (url: string): string => {
  if (!url) return FALLBACK_IMAGE;
  // Convert http to https for ngrok URLs
  if (url.includes('ngrok-free.app')) {
    return url.replace('http://', 'https://');
  }
  return url;
};

// Helper: safely get image URLs from images field with HTTPS
function safeImageUrls(images: any, featuredImage?: string): string[] {
  const result: string[] = [];

  // Add featured image first - ensure HTTPS
  if (featuredImage) {
    result.push(getSecureImageUrl(featuredImage));
  }

  if (!images) return result;

  const parsed = safeParse(images);

  if (Array.isArray(parsed)) {
    const others = parsed
      .filter((img: any) => img && !img.is_featured)
      .map((img: any) => {
        const url = img.image || img;
        return getSecureImageUrl(url);
      })
      .filter((url: any) => typeof url === 'string' && url);
    result.push(...others);
  } else if (typeof parsed === 'object') {
    const others = Object.values(parsed)
      .filter((img: any) => img && !img.is_featured)
      .map((img: any) => {
        const url = img.image || img;
        return getSecureImageUrl(url);
      })
      .filter((url: any) => typeof url === 'string' && url);
    result.push(...others);
  }

  return result;
}

export default function PropertyDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [property, setProperty] = useState<Property | null>(null);
  const [availability, setAvailability] = useState<AvailabilityDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(0);
  const [showLightbox, setShowLightbox] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [bookingDates, setBookingDates] = useState({
    checkIn: '',
    checkOut: '',
    guests: 1,
  });
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [message, setMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token) {
      setIsLoggedIn(true);
    }

    if (id) {
      fetchProperty();
      fetchAvailability();
    }
  }, [id]);

  const fetchProperty = async () => {
    setLoading(true);
    try {
      const response = await propertiesApi.get(Number(id));
      console.log('🔍 FULL API RESPONSE:', response);
      console.log('🔍 RESPONSE DATA:', response.data);
      console.log('🔍 DATA TYPE:', typeof response.data);
      console.log('🔍 IS ARRAY?', Array.isArray(response.data));
      console.log('🔍 KEYS:', Object.keys(response.data));

      // Debug images and amenities shapes
      console.log('🔍 IMAGES FIELD:', response.data.images);
      console.log('🔍 IMAGES TYPE:', typeof response.data.images);
      console.log('🔍 IMAGES IS ARRAY?', Array.isArray(response.data.images));
      console.log('🔍 AMENITIES TYPE:', typeof response.data.amenities, response.data.amenities);
      console.log('🔍 FAMILY_FEATURES TYPE:', typeof response.data.family_features, response.data.family_features);

      setProperty(response.data);
    } catch (error) {
      console.error('Error fetching property:', error);
      toast.error('Property not found');
      router.push('/search');
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailability = async () => {
    try {
      const startDate = new Date().toISOString().split('T')[0];
      const endDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const response = await propertiesApi.getAvailability(Number(id), startDate, endDate);
      setAvailability(response.data);
    } catch (error) {
      console.error('Error fetching availability:', error);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    setIsLoggedIn(false);
    router.push('/');
  };

  const isDateUnavailable = (dateStr: string) => {
    const dateAvail = availability.find((a) => a.date === dateStr);
    return dateAvail && (!dateAvail.is_available || dateAvail.is_booked);
  };

  const handleDateChange = (type: 'checkIn' | 'checkOut', value: string) => {
    if (!value) {
      setBookingDates({ ...bookingDates, [type]: value });
      return;
    }

    if (isDateUnavailable(value)) {
      toast.error('This date is not available. Please select different dates.');
      return;
    }

    if (type === 'checkOut' && bookingDates.checkIn) {
      const checkIn = new Date(bookingDates.checkIn);
      const checkOut = new Date(value);
      let hasUnavailable = false;

      const current = new Date(checkIn);
      current.setDate(current.getDate() + 1);
      while (current <= checkOut) {
        const dateStr = current.toISOString().split('T')[0];
        if (isDateUnavailable(dateStr)) {
          hasUnavailable = true;
          break;
        }
        current.setDate(current.getDate() + 1);
      }

      if (hasUnavailable) {
        toast.error('Some dates in your range are not available. Please select different dates.');
        return;
      }
    }

    setBookingDates({ ...bookingDates, [type]: value });
  };

  const handleReserve = async () => {
    if (!property) {
      toast.error('Property information not available');
      return;
    }

    if (!isLoggedIn) {
      router.push('/auth/login?redirect=' + router.asPath);
      return;
    }

    if (!bookingDates.checkIn || !bookingDates.checkOut) {
      toast.error('Please select check-in and check-out dates');
      return;
    }

    if (new Date(bookingDates.checkOut) <= new Date(bookingDates.checkIn)) {
      toast.error('Check-out date must be after check-in date');
      return;
    }

    setBookingLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        toast.error('Please log in again');
        router.push('/auth/login');
        return;
      }

      const userData = localStorage.getItem('user');
      console.log('User data from localStorage:', userData);

      let user: User = {};
      try {
        user = userData ? JSON.parse(userData) : {};
      } catch (e) {
        console.error('Error parsing user data:', e);
      }

      const checkIn = new Date(bookingDates.checkIn);
      const checkOut = new Date(bookingDates.checkOut);
      const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

      const subtotal = Number(property.base_price) * nights;
      const cleaningFee = Number(property.cleaning_fee) || 0;
      const serviceFee = Number(property.service_fee) || 0;
      const taxAmount = (subtotal + cleaningFee + serviceFee) * 0.16;
      const total = subtotal + cleaningFee + serviceFee + taxAmount;

      let guestFullName = 'Guest';
      if (user.first_name || user.last_name) {
        guestFullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
      } else if (user.full_name) {
        guestFullName = user.full_name;
      } else if (user.username) {
        guestFullName = user.username;
      } else if (user.email) {
        guestFullName = user.email.split('@')[0];
      }

      let guestPhone = user.phone_number || user.phone || '';
      if (!guestPhone) {
        toast.error('Please add your phone number to your profile');
        setBookingLoading(false);
        return;
      }

      const bookingData = {
        property_id: parseInt(id as string),
        check_in_date: bookingDates.checkIn,
        check_out_date: bookingDates.checkOut,
        number_of_guests: bookingDates.guests,
        number_of_children: 0,
        total_amount: total,
        guest_full_name: guestFullName,
        guest_email: user.email || '',
        guest_phone: guestPhone,
        special_requests: '',
      };

      console.log('Sending booking data:', bookingData);

      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'}/bookings/create/`,
        bookingData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      console.log('Booking response:', response);
      toast.success('Booking created successfully!');
      router.push('/bookings');
    } catch (error: any) {
      console.error('Booking error:', error);

      if (error.response?.data) {
        const errorData = error.response.data;
        console.error('Error details:', errorData);

        if (typeof errorData === 'string') {
          toast.error(errorData);
        } else if (errorData.detail) {
          toast.error(errorData.detail);
        } else if (errorData.message) {
          toast.error(errorData.message);
        } else {
          const errorMessages = Object.entries(errorData)
            .map(([key, value]) => `${key}: ${value}`)
            .join(', ');
          toast.error(errorMessages || 'Failed to create booking');
        }
      } else {
        toast.error('Failed to create booking. Please try again.');
      }
    } finally {
      setBookingLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!message.trim()) {
      toast.error('Please enter a message');
      return;
    }

    setSendingMessage(true);
    try {
      const conversation = await communicationsApi.createConversation({
        property_id: id,
        participants: [property?.host?.id],
      });

      if (conversation.data?.id) {
        await communicationsApi.sendMessage(conversation.data.id, message);
      }

      toast.success('Message sent to host!');
      setShowContactModal(false);
      setMessage('');
      router.push('/messages');
    } catch (error: any) {
      console.error('Error sending message:', error);
      toast.error(error.response?.data?.detail || 'Failed to send message');
    } finally {
      setSendingMessage(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Property not found</h2>
          <Link href="/search" className="btn-primary">
            Browse Properties
          </Link>
        </div>
      </div>
    );
  }

  // Build image array safely using helpers
  const allImages = safeImageUrls(property.images, property.featured_image);
  if (allImages.length === 0) {
    allImages.push(FALLBACK_IMAGE);
  }

  // Safely parse amenities and family_features (handles JSON string, object, or bad data)
  const amenityEntries = safeObjectEntries(property.amenities).filter(([_, v]) => v);
  const familyEntries = safeObjectEntries(property.family_features).filter(([_, v]) => v);

  const totalNights =
    bookingDates.checkIn && bookingDates.checkOut
      ? Math.ceil(
          (new Date(bookingDates.checkOut).getTime() - new Date(bookingDates.checkIn).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : 0;

  const subtotal = Number(property.base_price) * totalNights;
  const cleaningFee = Number(property.cleaning_fee) || 0;
  const serviceFee = Number(property.service_fee) || 0;
  const taxAmount = (subtotal + cleaningFee + serviceFee) * 0.16;
  const total = subtotal + cleaningFee + serviceFee + taxAmount;

  const today = new Date().toISOString().split('T')[0];

  const maxGuests = Number(property.max_guests) || 8;
  const guestOptions = Array.from({ length: Math.min(maxGuests, 20) }, (_, i) => i + 1);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="text-2xl font-bold text-primary-500">
              FamilyStay
            </Link>
            <div className="flex items-center space-x-4">
              {isLoggedIn ? (
                <>
                  <Link href="/dashboard" className="text-gray-600 hover:text-primary-500">
                    Dashboard
                  </Link>
                  <Link href="/bookings" className="text-gray-600 hover:text-primary-500">
                    My Bookings
                  </Link>
                  <button onClick={handleLogout} className="text-gray-600 hover:text-primary-500">
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Link href="/auth/login" className="text-gray-600 hover:text-primary-500">
                    Log in
                  </Link>
                  <Link href="/auth/register" className="btn-primary">
                    Sign up
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Image Gallery */}
        <div className="mb-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 h-[400px]">
            {/* Main Image */}
            <div
              className="md:col-span-2 md:row-span-2 relative cursor-pointer"
              onClick={() => {
                setLightboxIndex(0);
                setShowLightbox(true);
              }}
            >
              <img
                src={allImages[0]}
                alt={property.title}
                className="w-full h-full object-cover rounded-l-lg"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = FALLBACK_IMAGE;
                }}
              />
              <div className="absolute bottom-4 left-4 bg-black bg-opacity-60 text-white px-3 py-1 rounded text-sm">
                {allImages.length} photo{allImages.length !== 1 ? 's' : ''}
              </div>
              {property.featured_image === allImages[0] && (
                <div className="absolute top-4 left-4 bg-primary-500 text-white px-3 py-1 rounded-full text-xs font-semibold">
                  Featured
                </div>
              )}
            </div>

            {/* Thumbnail Images */}
            <div className="grid grid-cols-2 gap-2 md:col-span-2">
              {allImages.slice(1, 5).map((img, idx) => (
                <div
                  key={idx}
                  className="relative cursor-pointer overflow-hidden rounded-tr-lg rounded-br-lg"
                  onClick={() => {
                    setLightboxIndex(idx + 1);
                    setShowLightbox(true);
                  }}
                >
                  <img
                    src={img}
                    alt={`${property.title} ${idx + 2}`}
                    className="w-full h-full object-cover hover:scale-110 transition-transform duration-300"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = FALLBACK_IMAGE;
                    }}
                  />
                  {idx === 3 && allImages.length > 5 && (
                    <div className="absolute inset-0 bg-black bg-opacity-60 flex items-center justify-center text-white font-semibold text-lg">
                      +{allImages.length - 5} more
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* View All Photos Button */}
          <button
            onClick={() => {
              setLightboxIndex(0);
              setShowLightbox(true);
            }}
            className="mt-4 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            View all photos
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Property Details */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{property.title}</h1>
              <p className="text-gray-600 mb-4">
                {property.address}, {property.city}, {property.country}
              </p>

              <div className="flex items-center gap-4 mb-6">
                <span className="badge-info">{property.property_type}</span>
                <span className="text-gray-600">
                  {property.bedrooms} bedrooms • {property.bathrooms} bathrooms • Up to{' '}
                  {property.max_guests} guests
                </span>
              </div>

              {/* Host Info */}
              <div className="flex items-center gap-4 mb-6 pb-6 border-b">
                {property.host?.profile_picture ? (
                  <img
                    src={getSecureImageUrl(property.host.profile_picture)}
                    alt={property.host.name}
                    className="w-12 h-12 rounded-full"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = FALLBACK_IMAGE;
                    }}
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gray-300 flex items-center justify-center">
                    <span className="text-gray-600 font-bold">
                      {property.host?.name?.charAt(0) || 'H'}
                    </span>
                  </div>
                )}
                <div className="flex-1">
                  <p className="font-medium">Hosted by {property.host?.name || 'Host'}</p>
                  <p className="text-sm text-gray-500">{property.total_reviews || 0} reviews</p>
                </div>
                <button onClick={() => setShowContactModal(true)} className="btn-outline text-sm">
                  Contact Host
                </button>
              </div>

              {/* Description */}
              <div className="mb-6">
                <h2 className="text-xl font-bold mb-3">About this place</h2>
                <p className="text-gray-600">{property.description}</p>
              </div>

              {/* Amenities */}
              <div className="mb-6">
                <h2 className="text-xl font-bold mb-3">What this place offers</h2>
                {amenityEntries.length > 0 ? (
                  <div className="grid grid-cols-2 gap-4">
                    {amenityEntries.map(([key]) => (
                      <div key={key} className="flex items-center gap-2">
                        <span>✓</span>
                        <span className="capitalize">{key.replace(/_/g, ' ')}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">No amenities listed.</p>
                )}
              </div>

              {/* Family Features */}
              {familyEntries.length > 0 && (
                <div className="mb-6">
                  <h2 className="text-xl font-bold mb-3">Family-friendly features</h2>
                  <div className="grid grid-cols-2 gap-4">
                    {familyEntries.map(([key]) => (
                      <div key={key} className="flex items-center gap-2">
                        <span>👨‍👩‍👧‍👦</span>
                        <span className="capitalize">{key.replace(/_/g, ' ')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Reviews Section */}
              <div>
                <h2 className="text-xl font-bold mb-3">
                  Reviews ({property.total_reviews || 0})
                </h2>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-2xl font-bold">
                    ★ {property.average_rating?.toFixed(1) || '0.0'}
                  </span>
                  <span className="text-gray-500">rating</span>
                </div>
                <p className="text-gray-600">
                  {(property.total_reviews || 0) > 0
                    ? 'Reviews from guests who have stayed here.'
                    : 'No reviews yet. Be the first to review this property!'}
                </p>
              </div>
            </div>
          </div>

          {/* Booking Widget */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-lg p-6 sticky top-4">
              <div className="flex justify-between items-center mb-4">
                <span className="text-2xl font-bold">
                  KES {Number(property.base_price).toLocaleString()}
                  <span className="text-base font-normal text-gray-500">/night</span>
                </span>
                <span className="text-sm text-gray-500">
                  ★ {property.average_rating?.toFixed(1) || '0.0'} ({property.total_reviews || 0}{' '}
                  reviews)
                </span>
              </div>

              <div className="space-y-4 mb-4">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Check-in
                    </label>
                    <input
                      type="date"
                      className="input text-sm"
                      value={bookingDates.checkIn}
                      min={today}
                      onChange={(e) => handleDateChange('checkIn', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Check-out
                    </label>
                    <input
                      type="date"
                      className="input text-sm"
                      value={bookingDates.checkOut}
                      min={bookingDates.checkIn || today}
                      onChange={(e) => handleDateChange('checkOut', e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Guests</label>
                  <select
                    className="input text-sm"
                    value={bookingDates.guests}
                    onChange={(e) =>
                      setBookingDates({ ...bookingDates, guests: parseInt(e.target.value) })
                    }
                  >
                    {guestOptions.map((num) => (
                      <option key={num} value={num}>
                        {num} {num === 1 ? 'guest' : 'guests'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                className="w-full btn-primary mb-4"
                disabled={!bookingDates.checkIn || !bookingDates.checkOut || bookingLoading}
                onClick={handleReserve}
              >
                {bookingLoading ? 'Processing...' : 'Reserve'}
              </button>

              {totalNights > 0 && (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>
                      KES {Number(property.base_price).toLocaleString()} x {totalNights} nights
                    </span>
                    <span>KES {subtotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cleaning fee</span>
                    <span>KES {cleaningFee.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Service fee</span>
                    <span>KES {serviceFee.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Taxes (16%)</span>
                    <span>KES {taxAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between font-bold pt-2 border-t">
                    <span>Total</span>
                    <span>KES {total.toLocaleString()}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Contact Host Modal */}
      {showContactModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold mb-4">Contact Host</h3>
            <p className="text-gray-600 mb-4">
              Send a message to {property.host?.name} about this property.
            </p>
            <textarea
              className="input h-32"
              placeholder="Hi, I'm interested in your property. I would like to ask about..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowContactModal(false)} className="flex-1 btn-outline">
                Cancel
              </button>
              <button
                onClick={handleSendMessage}
                disabled={sendingMessage}
                className="flex-1 btn-primary"
              >
                {sendingMessage ? 'Sending...' : 'Send Message'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      {showLightbox && (
        <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
          <button
            onClick={() => setShowLightbox(false)}
            className="absolute top-4 right-4 text-white text-4xl hover:text-gray-300 z-50"
          >
            ×
          </button>

          {/* Previous Button */}
          <button
            onClick={() =>
              setLightboxIndex((lightboxIndex - 1 + allImages.length) % allImages.length)
            }
            className="absolute left-4 text-white text-4xl hover:text-gray-300"
          >
            ‹
          </button>

          {/* Main Image */}
          <div className="max-w-4xl max-h-[80vh]">
            <img
              src={allImages[lightboxIndex]}
              alt={`${property.title} ${lightboxIndex + 1}`}
              className="max-w-full max-h-[80vh] object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).src = FALLBACK_IMAGE;
              }}
            />
          </div>

          {/* Next Button */}
          <button
            onClick={() => setLightboxIndex((lightboxIndex + 1) % allImages.length)}
            className="absolute right-4 text-white text-4xl hover:text-gray-300"
          >
            ›
          </button>

          {/* Image Counter */}
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-white bg-black bg-opacity-60 px-4 py-2 rounded">
            {lightboxIndex + 1} / {allImages.length}
          </div>

          {/* Thumbnails */}
          <div className="absolute bottom-16 left-1/2 transform -translate-x-1/2 flex gap-2 max-w-full overflow-x-auto px-4">
            {allImages.map((img, idx) => (
              <button
                key={idx}
                onClick={() => setLightboxIndex(idx)}
                className={`w-16 h-16 flex-shrink-0 border-2 ${
                  lightboxIndex === idx
                    ? 'border-white'
                    : 'border-transparent opacity-70 hover:opacity-100'
                }`}
              >
                <img
                  src={img}
                  alt={`Thumbnail ${idx + 1}`}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = FALLBACK_IMAGE;
                  }}
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
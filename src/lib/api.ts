import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://3262-38-226-202-130.ngrok-free.app/api' ;

const BASE_DOMAIN = API_BASE_URL.replace('/api', '');



const api = axios.create({
  baseURL: API_BASE_URL, 
  headers: {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true', 
  },
  withCredentials: true,
});

const fixImageUrl = (url: string): string => {
  if (!url || typeof url !== 'string') return '';

  console.log('🔧 Fixing URL:', url);
  
   // If it's already a full URL with http/https
  if (url.startsWith('http')) {
    // Replace localhost with ngrok domain
    if (url.includes('localhost') || url.includes('127.0.0.1')) {
      const fixed = url.replace(/https?:\/\/[^\/]+/, BASE_DOMAIN);
      console.log('🔧 Replaced localhost with:', fixed);
      return fixed;
    }
    // Ensure HTTPS for ngrok
    if (url.includes('ngrok-free.app') && url.startsWith('http://')) {
      const fixed = url.replace('http://', 'https://');
      console.log('🔧 Converted HTTP to HTTPS:', fixed);
      return fixed;
    }
    return url;
  }
  
  // If it's a relative path starting with /media or /static
  if (url.startsWith('/media') || url.startsWith('/static')) {
    const fixed = `${BASE_DOMAIN}${url}`;
    console.log('🔧 Fixed relative path:', fixed);
    return fixed;
  }
  
  // If it's a relative path without leading slash
  if (url.startsWith('media') || url.startsWith('static')) {
    const fixed = `${BASE_DOMAIN}/${url}`;
    console.log('🔧 Fixed relative path (no slash):', fixed);
    return fixed;
  }
  
  console.log('🔧 No changes needed:', url);
  return url;
};

// Response interceptor to fix all image URLs in responses
api.interceptors.response.use(
  (response) => {
    console.log('🔧 Interceptor running for:', response.config.url);
    
    // Recursively process all string values that look like image URLs
    const processObject = (obj: any): any => {
      if (!obj || typeof obj !== 'object') return obj;
      
      if (Array.isArray(obj)) {
        return obj.map(item => processObject(item));
      }
      
      const processed: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
          // Check if this string looks like an image URL
          if (
            value.includes('/media/') || 
            value.includes('/static/') || 
            value.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i) ||
            key.toLowerCase().includes('image') || 
            key.toLowerCase().includes('photo') || 
            key.toLowerCase().includes('picture') ||
            key.toLowerCase().includes('avatar') ||
            key.toLowerCase().includes('thumbnail') ||
            key.toLowerCase().includes('featured')
          ) {
            processed[key] = fixImageUrl(value);
          } else {
            processed[key] = value;
          }
        } else if (typeof value === 'object' && value !== null) {
          processed[key] = processObject(value);
        } else {
          processed[key] = value;
        }
      }
      return processed;
    };
    
    response.data = processObject(response.data);
    return response;
  },
  (error) => Promise.reject(error)
);


// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('access_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Add response interceptor to fix image URLs
api.interceptors.response.use(
  (response) => {
    // If the response has image URLs, ensure they're HTTPS
    if (response.data && response.data.results) {
      response.data.results = response.data.results.map((item: any) => {
        if (item.featured_image) {
          item.featured_image = item.featured_image.replace('http://', 'https://');
        }
        if (item.images) {
          item.images = item.images.map((img: any) => ({
            ...img,
            image: img.image.replace('http://', 'https://')
          }));
        }
        return item;
      });
    }
    return response;
  },
  (error) => Promise.reject(error)
);
// Response interceptor to handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refresh_token');
        if (refreshToken) {
          const response = await axios.post(`${API_BASE_URL}/auth/token/refresh/`, {
            refresh: refreshToken,
          });
          
          const { access } = response.data;
          localStorage.setItem('access_token', access);
          
          originalRequest.headers.Authorization = `Bearer ${access}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        // Clear tokens and redirect to login
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        window.location.href = '/auth/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  register: (data: any) => api.post('/auth/register/', data),
  login: (credentials: any) => api.post('/auth/login/', credentials),
  logout: () => api.post('/auth/logout/', { refresh_token: localStorage.getItem('refresh_token') }),
  getProfile: () => api.get('/auth/profile/'),
  updateProfile: (data: any) => api.patch('/auth/profile/', data),
  changePassword: (data: any) => api.post('/auth/password/change/', data),
  requestPasswordReset: (email: string) => api.post('/auth/password-reset/', { email }),
};

// Properties API
export const propertiesApi = {
  list: (params?: any) => api.get('/properties/', { params }),
  get: (id: number) => api.get(`/properties/${id}/`),
  getAvailability: (id: number, startDate?: string, endDate?: string) => 
    api.get(`/properties/${id}/availability/`, { params: { start_date: startDate, end_date: endDate } }),
  // Host endpoints
  getMyProperties: () => api.get('/properties/host/properties/'),
  createProperty: (data: any) => api.post('/properties/host/create/', data),
  updateProperty: (id: number, data: any) => api.patch(`/properties/host/${id}/update/`, data),
  deleteProperty: (id: number) => api.delete(`/properties/host/${id}/delete/`),
  uploadImages: (id: number, formData: FormData) => 
    api.post(`/properties/host/${id}/images/`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  bulkUpdateAvailability: (id: number, data: any) => 
    api.post(`/properties/host/${id}/availability/bulk/`, data),
  // Admin endpoints
  approveProperty: (id: number) => api.post(`/properties/admin/${id}/approve/`),
  rejectProperty: (id: number) => api.post(`/properties/admin/${id}/reject/`),
  blockProperty: (id: number) => api.post(`/properties/admin/${id}/block/`),
};

// Bookings API
export const bookingsApi = {
  create: (data: any) => {
    const token = localStorage.getItem('access_token');
    return axios.post(
      `${process.env.NEXT_PUBLIC_API_URL || 'https://3262-38-226-202-130.ngrok-free.app/api'}/bookings/create/`,
      data,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );
  },
  list: (params?: any) => api.get('/bookings/my-bookings/', { params }),
  detail: (id: string | number) => api.get(`/bookings/${id}/`),
  get: (id: number) => api.get(`/bookings/${id}/`),
  cancel: (id: number, reason?: string) => api.post(`/bookings/${id}/cancel/`, { cancellation_reason: reason }),
  modify: (id: number, data: any) => api.post(`/bookings/${id}/modify/`, data),
  getHistory: (id: number) => api.get(`/bookings/${id}/history/`),
  // Host endpoints
  getHostBookings: (params?: any) => api.get('/bookings/host/bookings/', { params }),
  updateBookingStatus: (id: number, status: string) => 
    api.post(`/bookings/host/${id}/update-status/`, { status }),
};

// Payments API
export const paymentsApi = {
  initiate: (data: any) => api.post('/payments/initiate/', data),
  getMpesaStatus: (transactionId: string) => api.get(`/payments/mpesa/status/${transactionId}/`),
  list: () => api.get('/payments/history/'),
  get: (id: number) => api.get(`/payments/${id}/`),
  // Payouts
  requestPayout: (data: any) => api.post('/payments/payouts/request/', data),
  getPayoutHistory: () => api.get('/payments/payouts/history/'),
};

// Reviews API
export const reviewsApi = {
  create: (data: any) => api.post('/reviews/create/', data),
  getPropertyReviews: (propertyId: number, params?: any) => 
    api.get(`/reviews/property/${propertyId}/`, { params }),
  update: (id: number, data: any) => api.patch(`/reviews/${id}/`, data),
  delete: (id: number) => api.delete(`/reviews/${id}/delete/`),
  reply: (id: number, reply: string) => api.post(`/reviews/${id}/reply/`, { host_reply: reply }),
  report: (id: number, data: any) => api.post(`/reviews/${id}/report/`, data),
  // Admin
  moderate: (id: number, action: string) => api.post(`/reviews/admin/${id}/moderate/`, { action }),
};

// Communications API
export const communicationsApi = {
  // Conversations
  listConversations: () => api.get('/communications/conversations/'),
  createConversation: (data: any) => api.post('/communications/conversations/create/', data),
  getConversation: (id: number) => api.get(`/communications/conversations/${id}/`),
  sendMessage: (conversationId: number, content: string, attachments?: string[]) => 
    api.post(`/communications/conversations/${conversationId}/send/`, { content, attachments }),
  markMessageRead: (messageId: number) => api.post(`/communications/messages/${messageId}/read/`),
  // Notifications
  listNotifications: (params?: any) => api.get('/communications/notifications/', { params }),
  markNotificationRead: (id: number) => api.post(`/communications/notifications/${id}/read/`),
  markAllNotificationsRead: () => api.post('/communications/notifications/read-all/'),
};

export default api;

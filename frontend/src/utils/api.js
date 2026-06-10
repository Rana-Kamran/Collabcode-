const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://collabcode-s40g.onrender.com';
const API_URL = `${BACKEND_URL}/api`;

// Hard request timeout – prevents fetch from hanging forever (e.g. if the
// server is trying to connect to an email service and never responds).
const REQUEST_TIMEOUT_MS = 20000; // 20 seconds

const api = {
    async post(endpoint, data, token = null) {
        const headers = {
            'Content-Type': 'application/json',
        };
        if (token) {
            headers['x-auth-token'] = token;
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        try {
            const response = await fetch(`${API_URL}${endpoint}`, {
                method: 'POST',
                headers,
                body: JSON.stringify(data),
                signal: controller.signal,
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.msg || 'Something went wrong');
            }
            return result;
        } catch (err) {
            if (err.name === 'AbortError') {
                throw new Error('Request timed out. Please check your connection and try again.');
            }
            throw err;
        } finally {
            clearTimeout(timer);
        }
    },

    async get(endpoint, token = null) {
        const headers = {};
        if (token) {
            headers['x-auth-token'] = token;
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        try {
            const response = await fetch(`${API_URL}${endpoint}`, {
                method: 'GET',
                headers,
                signal: controller.signal,
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.msg || 'Something went wrong');
            }
            return result;
        } catch (err) {
            if (err.name === 'AbortError') {
                throw new Error('Request timed out. Please check your connection and try again.');
            }
            throw err;
        } finally {
            clearTimeout(timer);
        }
    }
};

export default api;

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://collabcode-s40g.onrender.com';
const API_URL = `${BACKEND_URL}/api`;

const api = {
    async post(endpoint, data, token = null) {
        const headers = {
            'Content-Type': 'application/json',
        };
        if (token) {
            headers['x-auth-token'] = token;
        }
        const response = await fetch(`${API_URL}${endpoint}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(data),
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.msg || 'Something went wrong');
        }
        return result;
    },

    async get(endpoint, token = null) {
        const headers = {};
        if (token) {
            headers['x-auth-token'] = token;
        }
        const response = await fetch(`${API_URL}${endpoint}`, {
            method: 'GET',
            headers,
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.msg || 'Something went wrong');
        }
        return result;
    }
};

export default api;

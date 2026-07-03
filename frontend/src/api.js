import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,  // always the correct API root
});

api.interceptors.request.use((config) => {
  // ensure absolute url
  if (!config.url.startsWith("http")) {
    config.url = (config.baseURL || "") + config.url;
  } 

  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      localStorage.removeItem("perms");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export default api;

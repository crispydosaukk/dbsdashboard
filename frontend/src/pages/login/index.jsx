import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FiLogIn, FiEye, FiEyeOff } from "react-icons/fi";
import { ImSpinner2 } from "react-icons/im";
import { getSafePath } from "../../utils/perm";
import { useAuth } from "../../context/AuthContext";

export default function LoginPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [remember, setRemember] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [mounted, setMounted] = useState(false);
  const { login, user, userData, perms } = useAuth();

  useEffect(() => {
    const rememberFlag = localStorage.getItem("remember");
    const userStr = localStorage.getItem("user");
    if (userStr && !rememberFlag && !user) {
      localStorage.removeItem("user");
      localStorage.removeItem("perms");
    }
    setTimeout(() => setMounted(true), 40);
  }, []);

  // Redirect only after AuthContext has fully loaded the user data
  useEffect(() => {
    if (user && userData) {
      const path = getSafePath(userData, perms);
      if (path === "/login") {
        setErr("Account has no assigned dashboard permissions.");
        setLoading(false);
      } else {
        navigate(path, { replace: true });
      }
    }
  }, [user, userData, perms, navigate]);


  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    const email = form.email.trim().toLowerCase();
    const password = String(form.password || "");
    if (!email || !password) return setErr("Email and password are required");

    try {
      setLoading(true);

      await login(email, password);
      
      remember ? localStorage.setItem("remember", "1") : localStorage.removeItem("remember");

      // The redirect is now handled by the useEffect above
    } catch (error) {
      console.error("Login error:", error);
      setErr("Invalid email or password");
      setLoading(false);
    } 
  };

  return (
    <>
      <style>{`
        .animated-border {
          position: relative;
          border-radius: 24px;
          padding: 3px;
          background: linear-gradient(120deg,#10b981,#3b82f6,#8b5cf6,#ec4899,#f59e0b,#10b981);
          background-size: 250% 250%;
          animation: borderGlow 4s linear infinite;
        }
        .animated-border-inner {
          background: #ffffff;
          border-radius: 21px;
          width: 100%;
        }
        @keyframes borderGlow { 0%{background-position:0 50%} 50%{background-position:100% 50%} 100%{background-position:0 50%}}

        .underline-input {
          width: 100%;
          padding: 8px 4px;
          font-size: 14px;
          outline: none;
          border: none;
          border-bottom: 2px solid #e5e7eb;
          background: transparent;
          transition: all 0.3s ease;
        }
        @media (min-width: 640px) {
          .underline-input {
            padding: 12px 4px;
            font-size: 15px;
          }
        }
        .underline-input:focus {
          border-bottom-color: #059669;
        }
        .underline-focus-line {
          position: relative;
          display: block;
          width: 100%;
        }
        .underline-focus-line::after {
          content:"";
          position:absolute;
          left:50%; bottom:0;
          width:0%; height:2px;
          background:#059669;
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          transform: translateX(-50%);
        }
        .underline-input:focus + .underline-focus-line::after {
          width:100%;
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        .animate-shake { animation: shake 0.4s ease-in-out; }
        .premium-shadow {
          box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.12), 0 8px 16px -6px rgba(0, 0, 0, 0.08);
        }
      `}</style>

      <div className="min-h-screen w-full bg-[#f9fafb] flex items-center justify-center p-3 sm:p-4">
        <div className={`animated-border premium-shadow w-full max-w-[420px] transition-all duration-700 ease-out ${mounted ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
          }`}>
          <div className="animated-border-inner">
            <div className="px-6 py-6 sm:px-8 sm:py-8">
              {/* Logo Section */}
              <div className="flex justify-center mb-4 sm:mb-6">
                <div className="bg-black p-3.5 sm:p-4 rounded-xl shadow-xl transition-all duration-300 group">
                  <img
                    src="/digitalbotsolutions.jpeg"
                    alt="logo"
                    className="h-10 sm:h-12 w-auto object-contain transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
              </div>

              <div className="text-center space-y-0.5 mb-4 sm:mb-6">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
                  Welcome Back
                </h1>
                <p className="text-xs text-gray-400 font-medium">
                  Enter your credentials to continue
                </p>
              </div>

              {err && (
                <div className="mb-4 bg-red-50 text-red-600 text-xs px-3 py-2 rounded-lg border border-red-100 flex items-center animate-shake">
                  <span className="mr-2">⚠️</span> {err}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
                <div className="group">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 mb-1 block group-focus-within:text-[#D0B079] transition-colors">
                    Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={onChange}
                    placeholder="manager@digitalbotsolutions.com"
                    className="underline-input font-medium text-gray-800"
                  />
                  <span className="underline-focus-line after:bg-[#D0B079]"></span>
                </div>

                <div className="group relative">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 mb-1 block group-focus-within:text-[#D0B079] transition-colors">
                    Password
                  </label>
                  <input
                    type={showPwd ? "text" : "password"}
                    name="password"
                    value={form.password}
                    onChange={onChange}
                    placeholder="••••••••"
                    className="underline-input font-medium text-gray-800"
                  />
                  <span className="underline-focus-line after:bg-[#D0B079]"></span>

                  <button
                    type="button"
                    onClick={() => setShowPwd((s) => !s)}
                    className="absolute right-0 bottom-2 text-gray-400 hover:text-[#D0B079] transition-colors p-2"
                  >
                    {showPwd ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                  </button>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center group cursor-pointer">
                    <div className="relative flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={remember}
                        onChange={(e) => setRemember(e.target.checked)}
                        className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-gray-300 transition-all checked:border-[#D0B079] checked:bg-[#D0B079] hover:border-[#D0B079]"
                      />
                      <svg className="absolute w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                    </div>
                    <span className="ml-2 text-xs font-semibold text-gray-400 group-hover:text-gray-600 transition-colors">Remember me</span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  style={{ backgroundColor: "#D0B079" }}
                  className="w-full flex items-center justify-center hover:opacity-90 active:scale-[0.98] text-black font-semibold py-3 rounded-lg shadow-lg shadow-[#D0B079]/20 transition-all duration-200 disabled:opacity-70 mt-2"
                >
                  <span className="flex items-center">
                    {loading ? (
                      <><ImSpinner2 className="animate-spin mr-2 text-lg" /> Loading...</>
                    ) : (
                      <><FiLogIn className="mr-2 text-lg" /> Sign In</>
                    )}
                  </span>
                </button>
              </form>

              <div className="mt-6 pt-4 border-t border-gray-100 text-center">
                <p className="text-xs text-gray-400 font-medium">
                  Forgot password? <button className="text-emerald-600 font-bold hover:underline">Support</button>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

    </>
  );
}

import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Menu, User, LogOut, Settings, ChevronDown, X, MapPin, Navigation } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { usePopup } from "../../context/PopupContext";
import { useAuth } from "../../context/AuthContext";


// Helper to load Google Maps Script dynamically
const loadGoogleMapsScript = (apiKey, callback) => {
  if (!apiKey) return;
  const existingScript = document.getElementById("google-maps-script");
  if (!existingScript) {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.id = "google-maps-script";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (callback) callback();
    };
    document.head.appendChild(script);
  } else {
    if (window.google && window.google.maps && window.google.maps.places) {
      if (callback) callback();
    } else {
      if (existingScript.getAttribute('data-loaded') === 'true') {
        if (callback) callback();
      } else {
        const oldOnload = existingScript.onload;
        existingScript.onload = () => {
          if (oldOnload) oldOnload();
          existingScript.setAttribute('data-loaded', 'true');
          if (callback) callback();
        };
      }
    }
  }
};

const LocationModal = ({ isOpen, onClose, onSelectLocation, onUseCurrentLocation, apiKey, currentAddress, currentLat, currentLng }) => {
  const [query, setQuery] = useState("");
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const sessionToken = useRef(null);

  const PlaceSuggestionClass = useRef(null);
  const SessionTokenClass = useRef(null);

  useEffect(() => {
    if (isOpen) {
      loadGoogleMapsScript(apiKey, async () => {
        if (window.google && window.google.maps) {
          try {
            const { AutocompleteSuggestion, AutocompleteSessionToken } = await window.google.maps.importLibrary("places");
            PlaceSuggestionClass.current = AutocompleteSuggestion;
            SessionTokenClass.current = AutocompleteSessionToken;
            if (!sessionToken.current) {
              sessionToken.current = new AutocompleteSessionToken();
            }
          } catch (err) {
            console.error("Google Maps Places Library Import Failed:", err);
            setError("Failed to initialize search. Please refresh.");
          }
        }
      });
    }
  }, [apiKey, isOpen]);

  useEffect(() => {
    if (!query || query.length < 3 || !PlaceSuggestionClass.current) {
      setPredictions([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const AutocompleteSuggestion = PlaceSuggestionClass.current;
        const request = {
          input: query,
          sessionToken: sessionToken.current
        };
        const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
        const formattedResults = (suggestions || [])
          .filter(s => s.placePrediction)
          .map(s => {
            const p = s.placePrediction;
            return {
              place_id: p.toPlace().id,
              description: p.text.text,
              structured_formatting: {
                main_text: p.mainText.text,
                secondary_text: p.secondaryText.text
              }
            };
          });
        setPredictions(formattedResults);
      } catch (err) {
        console.error("Places Search Error:", err);
        setError("Unable to search locations.");
        setPredictions([]);
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [query]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center pt-24 px-4 font-sans">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-lg bg-[#1a1c23] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
          >
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
              <h3 className="text-white font-semibold flex items-center gap-2">
                <MapPin size={18} className="text-[#D0B079]" />
                Select Location
              </h3>
              <button onClick={onClose} className="p-1 hover:bg-white/10 text-white/60 hover:text-white rounded-lg transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4 shrink-0">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search for area, street name..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full pl-4 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#D0B079]/50 transition-all font-medium"
                  autoFocus
                />
              </div>
              <button
                onClick={() => { onUseCurrentLocation(); onClose(); }}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-[#D0B079]/10 hover:bg-[#D0B079]/20 text-[#D0B079] border border-[#D0B079]/20 transition-all group"
              >
                <Navigation size={18} />
                <div className="text-left">
                  <span className="block font-black text-[10px] uppercase tracking-widest">Use Current Location</span>
                </div>
              </button>
            </div>
            <div className="overflow-y-auto custom-scrollbar border-t border-white/5 flex-1 min-h-[100px]">
              {loading && <div className="p-4 text-center text-white/40 text-sm">Searching...</div>}
              {predictions.map((place) => (
                <button
                  key={place.place_id}
                  onClick={() => { onSelectLocation(place.description); onClose(); }}
                  className="w-full text-left p-4 hover:bg-white/5 border-b border-white/5 last:border-0 transition-colors flex items-start gap-3 group"
                >
                  <MapPin size={18} className="mt-0.5 text-white/40 group-hover:text-[#D0B079] shrink-0" />
                  <div>
                    <span className="block text-white text-sm font-medium">{place.structured_formatting.main_text}</span>
                    <span className="block text-white/40 text-xs mt-0.5">{place.structured_formatting.secondary_text}</span>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default function Header({ onToggleSidebar, darkMode = true }) {
  const { showPopup } = usePopup();
  const { logout: authLogout } = useAuth();
  const navigate = useNavigate();

  const menuRef = useRef(null);
  const [openMenu, setOpenMenu] = useState(false);
  const [locationName, setLocationName] = useState("");
  const [coords, setCoords] = useState(null);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  
  const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  const logout = () => {
    showPopup({
      title: "Confirm Logout",
      message: "Are you sure you want to log out?",
      type: "confirm",
      onConfirm: async () => {
        try {
          await authLogout();
          localStorage.clear();
          navigate("/login", { replace: true });
        } catch (err) {
          console.error("Logout error:", err);
        }
      }
    });
  };


  useEffect(() => {
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpenMenu(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const getCurrentLocation = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          setCoords({ lat: latitude, lng: longitude });
          try {
            if (!GOOGLE_MAPS_API_KEY) {
              setLocationName("No API Key");
              return;
            }
            const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}`);
            const data = await response.json();
            if (data.status === "OK" && data.results.length > 0) {
              setLocationName(data.results[0].formatted_address || "Location found");
            } else {
              setLocationName("Location not found");
            }
          } catch (error) {
            setLocationName("Error fetching location");
          }
        },
        () => setLocationName("Location Denied")
      );
    } else {
      setLocationName("Geolocation not supported");
    }
  };

  useEffect(() => {
    getCurrentLocation();
  }, []);

  return (
    <>
      <LocationModal
        isOpen={isLocationModalOpen}
        onClose={() => setIsLocationModalOpen(false)}
        apiKey={GOOGLE_MAPS_API_KEY}
        onUseCurrentLocation={getCurrentLocation}
        onSelectLocation={(loc) => setLocationName(loc)}
        currentAddress={locationName}
        currentLat={coords?.lat}
        currentLng={coords?.lng}
      />

      <header className="fixed top-0 left-0 right-0 z-50 flex flex-col border-b border-white/[0.06] shadow-2xl"
        style={{ background: 'linear-gradient(135deg, #071428 0%, #0d1f45 50%, #071428 100%)' }}>
        <div className="w-full px-4 sm:px-6 flex items-center justify-between h-16">
          
          <div className="flex items-center gap-3 sm:gap-4">
            <button onClick={onToggleSidebar} className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-all duration-200">
              <Menu size={22} />
            </button>
            <div className="hidden lg:flex items-center">
              <img src="/digitalbotsolutions.jpeg" alt="DigitalBotSolutions" className="h-[48px] w-auto object-contain drop-shadow-lg" />
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center px-2 sm:px-4 min-w-0">
            <button
              onClick={() => setIsLocationModalOpen(true)}
              className="flex items-center gap-2 sm:gap-3 text-white bg-white/8 hover:bg-white/15 py-2 px-3 sm:px-6 rounded-xl border border-white/10 shadow-sm max-w-[420px] w-full transition-all active:scale-95 group overflow-hidden"
            >
              <MapPin size={14} className="text-[#D0B079] shrink-0 group-hover:animate-bounce" />
              <span className="truncate text-white/85 text-[10px] sm:text-sm font-medium">
                {locationName || "Detecting..."}
              </span>
              <ChevronDown size={12} className="text-white/20 ml-auto shrink-0 hidden xs:block" />
            </button>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setOpenMenu((v) => !v)}
                className="flex items-center gap-2 p-1 rounded-xl hover:bg-white/8 transition-all"
              >
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-lg border border-white/15"
                  style={{ background: 'linear-gradient(135deg, #f97316, #fb923c)' }}>
                  {(() => { try { const u = JSON.parse(localStorage.getItem("user")); return u?.name?.charAt(0)?.toUpperCase() || 'A'; } catch { return 'A'; } })()}
                </div>
                <div className="text-left hidden sm:block pr-2">
                  <p className="text-[14px] font-semibold leading-none text-white/90">
                    {(() => { try { return JSON.parse(localStorage.getItem("user"))?.name?.split(' ')[0] || 'Admin'; } catch { return 'Admin'; } })()}
                  </p>
                </div>
                <ChevronDown size={13} className="hidden sm:block text-white/40" />
              </button>

              <AnimatePresence>
                {openMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute right-0 mt-3 w-56 rounded-xl shadow-2xl border border-white/[0.08] overflow-hidden z-50 bg-[#0b1a3d]"
                  >
                    <div className="p-1.5">
                      <button
                        onClick={() => { navigate("/restuarent"); setOpenMenu(false); }}
                        className="w-full text-left px-3.5 py-2.5 text-[14px] text-white/80 hover:bg-white/[0.06] hover:text-white rounded-lg flex items-center gap-3 transition-colors"
                      >
                        <User size={15} className="text-white/40" /> Profile
                      </button>
                      <button
                        onClick={() => { navigate("/restuarent"); setOpenMenu(false); }}
                        className="w-full text-left px-3.5 py-2.5 text-[14px] text-white/80 hover:bg-white/[0.06] hover:text-white rounded-lg flex items-center gap-3 transition-colors"
                      >
                        <Settings size={15} className="text-white/40" /> Settings
                      </button>
                    </div>
                    <div className="border-t border-white/[0.07] p-1.5">
                      <button
                        onClick={logout}
                        className="w-full text-left px-3.5 py-2.5 text-[14px] text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 rounded-lg flex items-center gap-3 transition-colors"
                      >
                        <LogOut size={15} /> Logout
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </header>
    </>
  );
}

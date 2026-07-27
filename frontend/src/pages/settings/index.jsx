import React, { useEffect, useState, useMemo } from "react";
import Header from "../../components/common/header.jsx";
import Sidebar from "../../components/common/sidebar.jsx";
import Footer from "../../components/common/footer.jsx";
import { db } from "../../lib/firebase";
import { collection, doc, getDoc, updateDoc, onSnapshot, setDoc } from "firebase/firestore";
import { motion, AnimatePresence } from "framer-motion";
import { Settings as SettingsIcon, Save, Loader2, MapPin, Navigation, HelpCircle, ChevronDown, Store, Clock } from "lucide-react";
import { usePopup } from "../../context/PopupContext";
import { useAuth } from "../../context/AuthContext.jsx";
import { Mail, Plus, Trash2, ToggleLeft, ToggleRight } from "lucide-react";

export default function Settings() {
  const { showPopup } = usePopup();
  const { userData, perms } = useAuth();
  
  const isSuper = useMemo(() => {
    if (!userData) return false;
    const roleId = String(userData.role_id || "");
    const roleTitle = String(userData.role_title || userData.role || "").toLowerCase().trim();
    return roleId === "6" || roleTitle === "super admin" || perms?.includes("access");
  }, [userData, perms]);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [radius, setRadius] = useState("50");
  const [isGeofenceEnabled, setIsGeofenceEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Persist the Apply to All toggle in localStorage so it doesn't reset on refresh
  const [applyToAll, setApplyToAll] = useState(() => {
    return localStorage.getItem("settings_apply_to_all") === "true";
  });
  
  const [restaurants, setRestaurants] = useState([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState("");
  const [showRestaurantMenu, setShowRestaurantMenu] = useState(false);

  // Toggle handler that persists state
  const handleToggleApplyToAll = (checked) => {
    setApplyToAll(checked);
    localStorage.setItem("settings_apply_to_all", checked ? "true" : "false");
  };

  const [reportEmails, setReportEmails] = useState([]);
  const [newEmail, setNewEmail] = useState("");

  // Load global settings
  useEffect(() => {
    if (isSuper) {
      const unsub = onSnapshot(doc(db, "settings", "global"), (docSnap) => {
        if (docSnap.exists() && docSnap.data().reportEmails) {
          setReportEmails(docSnap.data().reportEmails);
        } else {
          // Initialize with default if empty
          setReportEmails([
            { email: "rahulbadugu22@gmail.com", active: true },
            { email: "digitalbotsolutions@gmail.com", active: true },
            { email: "ataullah3@icloud.com", active: true }
          ]);
        }
      });
      return () => unsub();
    }
  }, [isSuper]);

  const handleAddEmail = async (e) => {
    e.preventDefault();
    if (!newEmail || !newEmail.includes('@')) {
      showPopup({ title: "Invalid Email", message: "Please enter a valid email address.", type: "warning" });
      return;
    }
    const updated = [...reportEmails, { email: newEmail.trim(), active: true }];
    await setDoc(doc(db, "settings", "global"), { reportEmails: updated }, { merge: true });
    setNewEmail("");
    showPopup({ title: "Email Added", message: "Recipient added successfully.", type: "success" });
  };

  const handleToggleEmail = async (index) => {
    const updated = [...reportEmails];
    updated[index].active = !updated[index].active;
    await setDoc(doc(db, "settings", "global"), { reportEmails: updated }, { merge: true });
  };

  const handleRemoveEmail = async (index) => {
    const updated = reportEmails.filter((_, i) => i !== index);
    await setDoc(doc(db, "settings", "global"), { reportEmails: updated }, { merge: true });
  };

  // Load list of all restaurants if Super Admin
  useEffect(() => {
    if (isSuper) {
      setLoading(true);
      const unsubRestaurants = onSnapshot(collection(db, "restaurants"), (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setRestaurants(list);
        
        // Auto-select the first restaurant on load if none selected
        if (list.length > 0 && !selectedRestaurant) {
          setSelectedRestaurant(list[0].id);
        }
        setLoading(false);
      }, (err) => {
        console.error("Error loading restaurants:", err);
        setLoading(false);
      });
      return () => unsubRestaurants();
    } else {
      const rId = userData?.restaurant_id || userData?.uid || "";
      setSelectedRestaurant(rId);
    }
  }, [isSuper, userData]);

  // Load the settings for the currently selected restaurant (always fetch so input fields are populated)
  useEffect(() => {
    if (!selectedRestaurant) return;
    
    const fetchSettings = async () => {
      try {
        setLoading(true);
        const restDoc = await getDoc(doc(db, "restaurants", selectedRestaurant));
        if (restDoc.exists()) {
          const data = restDoc.data();
          setRadius(data.geofence_radius !== undefined ? data.geofence_radius.toString() : "50");
          setIsGeofenceEnabled(data.is_geofence_enabled !== undefined ? data.is_geofence_enabled : true);
        } else {
          setRadius("50");
          setIsGeofenceEnabled(true);
        }
      } catch (err) {
        console.error("Error fetching restaurant settings:", err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchSettings();
  }, [selectedRestaurant]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setSaving(true);
      
      const numericRadius = parseFloat(radius);
      if (isNaN(numericRadius) || numericRadius < 10) {
        showPopup({
          title: "Invalid Radius",
          message: "Please enter a valid radius of at least 10 meters.",
          type: "warning"
        });
        setSaving(false);
        return;
      }

      if (applyToAll && isSuper) {
        const promises = restaurants.map(r => 
          updateDoc(doc(db, "restaurants", r.id), {
            geofence_radius: numericRadius,
            is_geofence_enabled: isGeofenceEnabled,
            updated_at: new Date()
          })
        );
        await Promise.all(promises);
        showPopup({
          title: "Settings Saved",
          message: `Settings successfully applied to all ${restaurants.length} restaurants.`,
          type: "success"
        });
      } else {
        if (!selectedRestaurant) {
          showPopup({
            title: "No Restaurant",
            message: "Please select a restaurant to edit settings.",
            type: "warning"
          });
          setSaving(false);
          return;
        }

        await updateDoc(doc(db, "restaurants", selectedRestaurant), {
          geofence_radius: numericRadius,
          is_geofence_enabled: isGeofenceEnabled,
          updated_at: new Date()
        });

        const restName = restaurants.find(r => r.id === selectedRestaurant)?.restaurant_name || "Restaurant";
        showPopup({
          title: "Settings Saved",
          message: `Geofence radius for "${restName}" updated successfully.`,
          type: "success"
        });
      }
    } catch (err) {
      console.error("Save settings error:", err);
      showPopup({
        title: "Save Failed",
        message: "Unable to update restaurant settings in database.",
        type: "error"
      });
    } finally {
      setSaving(false);
    }
  };

  const selectedRestData = useMemo(() => {
    if (isSuper && !applyToAll) {
      return restaurants.find(r => r.id === selectedRestaurant);
    }
    return null;
  }, [isSuper, restaurants, selectedRestaurant, applyToAll]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#071428] via-[#0d1f45] to-[#071428] selection:bg-[#D0B079]/30 font-sans">
      <Header onToggleSidebar={() => setSidebarOpen((s) => !s)} />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className={`flex-1 flex flex-col pt-20 lg:pt-24 transition-all duration-300 ease-in-out ${sidebarOpen ? "lg:pl-72" : "lg:pl-0"}`}>
        <main className="flex-1 px-4 sm:px-6 lg:px-10 py-8">
          <div className="max-w-3xl mx-auto">
            {/* Page Header */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="mb-8"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-8">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-[#0b1a3d]/60 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/[0.08]">
                    <SettingsIcon className="text-yellow-400" size={24} />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">System Settings</h1>
                    <p className="text-white/60 mt-1 text-sm font-medium tracking-wide">Configure dynamic rules and ranges per restaurant location</p>
                  </div>
                </div>

                {/* Super Admin Restaurant Selector */}
                {isSuper && restaurants.length > 0 && (
                  <div className="relative">
                    {applyToAll ? (
                      <div className="px-5 py-3 bg-[#D0B079]/10 border border-[#D0B079]/20 rounded-2xl text-[#D0B079] font-bold text-xs uppercase tracking-widest flex items-center gap-2 shadow-xl">
                        <Store size={14} />
                        All Restaurants Selected
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowRestaurantMenu(!showRestaurantMenu)}
                        className="w-full sm:w-auto flex items-center justify-between gap-3 px-5 py-3 bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 text-white/80 font-bold hover:bg-white/10 transition-all text-xs tracking-wider shadow-xl"
                      >
                        <Store size={16} className="text-[#D0B079]" />
                        <span className="min-w-[120px] text-left">
                          {restaurants.find(r => r.id === selectedRestaurant)?.restaurant_name || "Select Restaurant"}
                        </span>
                        <ChevronDown size={14} className={`transition-transform duration-300 ${showRestaurantMenu ? 'rotate-180' : ''}`} />
                      </button>
                    )}

                    <AnimatePresence>
                      {showRestaurantMenu && !applyToAll && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className="absolute right-0 top-full mt-2 w-64 bg-[#0b1a3d] border border-white/10 rounded-2xl shadow-2xl z-50 py-2 overflow-hidden"
                        >
                          <div className="px-4 py-2 border-b border-white/5 mb-1">
                            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30">Select Restaurant</p>
                          </div>
                          <div className="max-h-60 overflow-y-auto">
                            {restaurants.map((r) => (
                              <button
                                key={r.id}
                                type="button"
                                onClick={() => {
                                  setSelectedRestaurant(r.id);
                                  setShowRestaurantMenu(false);
                                }}
                                className={`w-full px-5 py-3 text-left hover:bg-white/5 transition-colors text-xs font-bold flex items-center justify-between ${
                                  selectedRestaurant === r.id ? 'text-[#D0B079] bg-[#D0B079]/5' : 'text-white/60'
                                }`}
                              >
                                {r.restaurant_name}
                                {selectedRestaurant === r.id && <div className="w-1.5 h-1.5 rounded-full bg-[#D0B079] shadow-[0_0_8px_#D0B079]" />}
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>

              {/* Global Report Emails Card (Super Admin Only) */}
              {isSuper && (
                <div className="bg-[#0b1a3d]/60 backdrop-blur-xl rounded-[2.5rem] p-8 sm:p-10 shadow-2xl border border-white/[0.08] mb-8">
                  <div className="flex items-center gap-3 border-b border-white/[0.08] pb-4 mb-6">
                    <Mail className="text-[#D0B079]" size={22} />
                    <div>
                      <h3 className="text-lg font-bold text-white tracking-tight">Report Delivery Settings</h3>
                      <p className="text-white/60 mt-1 text-sm">Manage who receives automated attendance and snapshot emails.</p>
                    </div>
                  </div>

                  <form onSubmit={handleAddEmail} className="flex gap-4 mb-6">
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="Enter new email address..."
                      className="flex-1 px-4 py-3 bg-white/5 border border-white/[0.08] rounded-2xl text-white font-medium placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-[#D0B079]/40"
                    />
                    <button
                      type="submit"
                      disabled={!newEmail}
                      className="flex items-center gap-2 px-6 py-3 bg-[#D0B079]/10 text-[#D0B079] font-bold rounded-2xl border border-[#D0B079]/20 hover:bg-[#D0B079]/20 transition-colors disabled:opacity-50"
                    >
                      <Plus size={18} />
                      Add
                    </button>
                  </form>

                  <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                    {reportEmails.map((item, idx) => (
                      <div key={idx} className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${item.active ? 'bg-white/5 border-white/10' : 'bg-black/20 border-white/5 opacity-60'}`}>
                        <div className="flex flex-col">
                          <span className={`font-bold ${item.active ? 'text-white' : 'text-white/50'}`}>{item.email}</span>
                          <span className={`text-[10px] uppercase tracking-wider ${item.active ? 'text-emerald-400' : 'text-red-400'}`}>
                            {item.active ? 'Active Recipient' : 'Inactive'}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => handleToggleEmail(idx)}
                            className={`p-2 rounded-xl transition-colors ${item.active ? 'text-emerald-400 hover:bg-emerald-400/10' : 'text-white/40 hover:bg-white/10'}`}
                            title={item.active ? "Deactivate" : "Activate"}
                          >
                            {item.active ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveEmail(idx)}
                            className="p-2 text-red-400 hover:bg-red-400/10 rounded-xl transition-colors"
                            title="Remove Email"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    ))}
                    {reportEmails.length === 0 && (
                      <div className="text-center py-6 text-white/40 text-sm font-medium">No recipients configured.</div>
                    )}
                  </div>
                </div>
              )}

              {/* Form Card */}
              <div className="bg-[#0b1a3d]/60 backdrop-blur-xl rounded-[2.5rem] p-8 sm:p-10 shadow-2xl border border-white/[0.08] space-y-6">
                {/* Apply to All Switch (Super Admin only) */}
                {isSuper && (
                  <div className="flex items-center justify-between p-5 bg-white/[0.02] border border-white/[0.05] rounded-3xl">
                    <div className="pr-4">
                      <h4 className="text-sm font-bold text-white">Apply settings to all restaurants</h4>
                      <p className="text-xs text-white/50 mt-1">Turn this on to update the geofence radius for all active locations simultaneously</p>
                    </div>
                    <label className="flex items-center gap-3 cursor-pointer group/toggle shrink-0">
                      <div className="relative">
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={applyToAll}
                          onChange={(e) => handleToggleApplyToAll(e.target.checked)}
                        />
                        <div className={`w-12 h-6 rounded-full transition-colors ${applyToAll ? 'bg-emerald-500' : 'bg-white/10'}`}></div>
                        <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-all ${applyToAll ? 'translate-x-6' : ''}`}></div>
                      </div>
                    </label>
                  </div>
                )}

                {loading ? (
                  <div className="text-center py-20 text-white flex flex-col items-center gap-4">
                    <Loader2 className="animate-spin text-[#D0B079]" size={40} />
                    <span className="text-sm font-bold tracking-wide animate-pulse">Loading configurations...</span>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-8">
                    <div className="flex items-center gap-3 border-b border-white/[0.08] pb-4">
                      <Navigation className="text-[#D0B079]" size={22} />
                      <div>
                        <h3 className="text-lg font-bold text-white tracking-tight">Geofencing & Timing Rules</h3>
                        <p className="text-white/60 mt-1 text-sm">
                          Set the Clock In/Out parameters for{" "}
                          <span className="text-[#D0B079] font-bold">
                            {applyToAll
                              ? "All Restaurant Locations"
                              : isSuper
                              ? selectedRestData?.restaurant_name || "the selected store"
                              : userData?.restaurant_name || "your store"}
                          </span>
                        </p>
                      </div>
                    </div>

                    {selectedRestData && (
                      <div className="bg-white/[0.01] border border-white/[0.04] rounded-2xl p-4 flex flex-col sm:flex-row justify-between gap-4 text-xs font-mono text-white/50">
                        <div>
                          <span className="text-white/30 block text-[9px] uppercase tracking-widest mb-1">Store Address</span>
                          <span className="text-white/80">{selectedRestData.restaurant_address || "No address listed"}</span>
                        </div>
                        <div className="shrink-0 flex gap-4">
                          <div>
                            <span className="text-white/30 block text-[9px] uppercase tracking-widest mb-1">Latitude</span>
                            <span className="text-white/80 font-bold">{parseFloat(selectedRestData.latitude || 0).toFixed(6)}</span>
                          </div>
                          <div>
                            <span className="text-white/30 block text-[9px] uppercase tracking-widest mb-1">Longitude</span>
                            <span className="text-white/80 font-bold">{parseFloat(selectedRestData.longitude || 0).toFixed(6)}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="space-y-8">
                      {/* Geofence Feature */}
                      <div className="space-y-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-base font-bold text-white">Geofencing Restriction</h4>
                            <p className="text-xs text-white/50 mt-0.5">Control whether staff must be within a certain distance to clock in.</p>
                          </div>
                          <label className="flex items-center gap-3 cursor-pointer group/toggle shrink-0">
                            <div className="relative">
                              <input
                                type="checkbox"
                                className="sr-only"
                                checked={isGeofenceEnabled}
                                onChange={(e) => setIsGeofenceEnabled(e.target.checked)}
                              />
                              <div className={`w-12 h-6 rounded-full transition-colors ${isGeofenceEnabled ? 'bg-emerald-500' : 'bg-white/10'}`}></div>
                              <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-all ${isGeofenceEnabled ? 'translate-x-6' : ''}`}></div>
                            </div>
                          </label>
                        </div>
                        
                        <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 items-center transition-all duration-300 ${!isGeofenceEnabled ? 'opacity-40 pointer-events-none' : ''}`}>
                          <div className="space-y-2">
                            <label className="block text-sm font-semibold tracking-wide text-white ml-1">
                              Geofence Radius (meters)
                            </label>
                            <div className="relative group">
                              <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-[#D0B079] transition-colors" size={18} />
                              <input
                                type="number"
                                name="geofence_radius"
                                value={radius}
                                onChange={(e) => setRadius(e.target.value)}
                                placeholder="50"
                                min="10"
                                max="5000"
                                required={isGeofenceEnabled}
                                className="w-full pl-12 pr-4 py-3.5 bg-white/5 border border-white/[0.08] rounded-2xl text-white font-bold placeholder-white/10 focus:outline-none focus:ring-4 focus:ring-[#D0B079]/20 focus:border-[#D0B079]/40 transition-all hover:bg-white/10 shadow-inner"
                              />
                            </div>
                          </div>

                          <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-4 flex gap-3 text-xs text-white/60">
                            <HelpCircle className="text-[#D0B079] shrink-0" size={18} />
                            <div>
                              <p className="font-bold text-white mb-1">Geofence Radius</p>
                              <p className="leading-relaxed">
                                {applyToAll 
                                  ? "This geofencing range will be enforced across all restaurants."
                                  : "Staff must be within this distance from the store coordinates to clock in or out."}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                      </div>

                    <div className="flex justify-end pt-8 border-t border-white/[0.08]">
                      <button
                        type="submit"
                        disabled={saving}
                        className="flex items-center justify-center gap-3 px-8 py-4 bg-gradient-to-r from-[#D0B079] to-[#b8965f] text-slate-900 font-bold rounded-2xl shadow-xl hover:shadow-[#D0B079]/20 transform hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50"
                      >
                        {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                        Save Settings
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </motion.div>
          </div>
        </main>
        <Footer />
      </div>
    </div>
  );
}

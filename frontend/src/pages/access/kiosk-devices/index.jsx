import React, { useEffect, useMemo, useState } from "react";
import Header from "../../../components/common/header.jsx";
import Sidebar from "../../../components/common/sidebar.jsx";
import Footer from "../../../components/common/footer.jsx";
import { db, secondaryAuth, functionsInstance } from "../../../lib/firebase";
import { collection, query, onSnapshot, doc, deleteDoc, orderBy, setDoc, where, updateDoc } from "firebase/firestore";
import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Plus, Trash2, X, MonitorSmartphone, Mail, Lock, Building2, Eye, EyeOff, Edit } from "lucide-react";
import { usePopup } from "../../../context/PopupContext";

export default function KioskDevices() {
  const { showPopup } = usePopup();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Table state
  const [kiosks, setKiosks] = useState([]);
  const [kiosksLoading, setKiosksLoading] = useState(true);
  const [q, setQ] = useState("");

  // Restaurants/Users (to link to)
  const [restaurantUsers, setRestaurantUsers] = useState([]);

  // Modals
  const [openCreate, setOpenCreate] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  
  const [cName, setCName] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cPassword, setCPassword] = useState("");
  const [cRestaurantId, setCRestaurantId] = useState("");
  const [saving, setSaving] = useState(false);
  const [showCPassword, setShowCPassword] = useState(false);

  // Edit state
  const [eId, setEId] = useState(null);
  const [eName, setEName] = useState("");
  const [eEmail, setEEmail] = useState("");
  const [ePassword, setEPassword] = useState("");
  const [eRestaurantId, setERestaurantId] = useState("");
  const [oldEmail, setOldEmail] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [updating, setUpdating] = useState(false);
  const [showEPassword, setShowEPassword] = useState(false);

  const canSave = cName.trim() && cEmail.trim() && cPassword.trim() && cRestaurantId;
  const canUpdate = eId && eName.trim() && eEmail.trim() && eRestaurantId;

  // Load Kiosks (users with role_id = "KIOSK")
  useEffect(() => {
    const qKiosks = query(collection(db, "users"), where("role_id", "==", "KIOSK"));
    const unsub = onSnapshot(qKiosks, (snapshot) => {
      setKiosks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setKiosksLoading(false);
    });
    return () => unsub();
  }, []);

  // Load all non-kiosk users (Potential Restaurant Owners)
  useEffect(() => {
    const qUsers = query(collection(db, "users"), orderBy("name", "asc"));
    const unsub = onSnapshot(qUsers, (snapshot) => {
      const all = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRestaurantUsers(all.filter(u => u.role_id !== "KIOSK"));
    });
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return kiosks;
    return kiosks.filter(k => 
      (k.name || "").toLowerCase().includes(needle) ||
      (k.email || "").toLowerCase().includes(needle)
    );
  }, [q, kiosks]);

  // Create Kiosk User
  const handleCreate = async () => {
    if (!canSave) return;
    try {
      setSaving(true);
      // Create user in Auth without logging admin out
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, cEmail, cPassword);
      const uid = userCredential.user.uid;
      await signOut(secondaryAuth);

      // Save to Firestore
      await setDoc(doc(db, "users", uid), {
        name: cName,
        email: cEmail,
        password: cPassword, 
        role_id: "KIOSK",
        role_title: "Kiosk Device",
        restaurant_id: cRestaurantId, // Linking to a restaurant user
        created_at: new Date()
      });

      setCName(""); setCEmail(""); setCPassword(""); setCRestaurantId("");
      setOpenCreate(false);
      showPopup({ title: "Device Created", message: `Successfully added ${cName}.`, type: "success" });
    } catch (e) {
      showPopup({ title: "Error", message: e.message || "Failed to create device", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const openEditFor = (k) => {
    setEId(k.id);
    setEName(k.name || "");
    setEEmail(k.email || "");
    setEPassword(k.password || "");
    setERestaurantId(k.restaurant_id || "");
    setOldEmail(k.email || "");
    setOldPassword(k.password || "");
    setOpenEdit(true);
  };

  const handleUpdate = async () => {
    if (!canUpdate) return;
    try {
      setUpdating(true);
      let finalEmail = eEmail.trim();
      let finalPassword = ePassword.trim();
      let authSyncFailed = false;
      let authSyncMessage = "";

      const emailChanged = finalEmail !== oldEmail.trim();
      const passwordChanged = finalPassword !== oldPassword.trim() && finalPassword !== "";

      if (emailChanged || passwordChanged) {
        try {
          const updateFn = httpsCallable(functionsInstance, 'updateUserCredentials');
          const payload = { uid: eId, email: finalEmail };
          if (passwordChanged) payload.password = finalPassword;
          await updateFn(payload);
        } catch (authErr) {
          console.error("Auth Sync Error:", authErr);
          authSyncFailed = true;
          authSyncMessage = authErr.message;
          finalEmail = oldEmail.trim();
          finalPassword = oldPassword.trim();
        }
      }

      const data = { 
        name: eName, 
        email: finalEmail, 
        restaurant_id: eRestaurantId,
        updated_at: new Date() 
      };
      if (finalPassword) data.password = finalPassword;
      
      await updateDoc(doc(db, "users", eId), data);
      setOpenEdit(false);

      if (authSyncFailed) {
        showPopup({ title: "Update Failed", message: `Auth error: ${authSyncMessage}. Firebase Firestore was reverted.`, type: "warning" });
      } else {
        showPopup({ title: "Success", message: "Device updated successfully.", type: "success" });
      }
    } catch (e) {
      showPopup({ title: "Error", message: e.message || "Failed to update device", type: "error" });
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async (k) => {
    showPopup({
      title: "Remove Device?",
      message: `Are you sure you want to remove "${k.name}"? This action cannot be undone.`,
      type: "confirm",
      onConfirm: async () => {
        try {
          try {
            const deleteAuthFn = httpsCallable(functionsInstance, 'deleteAuthUser');
            await deleteAuthFn({ uid: k.id });
          } catch (authErr) {
            console.warn("Auth deletion skipped:", authErr.message);
          }

          await deleteDoc(doc(db, "users", k.id));
          showPopup({ title: "Deleted", message: "Device has been removed.", type: "success" });
        } catch (e) {
          showPopup({ title: "Error", message: e.message || "Failed to delete", type: "error" });
        }
      }
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#071428] via-[#0d1f45] to-[#071428] font-sans flex flex-col">
      <Header onToggleSidebar={() => setSidebarOpen((s) => !s)} />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className={`flex-1 -mt-12 flex flex-col pt-36 lg:pt-24 transition-all duration-300 ease-in-out ${sidebarOpen ? "lg:pl-72" : "lg:pl-0"}`}>
        <main className="flex-1 px-4 sm:px-6 lg:px-10 py-8">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8"
          >
            <div>
              <h2 className="text-2xl sm:text-4xl font-bold text-white tracking-tight flex items-center gap-3">
                <MonitorSmartphone className="text-[#D0B079]" size={36} />
                Kiosk Terminals
              </h2>
              <p className="mt-2 text-white/50 text-base font-medium">Manage dedicated credentials for kiosk devices.</p>
            </div>

            <button
              onClick={() => setOpenCreate(true)}
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-[#D0B079] to-[#b8965f] hover:from-[#b8965f] hover:to-[#a3804d] text-[#071428] rounded-2xl font-bold shadow-[0_0_20px_rgba(251,191,36,0.2)] transition-all hover:-translate-y-1 active:scale-95 text-base"
            >
              <Plus size={20} strokeWidth={3} />
              Register Device
            </button>
          </motion.div>

          <div className="bg-[#0b1a3d]/60 backdrop-blur-xl border border-white/[0.08] rounded-[1.5rem] sm:rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6 border-b border-white/[0.08] flex items-center justify-between gap-4 bg-white/[0.02]">
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={20} />
                <input
                  type="text"
                  placeholder="Search devices..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="w-full bg-white/[0.05] border border-white/[0.1] rounded-2xl pl-12 pr-6 py-4 text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-[#D0B079]/50 transition-all font-medium"
                />
              </div>
              <div className="text-white text-sm font-bold tracking-wide">
                {filtered.length} Devices
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white/[0.02] border-b border-white/[0.08] text-white text-sm font-bold tracking-tight">
                    <th className="px-8 py-6 w-16">#</th>
                    <th className="px-8 py-6">Device Name</th>
                    <th className="px-8 py-6">Email / Login</th>
                    <th className="px-8 py-6">Linked Restaurant User</th>
                    <th className="px-8 py-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04] text-white/90">
                  {kiosksLoading ? (
                    <tr><td colSpan={5} className="px-8 py-16 text-center text-white/30 font-bold text-lg">Loading devices...</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={5} className="px-8 py-16 text-center text-white/30 font-bold text-lg">No kiosk devices found</td></tr>
                  ) : (
                    filtered.map((k, idx) => (
                      <motion.tr
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: idx * 0.05 }}
                        key={k.id}
                        className="hover:bg-white/[0.02] transition-colors group"
                      >
                        <td className="px-8 py-6 text-white font-bold">{idx + 1}</td>
                        <td className="px-8 py-6 font-bold text-[#D0B079] group-hover:text-white transition-colors tracking-wide flex items-center gap-2">
                          <MonitorSmartphone size={16} className="text-white/30 group-hover:text-[#D0B079] transition-colors" />
                          {k.name}
                        </td>
                        <td className="px-8 py-6 text-white/60 font-medium tracking-wide">{k.email}</td>
                        <td className="px-8 py-6">
                          {(() => {
                            const rUser = restaurantUsers.find(u => u.id === k.restaurant_id);
                            return rUser ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-[10px] font-bold tracking-wide bg-white/5 text-white/60 border border-white/10">
                                <Building2 size={12} /> {rUser.name}
                              </span>
                            ) : (
                              <span className="text-white/20 italic font-medium text-[10px] tracking-wide">Unlinked</span>
                            );
                          })()}
                        </td>
                        <td className="px-8 py-6 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <button
                              onClick={() => openEditFor(k)}
                              className="p-3 bg-[#00f2ff]/10 text-[#00f2ff] hover:bg-[#00f2ff] hover:text-[#071428] rounded-xl transition-all border border-[#00f2ff]/20 shadow-lg shadow-[#00f2ff]/5"
                              title="Edit"
                            >
                              <Edit size={18} strokeWidth={2.5} />
                            </button>
                            <button
                              onClick={() => handleDelete(k)}
                              className="p-3 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-xl transition-all border border-red-500/20 shadow-lg shadow-red-500/5"
                              title="Delete"
                            >
                              <Trash2 size={18} strokeWidth={2.5} />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
        <Footer />
      </div>

      {/* CREATE MODAL */}
      <AnimatePresence>
        {openCreate && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpenCreate(false)} />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative w-full max-w-xl bg-slate-900/90 backdrop-blur-2xl border border-white/20 rounded-2xl shadow-2xl overflow-hidden p-6">
              <h3 className="text-xl font-bold text-white mb-6">Create Device Terminal</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 block">Device Name</label>
                  <input value={cName} onChange={(e) => setCName(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-[#D0B079]/50" placeholder="e.g. Main Entrance Kiosk" />
                </div>
                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 block">Login Email</label>
                  <input type="email" value={cEmail} onChange={(e) => setCEmail(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-[#D0B079]/50" placeholder="kiosk1@restaurant.com" />
                </div>
                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 block">Password</label>
                  <div className="relative">
                    <input type={showCPassword ? "text" : "password"} value={cPassword} onChange={(e) => setCPassword(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-[#D0B079]/50" placeholder="Set password" />
                    <button type="button" onClick={() => setShowCPassword(!showCPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"><Eye size={18} /></button>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 block">Assign to Restaurant User</label>
                  <select value={cRestaurantId} onChange={(e) => setCRestaurantId(e.target.value)} className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-[#D0B079]/50">
                    <option value="">Select Restaurant User...</option>
                    {restaurantUsers.map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setOpenCreate(false)} className="px-6 py-3 rounded-xl text-white/60 hover:text-white font-bold text-sm">Cancel</button>
                <button onClick={handleCreate} disabled={!canSave || saving} className="px-8 py-3 bg-[#D0B079] text-[#071428] rounded-xl font-bold text-sm disabled:opacity-50">{saving ? "Creating..." : "Create Device"}</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* EDIT MODAL */}
      <AnimatePresence>
        {openEdit && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpenEdit(false)} />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative w-full max-w-xl bg-slate-900/90 backdrop-blur-2xl border border-white/20 rounded-2xl shadow-2xl overflow-hidden p-6">
              <h3 className="text-xl font-bold text-white mb-6">Edit Device Terminal</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 block">Device Name</label>
                  <input value={eName} onChange={(e) => setEName(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-[#D0B079]/50" />
                </div>
                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 block">Login Email</label>
                  <input type="email" value={eEmail} onChange={(e) => setEEmail(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-[#D0B079]/50" />
                </div>
                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 block">Password (Leave blank to keep)</label>
                  <div className="relative">
                    <input type={showEPassword ? "text" : "password"} value={ePassword} onChange={(e) => setEPassword(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-[#D0B079]/50" />
                    <button type="button" onClick={() => setShowEPassword(!showEPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"><Eye size={18} /></button>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 block">Assign to Restaurant User</label>
                  <select value={eRestaurantId} onChange={(e) => setERestaurantId(e.target.value)} className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-[#D0B079]/50">
                    <option value="">Select Restaurant User...</option>
                    {restaurantUsers.map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setOpenEdit(false)} className="px-6 py-3 rounded-xl text-white/60 hover:text-white font-bold text-sm">Cancel</button>
                <button onClick={handleUpdate} disabled={!canUpdate || updating} className="px-8 py-3 bg-[#D0B079] text-[#071428] rounded-xl font-bold text-sm disabled:opacity-50">{updating ? "Saving..." : "Save Changes"}</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

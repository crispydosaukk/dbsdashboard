import React, { useEffect, useState } from "react";
import Header from "../../components/common/header.jsx";
import Sidebar from "../../components/common/sidebar.jsx";
import Footer from "../../components/common/footer.jsx";
import { db } from "../../lib/firebase";
import { collection, query, onSnapshot, doc, updateDoc, addDoc, deleteDoc, orderBy, setDoc } from "firebase/firestore";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Plus, Edit, Trash2, X, Shield } from "lucide-react";
import { usePopup } from "../../context/PopupContext";

export default function AccessManagement() {
  const { showPopup } = usePopup();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [openModal, setOpenModal] = useState(false); // create modal
  const [title, setTitle] = useState("");
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // edit state
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editingId, setEditingId] = useState(null);

  const [search, setSearch] = useState("");

  useEffect(() => {
    // Removed orderBy("created_at", "desc") to allow seeded permissions without timestamps to appear
    const q = query(collection(db, "permissions"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPermissions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (err) => {
      setError(err.message);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Sync all side modules permissions to DB
  useEffect(() => {
    if (!loading) {
      const defaultModules = [
        { id: "dashboard", title: "Dashboard" },
        { id: "restaurant", title: "Restaurant Profile" },
        { id: "all_staff", title: "All Staff" },
        { id: "staff_management", title: "Staff Management" },
        { id: "notifications", title: "Notifications" },
        { id: "auto_logouts", title: "Auto Logouts" },
        { id: "settings", title: "Settings" },
        { id: "access", title: "Access Control" }
      ];

      defaultModules.forEach(mod => {
        const exists = permissions.find(p => p.id === mod.id || p.title === mod.title);
        if (!exists) {
          setDoc(doc(db, "permissions", mod.id), {
            title: mod.title,
            created_at: new Date()
          }).catch(console.error);
        }
      });
    }
  }, [loading, permissions]);

  async function handleCreate() {
    if (!title.trim()) { setError("Title is required"); return; }
    try {
      setSubmitting(true);
      const permId = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      await setDoc(doc(db, "permissions", permId), {
        title: title.trim(),
        created_at: new Date()
      });
      setTitle("");
      setOpenModal(false);
    } catch (e) {
      setError(e.message || "Failed to create");
    } finally {
      setSubmitting(false);
    }
  }

  function openEdit(p) {
    setEditingId(p.id);
    setEditTitle(p.title || "");
    setEditOpen(true);
  }

  async function handleEditSave() {
    if (!editTitle.trim()) { setError("Title is required"); return; }
    try {
      setSubmitting(true);
      await updateDoc(doc(db, "permissions", editingId), {
        title: editTitle.trim(),
        updated_at: new Date()
      });
      setEditOpen(false);
      setEditingId(null);
      setEditTitle("");
    } catch (e) {
      setError(e.message || "Failed to update");
    } finally {
      setSubmitting(false);
    }
  }

  const handleDelete = (id) => {
    showPopup({
      title: "Delete Permission",
      message: "Are you sure you want to delete this permission?",
      type: "confirm",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "permissions", id));
          showPopup({ title: "Deleted", message: "Permission removed.", type: "success" });
        } catch (e) {
          setError(e.message || "Failed to delete");
          showPopup({ title: "Error", message: "Could not delete permission.", type: "error" });
        }
      }
    });
  };

  const filtered = permissions.filter(p =>
    (p.title || "").toLowerCase().includes(search.toLowerCase().trim())
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#071428] via-[#0d1f45] to-[#071428] font-sans">
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
                <Shield className="text-[#00f2ff]" size={36} />
                Permissions
              </h2>
              <p className="mt-2 text-white/50 text-base font-medium">Manage system access levels and capabilities.</p>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <button
                onClick={() => setOpenModal(true)}
                className="flex-1 md:flex-none inline-flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-[#D0B079] to-[#b8965f] hover:from-[#b8965f] hover:to-[#a3804d] text-[#071428] rounded-2xl font-bold shadow-[0_0_20px_rgba(251,191,36,0.2)] transition-all hover:-translate-y-1 active:scale-95 text-base"
              >
                <Plus size={20} strokeWidth={3} />
                Create Permission
              </button>
            </div>
          </motion.div>

          <div className="bg-[#0b1a3d]/60 backdrop-blur-xl border border-white/[0.08] rounded-[1.5rem] sm:rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col">
            {/* Toolbar */}
            <div className="p-6 border-b border-white/[0.08] flex flex-col sm:flex-row justify-between items-center gap-4 bg-white/[0.02]">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="relative w-full sm:w-80">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={20} />
                  <input
                    type="text"
                    placeholder="Search permissions..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full bg-white/[0.05] border border-white/[0.1] rounded-2xl pl-12 pr-6 py-4 text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-[#00f2ff]/50 transition-all font-medium"
                  />
                </div>
              </div>
              <div className="text-white text-sm font-bold tracking-wide">
                {filtered.length} Permissions Found
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white/[0.02] border-b border-white/[0.08] text-white text-sm font-bold tracking-tight">
                    <th className="px-8 py-6 w-20">#</th>
                    <th className="px-8 py-6">Permission Title</th>
                    <th className="px-8 py-6">Created At</th>
                    <th className="px-8 py-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04] text-white/90">
                  {loading ? (
                    <tr><td colSpan={4} className="px-8 py-16 text-center text-white/30 font-bold text-lg">Loading permissions...</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={4} className="px-8 py-16 text-center text-white/30 font-bold text-lg">No permissions found</td></tr>
                  ) : (
                    filtered.map((p, idx) => (
                      <motion.tr
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: idx * 0.05 }}
                        key={p.id}
                        className="hover:bg-white/[0.02] transition-colors group"
                      >
                        <td className="px-8 py-6 text-white font-bold">{idx + 1}</td>
                        <td className="px-8 py-6 font-bold text-[#00f2ff] group-hover:text-white transition-colors tracking-wide">{p.title}</td>
                        <td className="px-8 py-6 text-white/60 font-medium tracking-wide">
                          {p.created_at ? (p.created_at.toDate ? p.created_at.toDate() : new Date(p.created_at)).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : "-"}
                        </td>
                        <td className="px-8 py-6 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <button
                              onClick={() => openEdit(p)}
                              className="p-3 bg-[#00f2ff]/10 text-[#00f2ff] hover:bg-[#00f2ff] hover:text-[#071428] rounded-xl transition-all border border-[#00f2ff]/20 shadow-lg shadow-[#00f2ff]/5"
                              title="Edit"
                            >
                              <Edit size={18} strokeWidth={2.5} />
                            </button>
                            <button
                              onClick={() => handleDelete(p.id)}
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

            {/* Footer */}
            <div className="p-6 border-t border-white/[0.08] bg-white/[0.02] flex justify-between items-center">
              <span className="text-white text-sm font-bold tracking-wide">Showing {filtered.length} entries</span>
              {/* Pagination Placeholders */}
              <div className="flex gap-2">
                <button className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/[0.05] text-white/20 border border-white/[0.1] disabled:opacity-30 cursor-not-allowed" disabled>&laquo;</button>
                <button className="w-10 h-10 flex items-center justify-center rounded-xl bg-[#00f2ff] text-[#071428] font-black border border-[#00f2ff]/20 shadow-lg shadow-[#00f2ff]/20">1</button>
                <button className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/[0.05] text-white/20 border border-white/[0.1] disabled:opacity-30 cursor-not-allowed" disabled>&raquo;</button>
              </div>
            </div>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 p-5 bg-red-500/10 border border-red-500/20 rounded-[1.5rem] text-red-400 font-bold flex items-center gap-3"
            >
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
              {error}
            </motion.div>
          )}
        </main>

        <Footer />
      </div>

      {/* CREATE MODAL */}
      <AnimatePresence>
        {openModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setOpenModal(false)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-lg bg-white/10 backdrop-blur-2xl border border-white/20 rounded-2xl shadow-2xl overflow-hidden p-6"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-white">New Permission</h3>
                <button onClick={() => setOpenModal(false)} className="text-white/50 hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 block">Permission Title</label>
                  <input
                    autoFocus
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    placeholder="e.g. DELETE_USERS"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>

                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-white/[0.08]">
                  <button onClick={() => setOpenModal(false)} className="px-6 py-3 rounded-xl text-white/60 hover:text-white font-bold text-sm transition-all">Cancel</button>
                  <button
                    onClick={handleCreate}
                    disabled={submitting}
                    className="px-8 py-3 bg-gradient-to-r from-[#D0B079] to-[#b8965f] hover:from-[#b8965f] hover:to-[#a3804d] text-[#071428] rounded-xl font-bold text-sm shadow-2xl transition-all transform hover:-translate-y-1 active:scale-95 disabled:opacity-50"
                  >
                    {submitting ? "Creating..." : "Create Permission"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* EDIT MODAL */}
      <AnimatePresence>
        {editOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setEditOpen(false)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-lg bg-white/10 backdrop-blur-2xl border border-white/20 rounded-2xl shadow-2xl overflow-hidden p-6"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-white">Edit Permission</h3>
                <button onClick={() => setEditOpen(false)} className="text-white/50 hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 block">Permission Title</label>
                  <input
                    autoFocus
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                  />
                </div>

                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-white/[0.08]">
                  <button onClick={() => setEditOpen(false)} className="px-6 py-3 rounded-xl text-white/60 hover:text-white font-bold text-sm transition-all">Cancel</button>
                  <button
                    onClick={handleEditSave}
                    disabled={submitting}
                    className="px-8 py-3 bg-gradient-to-r from-[#D0B079] to-[#b8965f] hover:from-[#b8965f] hover:to-[#a3804d] text-[#071428] rounded-xl font-bold text-sm shadow-2xl transition-all transform hover:-translate-y-1 active:scale-95 disabled:opacity-50"
                  >
                    {submitting ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

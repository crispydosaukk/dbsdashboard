import React, { useEffect, useMemo, useRef, useState } from "react";
import Header from "../../components/common/header.jsx";
import Sidebar from "../../components/common/sidebar.jsx";
import Footer from "../../components/common/footer.jsx";
import { db } from "../../lib/firebase";
import { collection, query, onSnapshot, doc, updateDoc, addDoc, deleteDoc, orderBy, getDocs, setDoc } from "firebase/firestore";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Plus, Edit, Trash2, X, Shield, ChevronDown, Check } from "lucide-react";
import { usePopup } from "../../context/PopupContext";

// Helper: Custom Glass MultiSelect
const GlassMultiSelect = ({ loading, options, selected, onToggle, label }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const labelText = useMemo(() => {
    if (loading) return "Loading...";
    if (!options?.length) return "No items found";
    if (!selected?.length) return `Select ${label}...`;
    const picked = options.filter((o) => selected.includes(o.id)).map((o) => o.title);
    if (picked.length <= 2) return picked.join(", ");
    return `${picked.slice(0, 2).join(", ")} +${picked.length - 2} more`;
  }, [loading, options, selected, label]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-left focus:outline-none focus:ring-2 focus:ring-[#D0B079]/50 flex justify-between items-center text-white transition-all hover:bg-white/10"
      >
        <span className={selected.length ? "text-white" : "text-white/40"}>{labelText}</span>
        <ChevronDown size={16} className={`text-white/40 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
            className="absolute z-50 mt-2 w-full rounded-xl border border-white/20 bg-slate-900/90 backdrop-blur-xl shadow-2xl max-h-60 overflow-y-auto custom-scrollbar"
          >
            {loading ? (
              <div className="px-4 py-3 text-white/50 text-sm">Loading...</div>
            ) : !options?.length ? (
              <div className="px-4 py-3 text-white/50 text-sm">No items found</div>
            ) : (
              <div className="p-2 space-y-1">
                {options.map((opt) => {
                  const active = selected.includes(opt.id);
                  return (
                    <div
                      key={opt.id}
                      onClick={() => onToggle(opt.id)}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${active ? "bg-[#D0B079]/10 text-[#D0B079]" : "hover:bg-white/10 text-white/80"}`}
                    >
                      <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${active ? "bg-[#D0B079] border-[#D0B079]" : "border-white/30"}`}>
                        {active && <Check size={12} className="text-white" />}
                      </div>
                      <span className="text-sm font-medium">{opt.title}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};


export default function Roles() {
  const { showPopup } = usePopup();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Create modal
  const [openCreate, setOpenCreate] = useState(false);
  const [roleTitle, setRoleTitle] = useState("");

  // Edit modal
  const [openEdit, setOpenEdit] = useState(false);
  const [editRole, setEditRole] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSelectedIds, setEditSelectedIds] = useState([]);

  // Permissions
  const [permLoading, setPermLoading] = useState(true);
  const [permError, setPermError] = useState("");
  const [permissions, setPermissions] = useState([]);

  // Selected permissions for CREATE
  const [selectedIds, setSelectedIds] = useState([]);

  // Roles list
  const [rolesLoading, setRolesLoading] = useState(true);
  const [rolesError, setRolesError] = useState("");
  const [roles, setRoles] = useState([]);

  // Search
  const [searchTerm, setSearchTerm] = useState("");
  const pageSize = 10;

  // Load Permissions
  useEffect(() => {
    const q = query(collection(db, "permissions"), orderBy("title", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPermissions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setPermLoading(false);
    }, (err) => {
      setPermError(err.message);
      setPermLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Sync all side modules permissions to DB
  useEffect(() => {
    if (!permLoading) {
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
  }, [permLoading, permissions]);

  // Load Roles
  useEffect(() => {
    const q = query(collection(db, "roles"), orderBy("title", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setRoles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setRolesLoading(false);
    }, (err) => {
      setRolesError(err.message);
      setRolesLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Multi-select helpers
  const allIds = useMemo(() => permissions.map((p) => p.id), [permissions]);
  const handleSelectAll = () => setSelectedIds(allIds);
  const handleDeselectAll = () => setSelectedIds([]);
  const toggleOne = (id) => setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const editAllIds = useMemo(() => permissions.map((p) => p.id), [permissions]);
  const editHandleSelectAll = () => setEditSelectedIds(editAllIds);
  const editHandleDeselectAll = () => setEditSelectedIds([]);
  const editToggleOne = (id) => setEditSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  // Create
  const [submitting, setSubmitting] = useState(false);
  const handleSubmit = async () => {
    if (!roleTitle.trim()) return;
    try {
      setSubmitting(true);
      await addDoc(collection(db, "roles"), {
        title: roleTitle.trim(),
        permission_ids: selectedIds,
        created_at: new Date()
      });
      setRoleTitle("");
      setSelectedIds([]);
      setOpenCreate(false);
      showPopup({ title: "Success", message: `Role "${roleTitle}" created.`, type: "success" });
    } catch (e) {
      showPopup({ title: "Error", message: e.message || "Failed to create role", type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  // Edit
  const onEdit = (role) => {
    setEditRole(role);
    setEditTitle(role?.title || "");
    setEditSelectedIds(role?.permission_ids || []);
    setOpenEdit(true);
  };

  const [updating, setUpdating] = useState(false);
  const handleUpdate = async () => {
    if (!editTitle.trim()) return;
    try {
      setUpdating(true);
      await updateDoc(doc(db, "roles", editRole.id), {
        title: editTitle.trim(),
        permission_ids: editSelectedIds,
        updated_at: new Date()
      });
      setOpenEdit(false);
      setEditRole(null);
      setEditTitle("");
      setEditSelectedIds([]);
      showPopup({ title: "Success", message: "Role updated successfully.", type: "success" });
    } catch (e) {
      showPopup({ title: "Error", message: e.message || "Failed to update role", type: "error" });
    } finally {
      setUpdating(false);
    }
  };

  // Delete
  const [deletingId, setDeletingId] = useState(null);
  const handleDelete = async (role) => {
    if (!role?.id) return;
    showPopup({
      title: "Delete Role?",
      message: `Are you sure you want to delete the role "${role.title}"?`,
      type: "confirm",
      onConfirm: async () => {
        try {
          setDeletingId(role.id);
          await deleteDoc(doc(db, "roles", role.id));
          showPopup({ title: "Deleted", message: "Role removed successfully.", type: "success" });
        } catch (e) {
          showPopup({ title: "Error", message: e.message || "Failed to delete role", type: "error" });
        } finally {
          setDeletingId(null);
        }
      }
    });
  };

  // Filter
  const filteredRoles = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return roles;
    return roles.filter((r) => {
      const inTitle = String(r.title || "").toLowerCase().includes(q);
      const inPerms = (r.permission_ids || []).some((pid) => {
        const p = permissions.find(x => x.id === pid);
        return p?.title?.toLowerCase().includes(q);
      });
      return inTitle || inPerms;
    });
  }, [roles, permissions, searchTerm]);

  const renderPermissionsInline = (permIds = []) => {
    if (!permIds.length) return <span className="text-white/40 italic">No permissions</span>;
    return (
      <div className="flex flex-wrap gap-1.5">
        {permIds.map((pid, i) => {
          const p = permissions.find(x => x.id === pid);
          return (
            <span key={pid || i} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[#D0B079]/10 text-[#D0B079] border border-[#D0B079]/20">
              {p?.title || "Unknown"}
            </span>
          );
        })}
      </div>
    );
  };

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
                Manage Roles
              </h2>
              <p className="mt-2 text-white/50 text-base font-medium">Configure user roles and their associated permissions.</p>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <button
                onClick={() => setOpenCreate(true)}
                className="flex-1 md:flex-none inline-flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-[#D0B079] to-[#b8965f] hover:from-[#b8965f] hover:to-[#a3804d] text-[#071428] rounded-2xl font-bold shadow-[0_0_20px_rgba(251,191,36,0.2)] transition-all hover:-translate-y-1 active:scale-95 text-base"
              >
                <Plus size={20} strokeWidth={3} />
                Add Role
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
                    placeholder="Search roles or permissions..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-white/[0.05] border border-white/[0.1] rounded-2xl pl-12 pr-6 py-4 text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-[#00f2ff]/50 transition-all font-medium"
                  />
                </div>
              </div>
              <div className="text-white text-sm font-bold tracking-wide">
                {filteredRoles.length} Roles Found
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white/[0.02] border-b border-white/[0.08] text-white text-sm font-bold tracking-tight">
                    <th className="px-8 py-6 w-16">#</th>
                    <th className="px-8 py-6 w-48">Role Title</th>
                    <th className="px-8 py-6">Permissions</th>
                    <th className="px-8 py-6 text-right w-40">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04] text-white/90">
                  {rolesLoading ? (
                    <tr><td colSpan={4} className="px-8 py-16 text-center text-white/30 font-bold text-lg">Loading roles...</td></tr>
                  ) : rolesError ? (
                    <tr><td colSpan={4} className="px-8 py-16 text-center text-red-300 font-bold">{rolesError}</td></tr>
                  ) : filteredRoles.length === 0 ? (
                    <tr><td colSpan={4} className="px-8 py-16 text-center text-white/30 font-bold text-lg">No roles found</td></tr>
                  ) : (
                    filteredRoles.map((r, idx) => (
                      <motion.tr
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: idx * 0.05 }}
                        key={r.id}
                        className="hover:bg-white/[0.02] transition-colors group"
                      >
                        <td className="px-8 py-6 text-white font-bold">{idx + 1}</td>
                        <td className="px-8 py-6 font-bold text-[#00f2ff] tracking-wide">{r.title}</td>
                        <td className="px-8 py-6">
                          {renderPermissionsInline(r.permission_ids || r.permissions)}
                        </td>
                        <td className="px-8 py-6 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <button
                              onClick={() => onEdit(r)}
                              className="p-3 bg-[#00f2ff]/10 text-[#00f2ff] hover:bg-[#00f2ff] hover:text-[#071428] rounded-xl transition-all border border-[#00f2ff]/20 shadow-lg shadow-[#00f2ff]/5"
                              title="Edit"
                            >
                              <Edit size={18} strokeWidth={2.5} />
                            </button>
                            <button
                              onClick={() => handleDelete(r)}
                              disabled={deletingId === r.id}
                              className="p-3 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-xl transition-all border border-red-500/20 shadow-lg shadow-red-500/5 disabled:opacity-30"
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
            <div className="p-6 border-t border-white/[0.08] bg-white/[0.02] flex justify-between items-center text-white/40 text-sm">
              <span className="font-bold tracking-wide">Showing {Math.min(filteredRoles.length, pageSize)} of {filteredRoles.length} entries</span>
              <div className="flex gap-2">
                <button className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/[0.05] text-white/20 border border-white/[0.1] disabled:opacity-30 cursor-not-allowed" disabled>&laquo;</button>
                <button className="w-10 h-10 flex items-center justify-center rounded-xl bg-[#00f2ff] text-[#071428] font-black border border-[#00f2ff]/20 shadow-lg shadow-[#00f2ff]/20">1</button>
                <button className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/[0.05] text-white/20 border border-white/[0.1] disabled:opacity-30 cursor-not-allowed" disabled>&raquo;</button>
              </div>
            </div>
          </div>
          {permError && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 p-5 bg-red-500/10 border border-red-500/20 rounded-[1.5rem] text-red-400 font-bold flex items-center gap-3"
            >
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
              {permError}
            </motion.div>
          )}
        </main>
        <Footer />
      </div>

      {/* CREATE MODAL */}
      <AnimatePresence>
        {openCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setOpenCreate(false)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-xl bg-white/10 backdrop-blur-2xl border border-white/20 rounded-2xl shadow-2xl overflow-hidden p-6 max-h-[90vh] flex flex-col"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-white">Create New Role</h3>
                <button onClick={() => setOpenCreate(false)} className="text-white/50 hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pr-2">
                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 block">Role Title</label>
                  <input
                    autoFocus
                    placeholder="e.g. Moderator"
                    value={roleTitle}
                    onChange={(e) => setRoleTitle(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#D0B079]/50"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-white/80 block">Assign Permissions</label>
                    <div className="flex gap-2">
                      <button type="button" onClick={handleSelectAll} className="px-2 py-1 text-xs font-semibold rounded-lg bg-[#D0B079]/20 text-[#D0B079] border border-[#D0B079]/30 hover:bg-[#D0B079]/30">Select All</button>
                      <button type="button" onClick={handleDeselectAll} className="px-2 py-1 text-xs font-semibold rounded-lg bg-white/5 text-white/60 border border-white/10 hover:bg-white/10">Deselect All</button>
                    </div>
                  </div>
                  <GlassMultiSelect
                    loading={permLoading}
                    options={permissions}
                    selected={selectedIds}
                    onToggle={toggleOne}
                    label="permissions"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-white/[0.08]">
                <button onClick={() => setOpenCreate(false)} className="px-6 py-3 rounded-xl text-white/60 hover:text-white font-bold text-sm transition-all">Cancel</button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !roleTitle.trim()}
                  className="px-8 py-3 bg-gradient-to-r from-[#D0B079] to-[#b8965f] hover:from-[#b8965f] hover:to-[#a3804d] text-[#071428] rounded-xl font-bold text-sm shadow-2xl transition-all transform hover:-translate-y-1 active:scale-95 disabled:opacity-50"
                >
                  {submitting ? "Creating..." : "Create Role"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* EDIT MODAL */}
      <AnimatePresence>
        {openEdit && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setOpenEdit(false)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-xl bg-white/10 backdrop-blur-2xl border border-white/20 rounded-2xl shadow-2xl overflow-hidden p-6 max-h-[90vh] flex flex-col"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-white">Edit Role</h3>
                <button onClick={() => setOpenEdit(false)} className="text-white/50 hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pr-2">
                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 block">Role Title</label>
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#D0B079]/50"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-white/80 block">Assign Permissions</label>
                    <div className="flex gap-2">
                      <button type="button" onClick={editHandleSelectAll} className="px-2 py-1 text-xs font-semibold rounded-lg bg-[#D0B079]/20 text-[#D0B079] border border-[#D0B079]/30 hover:bg-[#D0B079]/30">Select All</button>
                      <button type="button" onClick={editHandleDeselectAll} className="px-2 py-1 text-xs font-semibold rounded-lg bg-white/5 text-white/60 border border-white/10 hover:bg-white/10">Deselect All</button>
                    </div>
                  </div>
                  <GlassMultiSelect
                    loading={permLoading}
                    options={permissions}
                    selected={editSelectedIds}
                    onToggle={editToggleOne}
                    label="permissions"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-white/[0.08]">
                <button onClick={() => setOpenEdit(false)} className="px-6 py-3 rounded-xl text-white/60 hover:text-white font-bold text-sm transition-all">Cancel</button>
                <button
                  onClick={handleUpdate}
                  disabled={updating || !editTitle.trim()}
                  className="px-8 py-3 bg-gradient-to-r from-[#D0B079] to-[#b8965f] hover:from-[#b8965f] hover:to-[#a3804d] text-[#071428] rounded-xl font-bold text-sm shadow-2xl transition-all transform hover:-translate-y-1 active:scale-95 disabled:opacity-50"
                >
                  {updating ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

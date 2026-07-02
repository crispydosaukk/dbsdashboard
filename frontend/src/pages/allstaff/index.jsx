import React, { useEffect, useState, useMemo, useRef } from "react";
import { logoBase64 } from "../../logoBase64";
import { getCalculatedTime, calcCalculatedMinutes } from "../../utils/timeRounding";
import { motion, AnimatePresence } from "framer-motion";
import {
  Edit2, Save, Loader2, User, Camera, Briefcase, Shield, Calendar, Eye, EyeOff, Clock, XCircle, Plus,
  Users, Search, X, Building2, Phone, Mail, ShieldCheck, ShieldOff, ChevronRight, Printer, FileText, Download, Bell, Store, PoundSterling, Trash2, Send
} from "lucide-react";
import Header from "../../components/common/header.jsx";
import Sidebar from "../../components/common/sidebar.jsx";
import { db, storage, secondaryAuth, functionsInstance } from "../../lib/firebase";
import { collection, query, onSnapshot, doc, getDoc, updateDoc, where, getDocs, orderBy, setDoc, deleteDoc, writeBatch, addDoc, serverTimestamp } from "firebase/firestore";
import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { usePopup } from "../../context/PopupContext.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { sendPushNotification } from "../../utils/fcm";
import Footer from "../../components/common/footer.jsx";
import DateTime12HrInput from "../../components/common/DateTime12HrInput.jsx";


function getInitials(name) {
  if (!name) return "?";
  return name.split(" ").map(n => n[0]).join("").toUpperCase().substring(0, 2);
}
function Avatar({ src, name, size = "md" }) {
  const [imgUrl, setImgUrl] = useState(null);
  const cls = size === "lg"
    ? "w-20 h-20 rounded-[2rem] text-xl"
    : "w-11 h-11 rounded-xl text-sm";

  useEffect(() => {
    if (src && (src.startsWith('http') || src.startsWith('blob:'))) {
      setImgUrl(src);
    } else if (src) {
      // If it's a Firebase storage path or just a filename
      const imageRef = ref(storage, `profiles/${src}`);
      getDownloadURL(imageRef).then(url => setImgUrl(url)).catch(() => setImgUrl(null));
    }
  }, [src]);

  if (imgUrl) {
    return (
      <img
        src={imgUrl}
        alt={name}
        className={`${cls} object-cover border border-white/10`}
      />
    );
  }
  return (
    <div
      className={`${cls} flex items-center justify-center font-bold text-white border border-white/10`}
      style={{ background: "linear-gradient(135deg, #D0B079, #b8965f)" }}
    >
      {getInitials(name)}
    </div>
  );
}

const InputField = ({ icon: Icon, label, value, onChange, placeholder, type = "text", required = false, autoComplete = "off" }) => {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";

  return (
    <div className="space-y-2 group">
      <label className="text-sm font-medium tracking-wide text-white/70 group-focus-within:text-[#D0B079] transition-colors flex items-center gap-2">
        {Icon && <Icon size={14} className="text-[#D0B079]" />}
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      <div className="relative">
        <input
          type={isPassword ? (showPassword ? "text" : "password") : type}
          value={value || ""}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="w-full px-5 py-4 bg-white/[0.03] border border-white/[0.08] rounded-2xl text-white font-medium placeholder-white/20 focus:outline-none focus:ring-4 focus:ring-[#D0B079]/20 focus:border-[#D0B079]/40 transition-all text-base"
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
          >
            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        )}
      </div>
    </div>
  );
};

export default function AllStaffPage() {
  const { showPopup } = usePopup();
  const { userData } = useAuth();

  // 🔥 ROBUST SUPER ADMIN CHECK
  const isSuper = useMemo(() => {
    if (!userData) return false;
    const roleId = String(userData.role_id || "");
    const roleTitle = String(userData.role_title || userData.role || "").toLowerCase().trim();
    return roleId === "6" || roleTitle === "super admin";
  }, [userData]);

  // ✅ Anyone with the 'all_staff' permission (or super admin) can use all filters freely
  const canFilterAll = useMemo(() => {
    if (isSuper) return true;
    try {
      const perms = JSON.parse(localStorage.getItem("perms") || "[]");
      return perms.map(p => String(p).toLowerCase()).includes("all_staff");
    } catch {
      return false;
    }
  }, [isSuper]);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filterRestaurant, setFilterRestaurant] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDesignation, setFilterDesignation] = useState("all");
  const [restaurantsMap, setRestaurantsMap] = useState({});
  const [restaurantsList, setRestaurantsList] = useState([]);

  // Edit modal state
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const fileInputRef = useRef(null);
  const hasInitialized = useRef(false);
  const [formData, setFormData] = useState({
    full_name: "", email: "", password: "", phone_number: "",
    designation: "", hourly_rate: "", gender: "Male", dob: "",
  });
  const [oldEmail, setOldEmail] = useState("");
  const [oldPassword, setOldPassword] = useState("");

  // Attendance state
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [attendanceData, setAttendanceData] = useState(null);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [sendingProgress, setSendingProgress] = useState("");
  const [showManualAddModal, setShowManualAddModal] = useState(false);
  const [manualAddData, setManualAddData] = useState({ clock_in: "", clock_out: "", edit_reason: "" });
  const [addingAttendance, setAddingAttendance] = useState(false);
  const [attendanceFilters, setAttendanceFilters] = useState({ from: "", to: "" });
  const [reportRestaurantFilter, setReportRestaurantFilter] = useState("all");
  const [reportEmployeeFilter, setReportEmployeeFilter] = useState("all");
  const [editingAttendance, setEditingAttendance] = useState(null);
  const [updatingAttendance, setUpdatingAttendance] = useState(false);

  // Notification state
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [notificationTarget, setNotificationTarget] = useState(null);
  const [sendingNotification, setSendingNotification] = useState(false);
  const [notificationData, setNotificationData] = useState({ title: "", body: "" });

  useEffect(() => {
    setLoading(true);

    const unsubRestaurants = onSnapshot(collection(db, "restaurants"), (snapshot) => {
      const rMap = {};
      const rList = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        rMap[doc.id] = data.restaurant_name || "Unknown Restaurant";
        rList.push({ id: doc.id, name: data.restaurant_name || "Unknown Restaurant" });
      });
      setRestaurantsMap(rMap);
      setRestaurantsList(rList);
    }, (err) => {
      console.error("Failed to load restaurants:", err);
    });
    // Initialization logic moved to separate useEffect below

    const q = query(collection(db, "staff"), orderBy("full_name", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const staffList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setStaff(staffList);
      setLoading(false);

      // --- GLOBAL AUTO-REPAIR ---
      const brokenStaff = staffList.filter(s => !s.restaurant_id && s.created_by);
      if (brokenStaff.length > 0) {
        brokenStaff.forEach(async (s) => {
          try {
            await updateDoc(doc(db, "staff", s.id), {
              restaurant_id: String(s.created_by),
              updated_at: new Date()
            });
          } catch (e) {
            console.error("Global auto-repair failed:", e);
          }
        });
      }
    }, (err) => {
      console.error(err);
      setError("Failed to load staff.");
      setLoading(false);
    });

    return () => {
      unsubscribe();
      unsubRestaurants();
    };
  }, [filterRestaurant, filterStatus, filterDesignation]); // Re-subscribe when filters change if needed, but usually onSnapshot handles it globally

  // 🛡️ ROLE-BASED INITIALIZATION WATCHDOG
  useEffect(() => {
    if (userData && !hasInitialized.current) {
      const roleId = String(userData.role_id || "");
      const roleTitle = String(userData.role_title || userData.role || "").toLowerCase().trim();
      const userIsSuper = roleId === "6" || roleTitle === "super admin";

      // Check all_staff permission
      let hasAllStaffPerm = false;
      try {
        const perms = JSON.parse(localStorage.getItem("perms") || "[]");
        hasAllStaffPerm = perms.map(p => String(p).toLowerCase()).includes("all_staff");
      } catch { /* ignore */ }

      // Super admins and users with all_staff perm see all restaurants by default
      if (userIsSuper || hasAllStaffPerm) {
        setFilterRestaurant("all");
        hasInitialized.current = true;
      } else if (userData?.restaurant_id) {
        setFilterRestaurant(String(userData.restaurant_id));
        hasInitialized.current = true;
      }
    }
  }, [userData]);

  const handleOpenModal = (item) => {
    setEditingId(item.id);
    setFormData({
      full_name: item.full_name || "",
      email: item.email || "",
      password: item.password || "",
      phone_number: item.phone_number || "",
      designation: item.designation || "",
      hourly_rate: item.hourly_rate || "",
      gender: item.gender || "Male",
      dob: item.dob || "",
      restaurant_id: item.restaurant_id || ""
    });
    setOldEmail(item.email || "");
    setOldPassword(item.password || "");
    setImagePreview(null); // Will be handled by Avatar or similar logic if needed
    setImageFile(null);
    setShowModal(true);
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result);
      reader.readAsDataURL(file);
    }
  };


  const handleViewAttendance = async (id, params = {}) => {
    setLoadingAttendance(true);
    setShowAttendanceModal(true);
    try {
      // Index-free query (only one where)
      let q = query(collection(db, "attendance"), where("staff_id", "==", id));

      const snapshot = await getDocs(q);
      let records = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          // Convert all potential timestamps to JS Dates
          clock_in: data.clock_in?.toDate ? data.clock_in.toDate() : data.clock_in,
          clock_out: data.clock_out?.toDate ? data.clock_out.toDate() : data.clock_out,
          date: data.date?.toDate ? data.date.toDate() : data.date,
        };
      });

      // Sort in JavaScript to avoid index requirement
      records.sort((a, b) => {
        const dateA = a.clock_in instanceof Date ? a.clock_in : new Date(a.clock_in || 0);
        const dateB = b.clock_in instanceof Date ? b.clock_in : new Date(b.clock_in || 0);
        return dateB - dateA;
      });

      const staffMember = staff.find(s => s.id === id);
      setAttendanceData({
        staff: staffMember,
        records: records,
        from: params.from || "",
        to: params.to || ""
      });

    } catch (err) {
      console.error("Attendance Fetch Error:", err);
      showPopup({
        title: "Error",
        message: `Failed to fetch attendance: ${err.message || "Unknown error"}`,
        type: "error"
      });
    } finally {
      setLoadingAttendance(false);
    }
  };


  // Recalculate minutes from actual timestamps using calculated (rounded) times
  const calcSessionMinutes = (record) => {
    if (record.location_out === "System Auto-Logout" && (!record.edit_reason || record.edit_reason.trim() === "")) {
      return 0;
    }
    if (record.clock_in && record.clock_out) {
      return calcCalculatedMinutes(record.clock_in, record.clock_out);
    }
    // Active session (no clock_out) = 0 minutes
    return 0;
  };

  const groupedRecords = useMemo(() => {
    if (!attendanceData || !Array.isArray(attendanceData.records)) return [];

    const groups = {};
    attendanceData.records.forEach(record => {
      if (!record || !record.date) return;

      // Group by local date string to ensure sessions from the same local day stay together
      const dateObj = record.date instanceof Date ? record.date : new Date(record.date);
      const dateKey = dateObj.toLocaleDateString('en-CA'); // YYYY-MM-DD

      if (!groups[dateKey]) {
        groups[dateKey] = {
          date: dateObj,
          dateKey: dateKey,
          total_minutes: 0,
          sessions: [],
          first_in: null,
          last_out: null
        };
      }

      const g = groups[dateKey];
      const sessionMin = calcSessionMinutes(record);
      g.total_minutes += sessionMin;
      g.sessions.push({ ...record, _calc_minutes: sessionMin });

      if (record.clock_in) {
        const cin = record.clock_in instanceof Date ? record.clock_in : new Date(record.clock_in);
        if (!g.first_in || cin < g.first_in) g.first_in = cin;
      }

      if (record.clock_out) {
        const cout = record.clock_out instanceof Date ? record.clock_out : new Date(record.clock_out);
        if (!g.last_out || cout > g.last_out) g.last_out = cout;
      }
    });

    return Object.values(groups).sort((a, b) => {
      return new Date(b.dateKey).getTime() - new Date(a.dateKey).getTime();
    });
  }, [attendanceData?.records]);

  const summaryGroupedRecords = useMemo(() => {
    if (!attendanceData || attendanceData.staff.id !== "all" || !Array.isArray(attendanceData.records)) return [];

    const staffGroups = {};
    attendanceData.records.forEach(record => {
      if (!record || (!record.date && !record.clock_in)) return;
      
      // Apply Local Filters
      if (typeof reportRestaurantFilter !== "undefined" && reportRestaurantFilter !== "all" && record.restaurant_id !== reportRestaurantFilter) return;
      if (typeof reportEmployeeFilter !== "undefined" && reportEmployeeFilter !== "all" && record.staff_id !== reportEmployeeFilter) return;

      const staffId = record.staff_id;
      if (!staffGroups[staffId]) {
        const staffMember = typeof staff !== 'undefined' ? staff.find(s => s.id === staffId) : null;
        staffGroups[staffId] = {
          staff_id: staffId,
          staff_name: staffMember?.full_name || "Unknown Staff",
          designation: staffMember?.designation || "Staff",
          hourly_rate: Number(staffMember?.hourly_rate || 0),
          restaurant_name: typeof restaurantsMap !== "undefined" && restaurantsMap[record.restaurant_id] ? restaurantsMap[record.restaurant_id] : "Unknown Restaurant",
          total_minutes: 0,
          sessions: []
        };
      }
      
      const sessionMin = calcSessionMinutes(record);
      staffGroups[staffId].total_minutes += sessionMin;
      staffGroups[staffId].sessions.push({ ...record, _calc_minutes: sessionMin });
    });

    const sortedGroups = Object.values(staffGroups).map(g => {
       g.sessions.sort((a, b) => {
         const dateA = a.clock_in instanceof Date ? a.clock_in : new Date(a.clock_in || 0);
         const dateB = b.clock_in instanceof Date ? b.clock_in : new Date(b.clock_in || 0);
         return dateB - dateA;
       });
       return g;
    });

    return sortedGroups.sort((a, b) => a.staff_name.localeCompare(b.staff_name));
  }, [attendanceData?.records, typeof staff !== 'undefined' ? staff : [], typeof restaurantsMap !== 'undefined' ? restaurantsMap : {}, typeof reportRestaurantFilter !== 'undefined' ? reportRestaurantFilter : null, typeof reportEmployeeFilter !== 'undefined' ? reportEmployeeFilter : null]);

  const toLocalISO = (dateStr) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const tzOffset = date.getTimezoneOffset() * 60000;
    const localISOTime = new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
    return localISOTime;
  };

  const handleAddAttendanceRecord = async (e) => {
    e.preventDefault();
    if (!manualAddData.clock_in || !manualAddData.clock_out) {
      showPopup({ title: "Required", message: "Please provide both clock in and clock out times", type: "warning" });
      return;
    }
    if (!manualAddData.edit_reason || manualAddData.edit_reason.trim() === "") {
      showPopup({ title: "Required", message: "Please provide a reason for manual entry", type: "warning" });
      return;
    }
    setAddingAttendance(true);
    try {
      const cin = new Date(manualAddData.clock_in);
      const cout = new Date(manualAddData.clock_out);
      const totalMinutes = Math.floor((cout - cin) / 60000);
      const user = JSON.parse(localStorage.getItem("user") || "{}");

      const dateObj = new Date(cin);
      dateObj.setHours(0, 0, 0, 0);

      const staffMember = attendanceData?.staff;
      if (!staffMember) throw new Error("Staff member data not available");

      await addDoc(collection(db, "attendance"), {
        staff_id: staffMember.id,
        restaurant_id: staffMember.restaurant_id || user.uid,
        clock_in: cin,
        clock_out: cout,
        date: dateObj,
        total_minutes: Math.max(0, totalMinutes),
        edit_reason: manualAddData.edit_reason.trim(),
        is_manual: true,
        created_at: new Date(),
        audit_log: [{
          action: "created",
          by: user.email || user.uid,
          at: new Date(),
          reason: manualAddData.edit_reason.trim(),
          changes: `Manual record created. Cin: ${cin.toISOString()} Cout: ${cout.toISOString()}`
        }]
      });

      showPopup({ title: "Success", message: "Manual attendance record added", type: "success" });
      setShowManualAddModal(false);
      setManualAddData({ clock_in: "", clock_out: "", edit_reason: "" });
      handleViewAttendance(staffMember.id, attendanceFilters || null);
    } catch (err) {
      console.error(err);
      showPopup({ title: "Error", message: err.message, type: "error" });
    }
    setAddingAttendance(false);
  };

  const handleUpdateAttendanceRecord = async (e) => {
    e.preventDefault();
    if (!editingAttendance) return;
    if (!editingAttendance.edit_reason || editingAttendance.edit_reason.trim() === "") {
      showPopup({ title: "Required", message: "Please provide a reason for editing the time.", type: "warning" });
      return;
    }
    setUpdatingAttendance(true);
    try {
      const cin = new Date(editingAttendance.clock_in);
      const cout = new Date(editingAttendance.clock_out);
      const totalMinutes = Math.floor((cout - cin) / 60000);

      await updateDoc(doc(db, "attendance", editingAttendance.id), {
        clock_in: cin,
        clock_out: cout,
        total_minutes: Math.max(0, totalMinutes),
        edit_reason: editingAttendance.edit_reason.trim(),
        edited_at: serverTimestamp()
      });

      showPopup({ title: "Success", message: "Attendance updated", type: "success" });
      setEditingAttendance(null);
      handleViewAttendance(attendanceData.staff.id);
    } catch (err) {
      console.error(err);
      showPopup({ title: "Error", message: "Failed to update attendance", type: "error" });
    } finally {
      setUpdatingAttendance(false);
    }
  };

  const formatWorkTime = (minutes) => {
    if (!minutes || isNaN(minutes)) return "0h 0m";
    const absMin = Math.abs(Math.round(minutes));
    const h = Math.floor(absMin / 60);
    const m = absMin % 60;
    return `${minutes < 0 ? "-" : ""}${h}h ${m}m`;
  };

  const formatTimeWithDateDiff = (cinStr, coutStr) => {
    if (!coutStr) return "--:--";
    const cout = coutStr instanceof Date ? coutStr : new Date(coutStr);
    return cout.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  };



  const handleAllStaffReport = async () => {
    try {
      setLoading(true);

      // 1. Fetch attendance records based on current restaurant filter
      let q;
      if (filterRestaurant !== "all") {
        q = query(collection(db, "attendance"), where("restaurant_id", "==", filterRestaurant));
      } else {
        q = query(collection(db, "attendance"));
      }

      const snapshot = await getDocs(q);
      let allRecords = snapshot.docs.map(doc => ({
        ...doc.data(),
        clock_in: doc.data().clock_in?.toDate ? doc.data().clock_in.toDate() : doc.data().clock_in,
        clock_out: doc.data().clock_out?.toDate ? doc.data().clock_out.toDate() : doc.data().clock_out,
      }));

      // --- New: Filter by Designation ---
      if (filterDesignation !== "all") {
        const staffIdsWithDesignation = staff
          .filter(s => s.designation === filterDesignation)
          .map(s => s.id);
        allRecords = allRecords.filter(r => staffIdsWithDesignation.includes(r.staff_id));
      }

      // 2. Filter by date range
      if (attendanceFilters.from) {
        const fromDate = new Date(attendanceFilters.from);
        allRecords = allRecords.filter(r => new Date(r.clock_in) >= fromDate);
      }
      if (attendanceFilters.to) {
        const toDate = new Date(attendanceFilters.to);
        toDate.setHours(23, 59, 59, 999);
        allRecords = allRecords.filter(r => new Date(r.clock_in) <= toDate);
      }

      setAttendanceData({
        staff: {
          id: "all",
          full_name: filterRestaurant !== "all" ? `${restaurantsMap[filterRestaurant]} Summary` : "All Restaurants Summary",
          restaurant_name: "DigitalBotSolutions"
        },
        records: allRecords
      });
      setReportRestaurantFilter(filterRestaurant);
      setReportEmployeeFilter("all");
      setShowReportModal(true);
    } catch (err) {
      console.error(err);
      showPopup({ title: "Error", message: "Failed to generate summary report", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (id, currentStatus) => {
    try {
      await updateDoc(doc(db, "staff", id), { is_active: !currentStatus });
      showPopup({ title: "Updated", message: `Account ${currentStatus ? "deactivated" : "activated"}`, type: "success" });
    } catch {
      showPopup({ title: "Error", message: "Failed to update status", type: "error" });
    }
  };

  const handleDeleteStaff = async (id, name) => {
    if (window.confirm(`Are you sure you want to delete ${name}? This action cannot be undone.`)) {
      try {
        await deleteDoc(doc(db, "staff", id));
        showPopup({ title: "Deleted", message: `Account for ${name} has been deleted.`, type: "success" });
      } catch (err) {
        console.error("Delete Error:", err);
        showPopup({ title: "Error", message: "Failed to delete account", type: "error" });
      }
    }
  };

  const handleSendNotification = async (e) => {
    e.preventDefault();
    if (!notificationData.title || !notificationData.body) {
      showPopup({ title: "Required", message: "Please enter both title and message", type: "warning" });
      return;
    }
    setSendingNotification(true);
    try {
      const docRef = await addDoc(collection(db, "notifications"), {
        title: notificationData.title,
        body: notificationData.body,
        staff_id: notificationTarget.id,
        staff_name: notificationTarget.name,
        sent_at: serverTimestamp(),
        status: "pending",
        type: "direct_message",
        fcm_token: notificationTarget.fcmToken || null,
        platform: notificationTarget.platform || "unknown"
      });

      // Trigger Push Notification
      if (notificationTarget.fcmToken) {
        sendPushNotification({
          fcm_token: notificationTarget.fcmToken,
          title: notificationData.title,
          body: notificationData.body,
          priority: "normal",
          type: "direct_message",
          notificationId: docRef.id
        });
      }

      showPopup({ title: "Sent", message: "Notification sent successfully", type: "success" });
      setShowNotificationModal(false);
      setNotificationData({ title: "", body: "" });
    } catch (err) {
      console.error(err);
      showPopup({ title: "Error", message: "Failed to send notification", type: "error" });
    } finally {
      setSendingNotification(false);
    }
  };

  const handleOpenReport = async (staffId) => {
    try {
      setLoading(true);
      const staffMember = staff.find(sm => sm.id === staffId);
      if (!staffMember) throw new Error("Staff member not found");

      // Index-free query
      let q = query(collection(db, "attendance"), where("staff_id", "==", staffId));

      const snapshot = await getDocs(q);
      let records = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          clock_in: data.clock_in?.toDate ? data.clock_in.toDate() : data.clock_in,
          clock_out: data.clock_out?.toDate ? data.clock_out.toDate() : data.clock_out,
          date: data.date?.toDate ? data.date.toDate() : data.date,
        };
      });

      // Filter and Sort in JS
      if (attendanceFilters.from) {
        const fromDate = new Date(attendanceFilters.from);
        records = records.filter(r => new Date(r.clock_in) >= fromDate);
      }
      if (attendanceFilters.to) {
        const toDate = new Date(attendanceFilters.to);
        toDate.setHours(23, 59, 59, 999);
        records = records.filter(r => new Date(r.clock_in) <= toDate);
      }

      records.sort((a, b) => {
        const dateA = a.clock_in instanceof Date ? a.clock_in : new Date(a.clock_in || 0);
        const dateB = b.clock_in instanceof Date ? b.clock_in : new Date(b.clock_in || 0);
        return dateB - dateA;
      });

      setAttendanceData({ staff: staffMember, records: records });
      setShowReportModal(true);
    } catch (err) {
      console.error("Report Fetch Error:", err);
      showPopup({
        title: "Error",
        message: `Failed to load report: ${err.message || "Unknown error"}`,
        type: "error"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEmailReport = async () => {
    setSendingEmail(true);
    setSendingProgress("Generating PDF...");
    try {
      const html2pdfModule = await import('html2pdf.js');
      const html2pdf = html2pdfModule.default || html2pdfModule;

      const reportDate = new Date().toLocaleDateString('en-GB');
      const reportTime = new Date().toLocaleString('en-GB');

      const period = `${attendanceFilters.from || "All Time"} - ${attendanceFilters.to || "Present"}`;

      const isIndividualView = attendanceData?.staff?.id !== "all";
      const isFilterEmployeeView = typeof reportEmployeeFilter !== 'undefined' && reportEmployeeFilter !== "all";

      const selectedRestaurantName = typeof reportRestaurantFilter !== 'undefined' && reportRestaurantFilter !== "all" ? (restaurantsMap[reportRestaurantFilter] || reportRestaurantFilter) : "All Restaurants";
      const selectedEmployee = isIndividualView ? attendanceData.staff : (isFilterEmployeeView ? staff.find(s => s.id === reportEmployeeFilter) : null);
      
      const scopeLabel = isIndividualView 
        ? `${selectedEmployee.full_name} — ${selectedEmployee.restaurant_name || "Restaurant"}`
        : (isFilterEmployeeView 
            ? `${selectedEmployee?.full_name || ""} — ${selectedRestaurantName}` 
            : (typeof reportRestaurantFilter !== 'undefined' && reportRestaurantFilter !== "all" ? selectedRestaurantName : "All Staff"));
      const scope = scopeLabel;

      let tableRows = "";
      let thead = "";

      if (isIndividualView || isFilterEmployeeView) {
        thead = `<tr style="background-color:#1e3a5f;"><th style="padding:10px 12px;color:white;font-size:12px;text-align:left;">Date</th><th style="padding:10px 12px;color:white;font-size:12px;text-align:left;">Clock In</th><th style="padding:10px 12px;color:white;font-size:12px;text-align:left;">Clock Out</th><th style="padding:10px 12px;color:white;font-size:12px;text-align:right;">Duration</th></tr>`;
        const filteredRecs = isIndividualView 
          ? (attendanceData?.records || [])
          : (attendanceData?.records || []).filter(r => {
            if (typeof reportRestaurantFilter !== 'undefined' && reportRestaurantFilter !== "all" && r.restaurant_id !== reportRestaurantFilter) return false;
            if (typeof reportEmployeeFilter !== 'undefined' && reportEmployeeFilter !== "all" && r.staff_id !== reportEmployeeFilter) return false;
            return true;
          });
        const formatTime = (d) => d ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : "-";
        filteredRecs.forEach((rec, idx) => {
          const actualCin = rec.clock_in?.toDate ? rec.clock_in.toDate() : new Date(rec.clock_in);
          const actualCout = rec.clock_out?.toDate ? rec.clock_out.toDate() : (rec.clock_out ? new Date(rec.clock_out) : null);
          
          const calcCin = getCalculatedTime(actualCin);
          const calcCout = actualCout ? getCalculatedTime(actualCout) : null;

          const bg = idx % 2 === 0 ? "#ffffff" : "#f9fafb";
          const calcMins = calcSessionMinutes(rec);
          const hrs = Math.floor(calcMins / 60);
          const mins = calcMins % 60;
           tableRows += `<tr style="background-color:${bg};border-bottom:1px solid #e5e7eb;">
            <td style="padding:10px 12px;font-size:13px;color:#111827;">${actualCin.toLocaleDateString('en-GB')}</td>
            <td style="padding:10px 12px;font-size:13px;color:#374151;">${formatTime(calcCin)}</td>
            <td style="padding:10px 12px;font-size:13px;color:#374151;">${rec.location_out === "System Auto-Logout" && (!rec.edit_reason || rec.edit_reason.trim() === "") ? '--' : formatTime(calcCout)} ${rec.location_out === "System Auto-Logout" && (!rec.edit_reason || rec.edit_reason.trim() === "") ? '<span style="font-size:10px;color:#9ca3af;">(Auto Logouted)</span>' : ''}</td>
            <td style="padding:10px 12px;font-size:13px;color:#374151;text-align:right;">${rec.location_out === "System Auto-Logout" && (!rec.edit_reason || rec.edit_reason.trim() === "") ? '--' : `${hrs}h ${mins}m`}</td>
          </tr>`;
        });
        if (filteredRecs.length > 0) {
          const totalMins = filteredRecs.reduce((s, r) => s + calcSessionMinutes(r), 0);
          const tHrs = Math.floor(totalMins / 60);
          const tMins = totalMins % 60;
          const rate = Number(selectedEmployee?.hourly_rate || 0);
          const totalPay = rate > 0 ? (totalMins / 60) * rate : 0;
          tableRows += `<tr style="background-color:#0b1a3d;">
            <td style="padding:12px 12px;font-size:13px;font-weight:700;color:white;" colspan="2">TOTAL HOURS</td>
            <td style="padding:12px 12px;font-size:14px;font-weight:800;color:#D0B079;text-align:right;" colspan="2">${tHrs}h ${tMins}m</td>
          </tr>`;
          if (rate > 0) {
            tableRows += `<tr style="background-color:#1a2f5a;">
              <td style="padding:12px 12px;font-size:13px;font-weight:700;color:white;" colspan="2">TOTAL PAY (£${rate}/hr)</td>
              <td style="padding:14px 12px;font-size:18px;font-weight:900;color:#D0B079;text-align:right;" colspan="2">£${totalPay.toFixed(2)}</td>
            </tr>`;
          }
        }
      } else {
        thead = `<tr style="background-color:#1e3a5f;"><th style="padding:10px 12px;color:white;font-size:12px;text-align:left;">Date</th><th style="padding:10px 12px;color:white;font-size:12px;text-align:left;">Clock In</th><th style="padding:10px 12px;color:white;font-size:12px;text-align:left;">Clock Out</th><th style="padding:10px 12px;color:white;font-size:12px;text-align:right;">Duration</th></tr>`;

        const grouped = typeof summaryGroupedRecords !== 'undefined' ? summaryGroupedRecords : [];
        grouped.forEach(sg => {
          const rate = Number(sg.hourly_rate || 0);
          const tHrs = Math.floor(sg.total_minutes / 60);
          const tMins = sg.total_minutes % 60;
          const totalPay = rate > 0 ? (sg.total_minutes / 60) * rate : 0;

          tableRows += `<tr style="background-color:#1e3a5f;">
            <td style="padding:10px 12px;font-size:13px;font-weight:800;color:#D0B079;" colspan="3">${sg.staff_name || "Unknown"} &nbsp;<span style="font-weight:400;font-size:11px;color:#9ca3af;">${sg.designation || "Staff"} — ${sg.restaurant_name || ""}</span></td>
            <td style="padding:10px 12px;font-size:12px;color:#9ca3af;text-align:right;">${sg.sessions?.length || 0} session(s)</td>
          </tr>`;

          const sortedSessions = [...(sg.sessions || [])].sort((a, b) => {
            const da = a.clock_in?.toDate ? a.clock_in.toDate() : new Date(a.clock_in);
            const db = b.clock_in?.toDate ? b.clock_in.toDate() : new Date(b.clock_in);
            return db - da;
          });
          const formatTime = (d) => d ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : "-";
          sortedSessions.forEach((sess, idx) => {
            const actualCin = sess.clock_in?.toDate ? sess.clock_in.toDate() : new Date(sess.clock_in);
            const actualCout = sess.clock_out?.toDate ? sess.clock_out.toDate() : (sess.clock_out ? new Date(sess.clock_out) : null);
            
            const calcCin = getCalculatedTime(actualCin);
            const calcCout = actualCout ? getCalculatedTime(actualCout) : null;

            const calcMins = calcSessionMinutes(sess);
            const sHrs = Math.floor(calcMins / 60);
            const sMins = calcMins % 60;
            const bg = idx % 2 === 0 ? "#ffffff" : "#f9fafb";
            tableRows += `<tr style="background-color:${bg};border-bottom:1px solid #e5e7eb;">
              <td style="padding:8px 12px 8px 24px;font-size:12px;color:#374151;">${actualCin.toLocaleDateString('en-GB')}</td>
              <td style="padding:8px 12px;font-size:12px;color:#374151;">${formatTime(calcCin)}</td>
              <td style="padding:8px 12px;font-size:12px;color:#374151;">${sess.location_out === "System Auto-Logout" && (!sess.edit_reason || sess.edit_reason.trim() === "") ? '--' : formatTime(calcCout)} ${sess.location_out === "System Auto-Logout" && (!sess.edit_reason || sess.edit_reason.trim() === "") ? '<span style="font-size:9px;color:#9ca3af;">(Auto Logouted)</span>' : ''}</td>
              <td style="padding:8px 12px;font-size:12px;color:#374151;text-align:right;">${sess.location_out === "System Auto-Logout" && (!sess.edit_reason || sess.edit_reason.trim() === "") ? '--' : `${sHrs}h ${sMins}m`}</td>
            </tr>`;
          });

          tableRows += `<tr style="background-color:#f0f4ff;border-top:1px solid #c7d2fe;border-bottom:3px solid #e5e7eb;">
            <td style="padding:10px 12px 10px 24px;font-size:12px;font-weight:700;color:#1e3a5f;" colspan="2">Subtotal — ${tHrs}h ${tMins}m${rate > 0 ? ` &nbsp;|&nbsp; <span style="color:#b45309;">£${totalPay.toFixed(2)}</span>` : ""}</td>
            <td style="padding:10px 12px;font-size:12px;color:#374151;text-align:right;" colspan="2">${sg.sessions?.length || 0} session(s)</td>
          </tr>
          <tr><td colspan="4" style="padding:4px;background-color:#e5e7eb;"></td></tr>`;
        });
      }

      const reportHtml = `<div style="font-family:Arial,Helvetica,sans-serif;background-color:#ffffff;padding:0;margin:0;color:#111827;">
        <div style="background-color:#0b1a3d;padding:28px 36px;">
          <table style="width:100%;border-collapse:collapse;"><tr>
            <td style="vertical-align:top;"><div style="color:#D0B079;font-size:24px;font-weight:900;">DigitalBotSolutions</div><div style="color:#9ca3af;font-size:10px;letter-spacing:3px;text-transform:uppercase;margin-top:3px;">Staff Attendance Report</div></td>
            <td style="text-align:right; vertical-align:top;">
              <img src="${logoBase64}" style="display:block; width:120px; height:40px; margin-left:auto; object-fit:contain; margin-bottom:5px;" alt="Logo" /><br/>
              <div style="color:white;font-size:18px;font-weight:800;">ATTENDANCE REPORT</div><div style="color:#9ca3af;font-size:11px;margin-top:3px;">Generated: ${reportDate}</div>
            </td>
          </tr></table>
        </div>
        <div style="background-color:#f3f4f6;padding:16px 36px;border-bottom:2px solid #e5e7eb;">
          <table style="width:100%;border-collapse:collapse;"><tr>
            <td><div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Period</div><div style="font-size:13px;font-weight:700;color:#111827;margin-top:2px;">${period}</div></td>
            <td><div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Scope</div><div style="font-size:13px;font-weight:700;color:#111827;margin-top:2px;">${scope}</div></td>
            <td style="text-align:right;"><div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Generated</div><div style="font-size:12px;font-weight:600;color:#374151;margin-top:2px;">${reportTime}</div></td>
          </tr></table>
        </div>
        <div style="padding:28px 36px;">
          <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;">
            <thead>${thead}</thead>
            <tbody>${tableRows || '<tr><td colspan="4" style="text-align:center;padding:20px;color:#6b7280;">No records found for selected period</td></tr>'}</tbody>
          </table>
        </div>
        <div style="background-color:#0b1a3d;padding:16px 36px;text-align:center;">
          <div style="color:#6b7280;font-size:11px;">DigitalBotSolutions - Confidential - DigitalBotSolutions Dashboard</div>
        </div>
      </div>`;

      const opt = {
        margin: [0.3, 0.3, 0.3, 0.3],
        filename: `DigitalBotSolutions_Attendance_${new Date().getTime()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, scrollX: 0, scrollY: 0, windowWidth: 1024 },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
      };

      await new Promise(resolve => setTimeout(resolve, 50));
      const pdfDataUri = await html2pdf().from(reportHtml).set(opt).outputPdf('datauristring');

      setSendingProgress("Sending Email...");
      const sendEmailReportFunc = httpsCallable(functionsInstance, "sendEmailReport");
      const emailHtmlBody = `<div style="font-family:Arial,sans-serif;color:#333;max-width:600px;margin:0 auto;">
          <div style="background:#0b1a3d;padding:30px;border-radius:12px 12px 0 0;text-align:center;">
            <h1 style="color:#D0B079;margin:0;font-size:24px;font-weight:800;">DigitalBotSolutions</h1>
            <p style="color:#9ca3af;margin:8px 0 0;font-size:13px;letter-spacing:2px;text-transform:uppercase;">Staff Attendance Report</p>
          </div>
          <div style="background:#f9fafb;padding:30px;border:1px solid #e5e7eb;">
            <p style="font-size:15px;color:#374151;">Dear Team,</p>
            <p style="font-size:15px;color:#374151;line-height:1.6;">Please find the attendance report attached as a PDF.</p>
            <div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin:20px 0;">
              <table style="width:100%;border-collapse:collapse;">
                <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Period</td><td style="padding:8px 0;font-weight:600;color:#111827;font-size:13px;">${period}</td></tr>
                <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Scope</td><td style="padding:8px 0;font-weight:600;color:#111827;font-size:13px;">${scope}</td></tr>
                <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Generated</td><td style="padding:8px 0;font-weight:600;color:#111827;font-size:13px;">${reportTime}</td></tr>
              </table>
            </div>
          </div>
          <div style="background:#0b1a3d;padding:20px;border-radius:0 0 12px 12px;text-align:center;">
            <p style="color:#6b7280;font-size:12px;margin:0;">DigitalBotSolutions Dashboard - Confidential</p>
          </div>
        </div>`;

      let recipientEmails = "rahulbadugu22@gmail.com, digitalbotsolutions@gmail.com, ataullah3@icloud.com";
      try {
        const globalRef = await getDoc(doc(db, "settings", "global"));
        if (globalRef.exists() && globalRef.data().reportEmails) {
          const activeEmails = globalRef.data().reportEmails.filter(r => r.active).map(r => r.email);
          if (activeEmails.length > 0) {
            recipientEmails = activeEmails.join(", ");
          }
        }
      } catch (err) {
        console.error("Failed to load recipient emails:", err);
      }

      await Promise.all([
        sendEmailReportFunc({
          to: recipientEmails,
          subject: `DigitalBotSolutions Attendance Report - ${reportDate}`,
          htmlBody: emailHtmlBody,
          attachmentUrl: pdfDataUri,
          attachmentName: opt.filename
        })
      ]);

      showPopup({ title: "Email Sent!", message: "Report emailed successfully to all recipients.", type: "success" });
    } catch (error) {
      console.error("Error emailing report:", error);
      showPopup({ title: "Error", message: `Email failed: ${error.message}`, type: "error" });
    } finally {
      setSendingEmail(false);
      setSendingProgress("");
    }
  };

  const handlePrint = () => {
    const reportEl = document.getElementById('report-content');
    if (!reportEl) { window.print(); return; }
    const reportHtml = reportEl.outerHTML;
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Attendance Report</title>
  <style>
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { font-family: Arial, sans-serif; background: white; color: #0f172a; margin: 0; padding: 32px; font-size: 14px; }
    @page { size: A4; margin: 12mm; }
    .flex { display: flex !important; }
    .flex-col { flex-direction: column !important; }
    .flex-1 { flex: 1 1 0% !important; }
    .items-start { align-items: flex-start !important; }
    .items-end { align-items: flex-end !important; }
    .items-center { align-items: center !important; }
    .justify-between { justify-content: space-between !important; }
    .justify-end { justify-content: flex-end !important; }
    .gap-6 { gap: 1.5rem !important; }
    .gap-4 { gap: 1rem !important; }
    .gap-3 { gap: 0.75rem !important; }
    .gap-2 { gap: 0.5rem !important; }
    .space-y-12 > * + * { margin-top: 3rem !important; }
    .w-full { width: 100% !important; }
    .min-w-\\[150px\\] { min-width: 150px !important; }
    .p-12 { padding: 3rem !important; }
    .p-8 { padding: 2rem !important; }
    .p-6 { padding: 1.5rem !important; }
    .p-4 { padding: 1rem !important; }
    .px-4 { padding-left: 1rem !important; padding-right: 1rem !important; }
    .py-4 { padding-top: 1rem !important; padding-bottom: 1rem !important; }
    .py-6 { padding-top: 1.5rem !important; padding-bottom: 1.5rem !important; }
    .py-3 { padding-top: 0.75rem !important; padding-bottom: 0.75rem !important; }
    .py-20 { padding-top: 5rem !important; padding-bottom: 5rem !important; }
    .pb-8 { padding-bottom: 2rem !important; }
    .pt-8 { padding-top: 2rem !important; }
    .mb-8 { margin-bottom: 2rem !important; }
    .mb-10 { margin-bottom: 2.5rem !important; }
    .mb-1 { margin-bottom: 0.25rem !important; }
    .mt-12 { margin-top: 3rem !important; }
    .mt-1 { margin-top: 0.25rem !important; }
    .text-3xl { font-size: 1.875rem !important; line-height: 2.25rem !important; }
    .text-2xl { font-size: 1.5rem !important; line-height: 2rem !important; }
    .text-xl { font-size: 1.25rem !important; }
    .text-lg { font-size: 1.125rem !important; }
    .text-sm { font-size: 0.875rem !important; }
    .text-xs { font-size: 0.75rem !important; }
    .font-black { font-weight: 900 !important; }
    .font-bold { font-weight: 700 !important; }
    .font-semibold { font-weight: 600 !important; }
    .font-medium { font-weight: 500 !important; }
    .font-mono { font-family: 'Courier New', monospace !important; }
    .uppercase { text-transform: uppercase !important; }
    .tracking-tighter { letter-spacing: -0.05em !important; }
    .tracking-widest { letter-spacing: 0.1em !important; }
    .italic { font-style: italic !important; }
    .text-right { text-align: right !important; }
    .text-center { text-align: center !important; }
    .border-b-2 { border-bottom: 2px solid !important; }
    .border-t-2 { border-top: 2px solid !important; }
    .border-t { border-top: 1px solid !important; }
    .border { border: 1px solid !important; }
    .rounded-lg { border-radius: 0.5rem !important; }
    .divide-y > * + * { border-top: 1px solid #f1f5f9 !important; }
    .bg-slate-50 { background-color: #f8fafc !important; }
    .bg-white { background-color: #ffffff !important; }
    table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
    th, td { padding: 10px 14px; text-align: left; vertical-align: middle; }
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }
    thead tr { border-top: 2px solid #0f172a; border-bottom: 2px solid #0f172a; background-color: #f8fafc !important; }
    tbody tr { border-bottom: 1px solid #f1f5f9; page-break-inside: avoid; }
    tfoot tr { border-top: 2px solid #0f172a; background-color: #f8fafc !important; }
    .no-print { display: none !important; }
  </style>
</head>
<body>
  ${reportHtml}
  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); window.close(); }, 400);
    };
  <\/script>
</body>
</html>`);
    printWindow.document.close();
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.full_name || !formData.email) {
      showPopup({ title: "Required", message: "Name and Email are mandatory", type: "warning" });
      return;
    }

    setSaving(true);
    try {
      let photoUrl = imagePreview;

      if (imageFile) {
        const fileRef = ref(storage, `profiles/${editingId || Date.now()}`);
        await uploadBytes(fileRef, imageFile);
        photoUrl = await getDownloadURL(fileRef);
      }

      const staffData = {
        full_name: formData.full_name,
        email: formData.email,
        phone_number: formData.phone_number || "",
        designation: formData.designation || "",
        hourly_rate: formData.hourly_rate || "",
        gender: formData.gender || "Male",
        dob: formData.dob || "",
        restaurant_id: formData.restaurant_id || "",
        profile_image: photoUrl || "",
        updated_at: serverTimestamp()
      };

      if (formData.password) {
        staffData.password = formData.password;
      }

      // Auth Sync Logic
      const emailChanged = formData.email !== oldEmail;
      const passwordChanged = formData.password && formData.password !== oldPassword;

      if (emailChanged || passwordChanged) {
        try {
          const updateFn = httpsCallable(functionsInstance, 'updateUserCredentials');
          const payload = { uid: editingId, email: formData.email };
          if (passwordChanged) payload.password = formData.password;

          await updateFn(payload);
        } catch (authSyncErr) {
          console.error("Auth Sync Error:", authSyncErr);
          // Revert for consistency in Firestore
          staffData.email = oldEmail;
          if (staffData.password) staffData.password = oldPassword;
          showPopup({
            title: "Auth Sync Warning",
            message: `Could not update login credentials: ${authSyncErr.message}. Profile updated without changing login email/password.`,
            type: "warning"
          });
        }
      }

      await updateDoc(doc(db, "staff", editingId), staffData);

      showPopup({ title: "Success", message: "Staff profile updated successfully", type: "success" });
      setShowModal(false);
    } catch (err) {
      console.error("Save Error:", err);
      showPopup({ title: "Error", message: "Failed to save changes", type: "error" });
    } finally {
      setSaving(false);
    }
  };


  const restaurants = useMemo(() => {
    return restaurantsList;
  }, [restaurantsList]);

  const designations = useMemo(() => {
    const set = new Set();
    staff.forEach(s => { if (s.designation) set.add(s.designation); });
    return Array.from(set).sort();
  }, [staff]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return staff.filter((s) => {
      const rId = s.restaurant_id || s.created_by;
      const rName = (rId ? restaurantsMap[rId] : null) || s.restaurant_name || "";
      const matchSearch = !q || s.full_name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q) ||
        s.designation?.toLowerCase().includes(q) || s.employee_id?.toLowerCase().includes(q);
      const matchRestaurant = filterRestaurant === "all" || String(s.restaurant_id) === String(filterRestaurant) || String(s.created_by) === String(filterRestaurant);
      const matchStatus = filterStatus === "all" || (filterStatus === "active" && s.is_active) || (filterStatus === "inactive" && !s.is_active);
      const matchDesignation = filterDesignation === "all" || s.designation === filterDesignation;
      return matchSearch && matchRestaurant && matchStatus && matchDesignation;
    });
  }, [staff, search, filterRestaurant, filterStatus, filterDesignation, restaurantsMap]);

  const grouped = useMemo(() => {
    const map = new Map();
    filtered.forEach((s) => {
      const rId = s.restaurant_id || s.created_by;
      const key = (rId ? restaurantsMap[rId] : null) || s.restaurant_name || "Unknown Restaurant";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(s);
    });
    return Array.from(map.entries());
  }, [filtered, restaurantsMap]);

  return (
    <div className="min-h-screen flex flex-col bg-[#071428] font-sans text-white overflow-x-hidden print:overflow-visible print:h-auto print:min-h-0 print:block">
      <div className="print:hidden">
        <Header onToggleSidebar={() => setSidebarOpen(s => !s)} darkMode={true} />
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      </div>
      <div className={`flex-1 flex flex-col transition-all duration-500 ease-in-out ${sidebarOpen ? "lg:pl-[300px]" : "lg:pl-0"} print:block`}>
        <main className={`flex-1 pt-28 pb-20 px-6 sm:px-10 transition-all duration-500 print:hidden ${sidebarOpen ? "lg:px-12" : "lg:px-20"}`}>
          <div className="max-w-7xl mx-auto">

            {/* Page Header */}
            <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
              <div>
                <div className="flex items-center gap-3 text-[#D0B079] font-bold text-sm mb-3">
                  <Shield size={16} /><span>Super Admin Access</span>
                </div>
                <h1 className="text-4xl font-semibold tracking-tight text-white flex items-center gap-4">
                  All Staff Members
                  <span className="px-4 py-1 bg-white/5 border border-white/10 rounded-full text-sm font-bold text-white/40 tracking-wider">{staff.length} Total</span>
                </h1>
                <p className="text-white/40 text-base font-medium mt-2">All restaurants combined — view, edit and manage status</p>
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
                <div className="flex items-center gap-2 bg-white/5 p-1 rounded-2xl border border-white/10">
                  <input
                    type="date"
                    value={attendanceFilters.from}
                    onChange={(e) => setAttendanceFilters(p => ({ ...p, from: e.target.value }))}
                    className="bg-transparent border-none text-[12px] font-bold text-white/50 focus:ring-0 px-3 py-1 cursor-pointer"
                  />
                  <div className="w-px h-4 bg-white/10" />
                  <input
                    type="date"
                    value={attendanceFilters.to}
                    onChange={(e) => setAttendanceFilters(p => ({ ...p, to: e.target.value }))}
                    className="bg-transparent border-none text-[12px] font-bold text-white/50 focus:ring-0 px-3 py-1 cursor-pointer"
                  />
                </div>
                <button
                  onClick={handleAllStaffReport}
                  className="px-6 py-3.5 rounded-xl text-[15px] font-bold bg-white/5 text-white/70 border border-white/10 hover:bg-white/10 transition-all flex items-center gap-2"
                >
                  <Printer size={18} /> Summary Report
                </button>
                <span className="px-6 py-3.5 rounded-xl text-[15px] font-bold bg-white/5 text-[#D0B079] border border-[#D0B079]/20">
                  {restaurants.length} Restaurants
                </span>
              </div>
            </motion.div>

            {/* Filters */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className="flex flex-col sm:flex-row gap-3 mb-8">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, email, designation, restaurant..."
                  className="w-full pl-10 pr-10 py-3 rounded-2xl text-sm bg-white/5 border border-white/10 text-white placeholder:text-white/25 focus:outline-none focus:border-[#D0B079]/50 transition-all" />
                {search && (
                  <button onClick={() => setSearch("")} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white">
                    <X size={14} />
                  </button>
                )}
              </div>
              <select value={filterRestaurant} onChange={(e) => setFilterRestaurant(e.target.value)}
                disabled={!canFilterAll}
                className="px-4 py-3 rounded-2xl text-sm bg-white/5 border border-white/10 text-white/80 focus:outline-none focus:border-[#D0B079]/50 transition-all cursor-pointer [&>option]:bg-[#0b1a3d] [&>option]:text-white disabled:opacity-50 disabled:cursor-not-allowed">
                {canFilterAll && <option value="all">All restaurants</option>}
                {restaurants.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
                className="px-4 py-3 rounded-2xl text-sm bg-white/5 border border-white/10 text-white/80 focus:outline-none focus:border-[#D0B079]/50 transition-all cursor-pointer [&>option]:bg-[#0b1a3d] [&>option]:text-white">
                <option value="all">All status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <select value={filterDesignation} onChange={(e) => setFilterDesignation(e.target.value)}
                className="px-4 py-3 rounded-2xl text-sm bg-white/5 border border-white/10 text-white/80 focus:outline-none focus:border-[#D0B079]/50 transition-all cursor-pointer [&>option]:bg-[#0b1a3d] [&>option]:text-white">
                <option value="all">All roles</option>
                {designations.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </motion.div>

            {/* Content */}
            {loading ? (
              <div className="flex items-center justify-center py-32">
                <div className="text-center">
                  <div className="w-12 h-12 border-4 border-[#D0B079]/30 border-t-[#D0B079] rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-white/40 text-sm font-medium">Loading all staff data...</p>
                </div>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-32 text-center">
                <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 mb-4"><X size={32} className="text-red-400" /></div>
                <p className="text-white/60 font-semibold mb-2">{error}</p>
                <button onClick={() => window.location.reload()} className="mt-4 px-6 py-2.5 rounded-xl text-sm font-bold bg-[#D0B079]/20 text-[#D0B079] border border-[#D0B079]/30 hover:bg-[#D0B079]/30 transition-all">Retry</button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32 text-center">
                <Users size={48} className="text-white/10 mb-4" />
                <p className="text-white/40 font-semibold">No staff members found</p>
                <p className="text-white/25 text-sm mt-1">Try adjusting your filters</p>
              </div>
            ) : (
              <div className="space-y-10">
                {grouped.map(([restaurantName, members], gi) => (
                  <motion.div key={restaurantName} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: gi * 0.06 }}>
                    {/* Restaurant Group Header */}
                    <div className="flex items-center gap-3 mb-5">
                      <div className="p-2 rounded-lg bg-white/5 border border-white/10"><Building2 size={16} className="text-[#D0B079]" /></div>
                      <div>
                        <h2 className="text-white font-bold text-lg">{restaurantName}</h2>
                        <p className="text-white/30 text-sm font-medium">{members.length} member{members.length !== 1 ? "s" : ""}</p>
                      </div>
                      <div className="flex-1 h-px bg-white/5 ml-2" />
                    </div>

                    {/* Staff Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-4">
                      {members.map((s, si) => (
                        <motion.div key={s.id}
                          initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: gi * 0.06 + si * 0.04 }}
                          className="group relative rounded-3xl border border-white/[0.08] bg-white/[0.02] p-5 hover:bg-white/[0.04] hover:border-[#D0B079]/25 transition-all duration-500 flex flex-col sm:flex-row sm:items-center justify-between gap-6"
                        >
                          <div className="flex items-center gap-5 flex-1 min-w-0">
                            <div className="relative shrink-0">
                              <Avatar src={s.profile_image} name={s.full_name} size="md" />
                              <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-[#071428] ${s.is_active ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                <p className="text-white font-bold text-lg truncate tracking-tight">{s.full_name}</p>
                                <span className={`shrink-0 flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-bold border ${s.is_active ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"
                                  }`}>
                                  {s.is_active ? "Active" : "Inactive"}
                                </span>
                              </div>
                              <div className="flex items-center gap-3">
                                <p className="text-[#D0B079] text-[11px] font-bold flex items-center gap-1.5 bg-[#D0B079]/5 px-3 py-1 rounded-md">
                                  <Briefcase size={11} />{s.designation || "Member"}
                                </p>
                                {s.hourly_rate && (
                                  <p className="text-emerald-400 text-[11px] font-bold flex items-center gap-1.5 bg-emerald-400/5 px-3 py-1 rounded-md border border-emerald-400/10">
                                    <PoundSterling size={11} />£{s.hourly_rate}/hr
                                  </p>
                                )}
                                <span className="text-white/20 text-[11px] font-bold">{s.employee_id}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-4 pt-4 sm:pt-0 border-t sm:border-t-0 border-white/5">
                            <div className="flex xl:flex flex-col gap-1.5 min-w-0 mr-4">
                              <div className="flex items-center gap-2 text-white/40 text-[11px] font-medium">
                                <Mail size={12} className="shrink-0 text-[#D0B079]/40" /><span className="truncate max-w-[150px]">{s.email || "—"}</span>
                              </div>
                              <div className="flex items-center gap-2 text-white/40 text-[11px] font-medium">
                                <Phone size={12} className="shrink-0 text-[#D0B079]/40" /><span>{s.phone_number || "—"}</span>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-3">
                              <div className="flex items-center gap-2 bg-white/5 p-1 rounded-xl border border-white/10 no-print">
                                <input
                                  type="date"
                                  value={attendanceFilters.from}
                                  onChange={(e) => setAttendanceFilters(p => ({ ...p, from: e.target.value }))}
                                  className="bg-transparent border-none text-[11px] font-bold text-white/40 focus:ring-0 px-2 py-1 cursor-pointer"
                                />
                                <div className="w-px h-3 bg-white/10" />
                                <input
                                  type="date"
                                  value={attendanceFilters.to}
                                  onChange={(e) => setAttendanceFilters(p => ({ ...p, to: e.target.value }))}
                                  className="bg-transparent border-none text-[11px] font-bold text-white/40 focus:ring-0 px-2 py-1 cursor-pointer"
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleViewAttendance(s.id, attendanceFilters)}
                                  className="p-3 bg-white/5 hover:bg-blue-500/20 text-white/30 hover:text-blue-400 rounded-xl border border-white/5 transition-all"
                                  title="View attendance"
                                >
                                  <Eye size={18} />
                                </button>
                                <button
                                  onClick={() => handleOpenReport(s.id, attendanceFilters)}
                                  className="p-3 bg-white/5 hover:bg-emerald-500/20 text-white/30 hover:text-emerald-400 rounded-xl border border-white/5 transition-all"
                                  title="Generate report"
                                >
                                  <Printer size={18} />
                                </button>
                                <button
                                  onClick={() => {
                                    setNotificationTarget({ id: s.id, name: s.full_name, fcmToken: s.fcmToken, platform: s.platform });
                                    setShowNotificationModal(true);
                                  }}
                                  className="p-3 bg-white/5 hover:bg-amber-500/20 text-white/30 hover:text-amber-400 rounded-xl border border-white/5 transition-all"
                                  title="Send notification"
                                >
                                  <Bell size={18} />
                                </button>
                                <button
                                  onClick={() => handleOpenModal(s)}
                                  className="p-3 bg-white/5 hover:bg-[#D0B079]/20 text-white/30 hover:text-[#D0B079] rounded-xl border border-white/5 transition-all"
                                  title="Edit profile"
                                >
                                  <Edit2 size={18} />
                                </button>
                                <button
                                  onClick={() => handleDeleteStaff(s.id, s.full_name)}
                                  className="p-3 bg-white/5 hover:bg-rose-500/20 text-white/30 hover:text-rose-500 rounded-xl border border-white/5 transition-all"
                                  title="Delete account"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            </div>
                            <span className="text-[#D0B079] text-[10px] font-bold bg-white/5 px-2 py-1 rounded-lg border border-white/5">{s.employee_id}</span>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </main>
        <Footer />
      </div>

      {/* Attendance Modal */}
      <AnimatePresence>
        {showAttendanceModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAttendanceModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-xl"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 40 }}
              transition={{ type: "spring", damping: 25 }}
              className="relative w-full max-w-5xl bg-[#0b1a3d] border border-white/10 rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="bg-white/5 px-10 py-8 border-b border-white/10 flex items-center justify-between shrink-0">
                <div>
                  <div className="flex items-center gap-3 text-[#D0B079] font-bold tracking-wider mb-2">
                    <Clock size={14} />
                    <span className="text-[10px] font-semibold tracking-widest uppercase">Attendance Intelligence</span>
                  </div>
                  <h2 className="text-3xl font-semibold tracking-tight">
                    {attendanceData?.staff?.full_name}'s Activity
                  </h2>
                </div>
                <div className="flex items-center gap-4">
                  <div className="hidden md:flex items-center gap-6 px-6 py-3 bg-white/5 rounded-2xl border border-white/10">
                    <div className="text-center">
                      <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-0.5">Total Hours</p>
                      <p className="text-lg font-black text-[#D0B079]">
                        {formatWorkTime(groupedRecords.reduce((sum, g) => sum + g.total_minutes, 0))}
                      </p>
                    </div>
                    <div className="w-px h-8 bg-white/10" />
                    <div className="text-center">
                      <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-0.5">Sessions</p>
                      <p className="text-lg font-black text-white">{attendanceData?.records?.length || 0}</p>
                    </div>
                  </div>
                  <button onClick={() => setShowAttendanceModal(false)} className="p-4 bg-white/5 hover:bg-rose-500/20 text-white/50 hover:text-rose-500 rounded-2xl transition-all">
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div className="p-10 space-y-8 overflow-y-auto custom-scrollbar flex-1">
                {/* Filters */}
                <div className="flex flex-col md:flex-row items-end gap-6 bg-white/[0.02] p-6 rounded-[2rem] border border-white/5 shadow-inner">
                  <div className="space-y-2 flex-1 w-full">
                    <label className="text-[10px] font-black text-white/30 tracking-widest ml-1 uppercase">Start Date</label>
                    <input
                      type="date"
                      value={attendanceFilters.from}
                      onChange={(e) => setAttendanceFilters(p => ({ ...p, from: e.target.value }))}
                      className="w-full px-5 py-3.5 bg-white/[0.03] border border-white/[0.08] rounded-2xl text-white font-semibold focus:outline-none focus:border-[#D0B079]/40 focus:ring-4 focus:ring-[#D0B079]/5 transition-all"
                    />
                  </div>
                  <div className="space-y-2 flex-1 w-full">
                    <label className="text-[10px] font-black text-white/30 tracking-widest ml-1 uppercase">End Date</label>
                    <input
                      type="date"
                      value={attendanceFilters.to}
                      onChange={(e) => setAttendanceFilters(p => ({ ...p, to: e.target.value }))}
                      className="w-full px-5 py-3.5 bg-white/[0.03] border border-white/[0.08] rounded-2xl text-white font-semibold focus:outline-none focus:border-[#D0B079]/40 focus:ring-4 focus:ring-[#D0B079]/5 transition-all"
                    />
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                    <button
                      onClick={() => handleViewAttendance(attendanceData?.staff?.id, attendanceFilters)}
                      className="flex-1 px-10 py-4 bg-[#D0B079] text-slate-900 font-bold rounded-2xl text-xs tracking-widest hover:bg-[#b8965f] shadow-xl shadow-[#D0B079]/10 transition-all active:scale-95 whitespace-nowrap"
                    >
                      REFRESH DATA
                    </button>
                    <button
                      onClick={() => setShowManualAddModal(true)}
                      className="flex-1 px-8 py-4 bg-white/5 border border-white/10 text-white font-bold rounded-2xl text-xs tracking-widest hover:bg-white/10 transition-all active:scale-95 flex items-center justify-center gap-2 whitespace-nowrap"
                    >
                      <Plus size={16} /> MANUAL ADD
                    </button>
                  </div>
                </div>

                {/* Table Container */}
                <div className="overflow-hidden rounded-[2.5rem] border border-white/5 bg-white/[0.01] shadow-2xl">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-white/5">
                        <th className="px-8 py-5 text-[10px] font-black tracking-widest text-white/30 uppercase">Timeline</th>
                        <th className="px-8 py-5 text-[10px] font-black tracking-widest text-white/30 uppercase">Clock-In</th>
                        <th className="px-8 py-5 text-[10px] font-black tracking-widest text-white/30 uppercase">Clock-Out</th>
                        <th className="px-8 py-5 text-[10px] font-black tracking-widest text-white/30 uppercase text-right">Duration</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {loadingAttendance ? (
                        <tr>
                          <td colSpan="4" className="px-6 py-32 text-center">
                            <Loader2 className="animate-spin inline-block text-[#D0B079] mb-4" size={48} />
                            <p className="text-white/20 font-black tracking-[0.2em] text-xs uppercase">Synchronizing Logs...</p>
                          </td>
                        </tr>
                      ) : groupedRecords.length > 0 ? (
                        groupedRecords.map((group) => (
                          <React.Fragment key={group.dateKey}>
                            {/* Day Header Row */}
                            <tr className="bg-[#D0B079]/5 border-y border-[#D0B079]/10">
                              <td colSpan="3" className="px-8 py-4">
                                <div className="flex items-center gap-3">
                                  <Calendar size={14} className="text-[#D0B079]" />
                                  <span className="text-sm font-black text-white tracking-wide">
                                    {new Date(group.date).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                                  </span>
                                  <span className="px-2 py-0.5 bg-[#D0B079]/20 text-[#D0B079] text-[9px] font-black rounded-md uppercase tracking-widest">
                                    {group.sessions.length} {group.sessions.length === 1 ? 'Session' : 'Sessions'}
                                  </span>
                                </div>
                              </td>
                              <td className="px-8 py-4 text-right">
                                <span className="text-[10px] font-black text-white/40 uppercase tracking-widest mr-3">Day Total:</span>
                                <span className="text-sm font-black text-[#D0B079]">{formatWorkTime(group.total_minutes)}</span>
                                {group.total_minutes !== group.sessions.reduce((s, r) => s + (r.total_minutes || 0), 0) && group.sessions.some(s => s.total_minutes > 0) && (
                                  <span className="text-[8px] font-bold text-amber-400/60 ml-2" title="Recalculated from timestamps">(corrected)</span>
                                )}
                              </td>
                            </tr>

                            {/* Session Rows */}
                            {group.sessions.map((session, sIdx) => {
                              if (editingAttendance?.id === session.id) {
                                return (
                                  <tr key={session.id} className="bg-[#D0B079]/5 border-y border-[#D0B079]/20 relative">
                                    <td colSpan="3" className="px-8 py-6">
                                      <div className="flex flex-col gap-5">
                                        <div className="flex items-center gap-2 text-[#D0B079] font-bold text-xs uppercase tracking-widest">
                                          <Edit2 size={14} /> Update Session Times
                                        </div>
                                        <div className="flex flex-col md:flex-row gap-6">
                                          <div className="flex-1 space-y-2">
                                            <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Clock In</label>
                                            <DateTime12HrInput
                                              value={editingAttendance.clock_in}
                                              onChange={(val) => setEditingAttendance(p => ({ ...p, clock_in: val }))}
                                              isGold
                                            />
                                          </div>
                                          <div className="flex-1 space-y-2">
                                            <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Clock Out</label>
                                            <DateTime12HrInput
                                              value={editingAttendance.clock_out}
                                              onChange={(val) => setEditingAttendance(p => ({ ...p, clock_out: val }))}
                                              isGold
                                            />
                                          </div>
                                        </div>
                                        <div className="space-y-2">
                                          <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Reason for Edit <span className="text-rose-500">*</span></label>
                                          <input
                                            type="text"
                                            value={editingAttendance.edit_reason || ""}
                                            onChange={(e) => setEditingAttendance(p => ({ ...p, edit_reason: e.target.value }))}
                                            placeholder="e.g. Forgot to clock out, System error..."
                                            className="w-full bg-white/5 border border-[#D0B079]/30 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#D0B079] transition-all"
                                          />
                                        </div>
                                        <div className="flex justify-end gap-3 mt-2">
                                          <button
                                            onClick={() => setEditingAttendance(null)}
                                            className="px-6 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 text-xs font-bold uppercase tracking-widest transition-all"
                                          >
                                            Cancel
                                          </button>
                                          <button
                                            onClick={handleUpdateAttendanceRecord}
                                            disabled={updatingAttendance}
                                            className="px-6 py-2.5 rounded-xl bg-[#D0B079] hover:bg-[#b8965f] text-slate-900 text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2 disabled:opacity-50"
                                          >
                                            {updatingAttendance ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Changes
                                          </button>
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              }

                              return (
                                <tr key={session.id} className="hover:bg-white/[0.02] transition-colors group relative">
                                  <td className="px-8 py-5">
                                    <div className="flex flex-col gap-2">
                                      <div className="flex items-center gap-3">
                                        <div className="w-1.5 h-8 bg-white/5 rounded-full" />
                                        <span className="text-white/20 font-black text-[10px] tracking-widest uppercase">Session #{group.sessions.length - sIdx}</span>
                                      </div>
                                      {session.edit_reason && (
                                        <div className="ml-4 flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 p-2 rounded-xl max-w-[200px]">
                                          <Edit2 size={10} className="text-amber-500 shrink-0 mt-0.5" />
                                          <div>
                                            <p className="text-[8px] font-black uppercase tracking-widest text-amber-500/50 mb-0.5">Edit Reason</p>
                                            <p className="text-[10px] font-medium text-amber-500/90 leading-tight">{session.edit_reason}</p>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-8 py-5">
                                    <div className="flex items-center gap-3">
                                      <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/20" />
                                      <span className="text-white font-mono text-base font-medium">
                                        {session.clock_in ? new Date(session.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : "--:--"}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-8 py-5">
                                    <div className="flex flex-col gap-1">
                                      <div className="flex items-center gap-3">
                                        <div className="w-2 h-2 rounded-full bg-rose-500 shadow-lg shadow-rose-500/20" />
                                        <span className="text-white font-mono text-base font-medium flex items-center gap-2">
                                          {session.location_out === "System Auto-Logout" && (!session.edit_reason || session.edit_reason.trim() === "")
                                            ? <><span className="text-white/40">--</span> <span className="text-[10px] uppercase tracking-widest bg-white/5 px-2 py-1 rounded-md text-white/50 border border-white/10">(Auto Logouted)</span></>
                                            : formatTimeWithDateDiff(session.clock_in, session.clock_out)
                                          }
                                        </span>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-8 py-5 text-right">
                                    <div className="flex items-center justify-end gap-6">
                                      <div className="flex flex-col items-end">
                                        <span className={`text-sm font-black tracking-tight ${session.location_out === "System Auto-Logout" && (!session.edit_reason || session.edit_reason.trim() === "") ? 'text-white/40' : (session._calc_minutes || 0) === 0 ? 'text-rose-400/60' : 'text-[#D0B079]'}`}>
                                          {session.location_out === "System Auto-Logout" && (!session.edit_reason || session.edit_reason.trim() === "")
                                            ? '--'
                                            : formatWorkTime(session._calc_minutes != null ? session._calc_minutes : session.total_minutes)
                                          }
                                        </span>
                                        {(session._calc_minutes != null ? session._calc_minutes : session.total_minutes) === 0 && !(session.location_out === "System Auto-Logout" && (!session.edit_reason || session.edit_reason.trim() === "")) && (
                                          <span className="text-[8px] font-black text-rose-500/40 uppercase tracking-widest mt-0.5">{session.clock_out ? 'Short Session' : 'Active'}</span>
                                        )}
                                      </div>
                                      <button
                                        onClick={() => {
                                          setEditingAttendance({
                                            id: session.id,
                                            clock_in: toLocalISO(session.clock_in),
                                            clock_out: toLocalISO(session.clock_out),
                                            edit_reason: session.edit_reason || ""
                                          });
                                        }}
                                        className="p-2.5 bg-white/5 text-white/20 rounded-xl hover:bg-[#D0B079]/20 hover:text-[#D0B079] hover:border-[#D0B079]/30 border border-transparent transition-all opacity-0 group-hover:opacity-100"
                                        title="Edit this session"
                                      >
                                        <Edit2 size={14} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                            {/* Spacer between days */}
                            <tr className="h-4"><td colSpan="4"></td></tr>
                          </React.Fragment>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="4" className="px-6 py-32 text-center text-white/10 font-black tracking-[0.2em] text-xs uppercase">
                            No logs found for this period
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowModal(false)} className="absolute inset-0 bg-black/80 backdrop-blur-xl" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 40 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 40 }} transition={{ type: "spring", damping: 25 }}
              className="relative w-full max-w-3xl bg-[#0b1a3d] border border-white/10 rounded-[3rem] shadow-2xl overflow-hidden">

              {/* Modal Header */}
              <div className="bg-white/5 px-10 py-8 border-b border-white/10 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 text-[#D0B079] font-bold tracking-widest uppercase text-[10px] mb-2">
                    <Edit2 size={12} /><span>Edit Staff Account</span>
                  </div>
                  <h2 className="text-2xl font-semibold tracking-tight">Update Profile</h2>
                </div>
                <button onClick={() => setShowModal(false)} className="p-3 bg-white/5 hover:bg-rose-500/20 text-white/50 hover:text-rose-500 rounded-2xl transition-all">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSave} className="p-10 overflow-y-auto max-h-[70vh]" autoComplete="off">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">

                  {/* Avatar */}
                  <div className="lg:col-span-4 flex flex-col items-center">
                    <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                      <div className="h-44 w-44 rounded-[2rem] overflow-hidden border-2 border-dashed border-white/20 group-hover:border-[#D0B079] transition-all bg-white/[0.02] flex items-center justify-center">
                        {imagePreview ? (
                          <img src={imagePreview} alt="Preview" className="h-full w-full object-cover group-hover:scale-110 transition-transform duration-500" />
                        ) : (
                          <div className="flex flex-col items-center text-white/10 group-hover:text-[#D0B079] transition-colors">
                            <Camera size={40} strokeWidth={1} />
                            <span className="text-[10px] font-semibold uppercase tracking-widest mt-3">Change Photo</span>
                          </div>
                        )}
                      </div>
                      <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 px-5 py-2 bg-[#D0B079] text-slate-900 rounded-xl font-semibold text-[10px] uppercase tracking-widest shadow-xl group-hover:scale-105 transition-all">
                        Select Photo
                      </div>
                      <input type="file" ref={fileInputRef} onChange={handleImageChange} accept="image/*" className="hidden" />
                    </div>

                    <div className="mt-14 w-full space-y-3">
                      <label className="text-[10px] font-semibold text-white/30 uppercase tracking-widest">Gender</label>
                      <div className="grid grid-cols-2 gap-3">
                        {["Male", "Female"].map(g => (
                          <button key={g} type="button" onClick={() => setFormData(p => ({ ...p, gender: g }))}
                            className={`py-3 rounded-2xl font-semibold text-xs uppercase tracking-widest transition-all border ${formData.gender === g ? "bg-[#D0B079] text-slate-900 border-[#D0B079]" : "bg-white/[0.03] border-white/10 text-white/30 hover:text-white/60"
                              }`}>{g}</button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Fields */}
                  <div className="lg:col-span-8 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <InputField label="Full Name" icon={User} value={formData.full_name}
                        onChange={(e) => { const v = e.target.value; setFormData(p => ({ ...p, full_name: v.length > 0 ? v.charAt(0).toUpperCase() + v.slice(1) : v })); }}
                        placeholder="e.g. Johnathan Doe" required />
                      <InputField label="Designation" icon={Briefcase} value={formData.designation}
                        onChange={(e) => setFormData(p => ({ ...p, designation: e.target.value }))} placeholder="e.g. Head Chef" />
                      <InputField label="Hourly Rate (£)" icon={PoundSterling} value={formData.hourly_rate}
                        onChange={(e) => setFormData(p => ({ ...p, hourly_rate: e.target.value }))} placeholder="e.g. 11.50" type="number" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <InputField label="Email" icon={Mail} value={formData.email} type="email"
                        onChange={(e) => setFormData(p => ({ ...p, email: e.target.value }))} placeholder="staff@digitalbotsolutions.com" required />
                      <InputField label="Phone Number" icon={Phone} value={formData.phone_number}
                        onChange={(e) => setFormData(p => ({ ...p, phone_number: e.target.value }))} placeholder="+44 7700 900000" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <InputField label="Password" icon={Shield} value={formData.password} type="password"
                        onChange={(e) => setFormData(p => ({ ...p, password: e.target.value }))} placeholder="Leave empty to keep current" autoComplete="new-password" />
                      <InputField label="Date of Birth" icon={Calendar} value={formData.dob} type="date"
                        onChange={(e) => setFormData(p => ({ ...p, dob: e.target.value }))} />
                    </div>
                  </div>
                </div>

                <div className="mt-8 flex justify-end gap-4 border-t border-white/5 pt-8">
                  <button type="button" onClick={() => setShowModal(false)}
                    className="px-8 py-4 bg-white/5 hover:bg-white/10 text-white/50 hover:text-white font-semibold text-xs uppercase tracking-widest rounded-2xl transition-all">
                    Discard
                  </button>
                  <button type="submit" disabled={saving}
                    className="px-10 py-4 bg-[#D0B079] hover:bg-[#b8965f] text-slate-900 font-semibold text-xs uppercase tracking-wider rounded-2xl shadow-xl shadow-[#D0B079]/20 transition-all flex items-center gap-3 disabled:opacity-50">
                    {saving ? <><Loader2 className="animate-spin" size={16} />Saving...</> : <><Save size={16} />Save changes</>}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Report Modal */}
      <AnimatePresence>
        {showReportModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 print:static print:block print:p-0 print:bg-white">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowReportModal(false)} className="absolute inset-0 bg-black/80 backdrop-blur-xl no-print" />

            <motion.div initial={{ opacity: 0, scale: 0.95, y: 40 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 40 }} className="relative w-full max-w-5xl bg-[#0b1a3d] border border-white/10 rounded-[3rem] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col print:overflow-visible print:max-h-none print:shadow-none print:border-none print:bg-white print:rounded-none print:block print:w-full">

              <div className="bg-white/5 px-10 py-6 border-b border-white/10 flex items-center justify-between no-print">
                <div>
                  <h2 className="text-2xl font-semibold">Report preview</h2>
                  <p className="text-white/40 text-xs mt-1">Ready for printing or PDF export</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="px-4 py-2 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-md">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-0.5">Network Scope</p>
                    <p className="text-sm font-bold text-white flex items-center gap-2">
                      <Store size={14} className="text-[#D0B079]" />
                      {restaurants.length} Restaurants
                    </p>
                  </div>
                  <button 
                    onClick={handleEmailReport} 
                    disabled={sendingEmail}
                    className="px-6 py-3 bg-white text-slate-900 font-bold rounded-xl text-xs flex items-center gap-2 hover:bg-slate-100 transition-all disabled:opacity-50"
                  >
                    {sendingEmail ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} 
                    {sendingEmail ? "Sending..." : "Email Report"}
                  </button>
                  <button
                    onClick={handlePrint}
                    className="px-6 py-3 bg-[#D0B079] text-slate-900 font-bold rounded-xl text-xs flex items-center gap-2 hover:bg-[#b8965f] transition-all"
                  >
                    <Printer size={14} /> Print / Save as PDF
                  </button>
                  <button onClick={() => setShowReportModal(false)} className="p-3 bg-white/5 hover:bg-rose-500/20 text-white/50 hover:text-rose-400 rounded-xl transition-all">
                    <X size={20} />
                  </button>
                </div>
              </div>

              <div className="p-10 overflow-y-auto custom-scrollbar print:overflow-visible print:h-auto print:p-0 print:block">
                <div id="report-content" style={{ backgroundColor: '#ffffff', color: '#0f172a' }} className="p-12 rounded-lg">
                  {/* Report Header */}
                  <div className="flex justify-between items-start border-b-2 border-slate-200 pb-8 mb-8" style={{ borderBottomColor: '#e2e8f0' }}>
                    <div>
                      <h1 className="text-3xl font-black uppercase tracking-tighter" style={{ color: '#0f172a' }}>Attendance Report</h1>
                      <p className="text-sm font-bold mt-1" style={{ color: '#64748b' }}>Generated: {new Date().toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-black" style={{ color: '#1e293b' }}>DigitalBotSolutions</div>
                      <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#94a3b8' }}>{attendanceData?.staff?.restaurant_name || "Restaurant Staff"}</p>
                    </div>
                  </div>

                  {/* Staff Info Card with Date Range in Modal */}
                  <div className="mb-10 flex justify-between items-center gap-6 bg-slate-50 p-8 rounded-[2rem] border border-slate-200">
                    <div className="flex-1">
                      <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: '#94a3b8' }}>Staff details</p>
                      <h3 className="text-2xl font-bold" style={{ color: '#1e293b' }}>{attendanceData?.staff?.full_name}</h3>
                      <p className="text-sm font-semibold" style={{ color: '#64748b' }}>
                        ID: {attendanceData?.staff?.employee_id || "N/A"} • {attendanceData?.staff?.designation || "Staff"}
                      </p>
                      {attendanceData?.staff?.restaurant_name && attendanceData?.staff?.id !== "all" && (
                        <p className="text-sm font-bold mt-1" style={{ color: '#D0B079' }}>
                          🏪 {attendanceData.staff.restaurant_name}
                        </p>
                      )}

                      <div className="mt-4 flex items-center gap-3 no-print">
                        <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                          <input
                            type="date"
                            value={attendanceFilters.from}
                            onChange={(e) => setAttendanceFilters(p => ({ ...p, from: e.target.value }))}
                            className="bg-transparent border-none text-[10px] font-bold text-slate-400 focus:ring-0 uppercase px-2 py-1 cursor-pointer"
                          />
                          <div className="w-px h-3 bg-slate-200" />
                          <input
                            type="date"
                            value={attendanceFilters.to}
                            onChange={(e) => setAttendanceFilters(p => ({ ...p, to: e.target.value }))}
                            className="bg-transparent border-none text-[10px] font-bold text-slate-400 focus:ring-0 uppercase px-2 py-1 cursor-pointer"
                          />
                        </div>

                        {attendanceData?.staff?.id === "all" && (
                          <>
                            <select
                              value={reportRestaurantFilter}
                              onChange={(e) => {
                                setReportRestaurantFilter(e.target.value);
                                setReportEmployeeFilter("all");
                              }}
                              className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm text-[10px] font-bold text-slate-500 uppercase cursor-pointer outline-none"
                            >
                              <option value="all">All Restaurants</option>
                              {restaurantsList.map(r => (
                                <option key={r.id} value={r.id}>{r.name}</option>
                              ))}
                            </select>

                            <select
                              value={reportEmployeeFilter}
                              onChange={(e) => setReportEmployeeFilter(e.target.value)}
                              className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm text-[10px] font-bold text-slate-500 uppercase cursor-pointer outline-none max-w-[200px]"
                            >
                              <option value="all">All Employees</option>
                              {staff.filter(s => reportRestaurantFilter === "all" || s.restaurant_id === reportRestaurantFilter).map(s => (
                                <option key={s.id} value={s.id}>{s.full_name} {s.designation ? `(${s.designation})` : ""}</option>
                              ))}
                            </select>
                          </>
                        )}

                        <button
                          onClick={() => {
                            if (attendanceData?.staff?.id === "all") handleAllStaffReport();
                            else handleOpenReport(attendanceData?.staff?.id);
                          }}
                          className="px-4 py-2 bg-slate-900 text-white text-[10px] font-black rounded-xl uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/10"
                        >
                          Refresh Preview
                        </button>
                      </div>

                      <p className="text-sm font-bold mt-4 text-[#D0B079]">
                        Report Period: {attendanceFilters.from || "Start"} — {attendanceFilters.to || "End"}
                      </p>
                    </div>
                    {attendanceData?.staff?.hourly_rate && (
                      <div className="text-right p-6 bg-white rounded-2xl border border-slate-100 shadow-sm min-w-[150px]">
                        <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: '#94a3b8' }}>Hourly Rate</p>
                        <p className="text-2xl font-black text-slate-900">£{attendanceData.staff.hourly_rate}</p>
                      </div>
                    )}
                  </div>
                  {/* Table */}
                  {attendanceData?.staff?.id === "all" ? (
                    <div className="space-y-12">
                      {summaryGroupedRecords.length > 0 ? (
                        summaryGroupedRecords.map((staffGroup, i) => {
                          const staffPay = staffGroup.hourly_rate > 0 
                            ? `£${((staffGroup.total_minutes / 60) * staffGroup.hourly_rate).toFixed(2)}` 
                            : formatWorkTime(staffGroup.total_minutes);
                          return (
                            <div key={i} className="bg-white border border-slate-200 rounded-[2rem] print:overflow-visible overflow-hidden shadow-sm" style={{ pageBreakInside: 'avoid', pageBreakAfter: 'always' }}>
                              <div className="bg-slate-50 border-b border-slate-200 p-6 flex justify-between items-center gap-4">
                                <div>
                                  <h4 className="text-xl font-bold text-slate-900">{staffGroup.staff_name}</h4>
                                  <p className="text-sm font-semibold text-slate-500">{staffGroup.designation} — {staffGroup.restaurant_name}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Total Hours</p>
                                  <p className="text-xl font-black text-[#D0B079]">{formatWorkTime(staffGroup.total_minutes)}</p>
                                </div>
                              </div>
                              <table className="w-full border-collapse text-sm">
                                <thead>
                                  <tr className="border-b border-slate-100 bg-white">
                                    <th className="px-6 py-3 text-left font-black uppercase tracking-widest text-[10px] text-slate-400">Date</th>
                                    <th className="px-6 py-3 text-left font-black uppercase tracking-widest text-[10px] text-slate-400">Clock in</th>
                                    <th className="px-6 py-3 text-left font-black uppercase tracking-widest text-[10px] text-slate-400">Clock out</th>
                                    <th className="px-6 py-3 text-right font-black uppercase tracking-widest text-[10px] text-slate-400">Duration</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                  {staffGroup.sessions.map((session, sIdx) => (
                                    <tr key={sIdx} className="hover:bg-slate-50 transition-colors">
                                      <td className="px-6 py-4 font-bold text-slate-600">
                                        {new Date(session.clock_in).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
                                      </td>
                                      <td className="px-6 py-4 font-mono font-bold text-slate-500">
                                        {session.clock_in ? getCalculatedTime(new Date(session.clock_in)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : "--:--"}
                                      </td>
                                      <td className="px-6 py-4 font-mono font-bold text-slate-500">
                                        {session.location_out === "System Auto-Logout" && (!session.edit_reason || session.edit_reason.trim() === "") ? '--' : formatTimeWithDateDiff(session.clock_in, session.clock_out)} {session.location_out === "System Auto-Logout" && (!session.edit_reason || session.edit_reason.trim() === "") ? <span className="text-[9px] uppercase tracking-widest text-slate-400 block">(Auto Logouted)</span> : null}
                                      </td>
                                      <td className="px-6 py-4 text-right font-mono font-black text-slate-700">
                                        {session.location_out === "System Auto-Logout" && (!session.edit_reason || session.edit_reason.trim() === "")
                                          ? '--'
                                          : formatWorkTime(session._calc_minutes != null ? session._calc_minutes : calcSessionMinutes(session))
                                        }
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          );
                        })
                      ) : (
                        <div className="py-20 text-center font-bold italic text-slate-400">No attendance records found for this period</div>
                      )}
                      
                      {summaryGroupedRecords.length > 0 && (
                        <div className="bg-slate-900 p-8 rounded-[2rem] text-right mt-8" style={{ pageBreakInside: 'avoid' }}>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Grand Total Output</p>
                          <p className="text-3xl font-black text-white">
                            {(() => {
                              const totalMinutes = summaryGroupedRecords.reduce((sum, g) => sum + g.total_minutes, 0);
                              return formatWorkTime(totalMinutes);
                            })()}
                          </p>
                          <p className="text-sm font-bold text-[#D0B079] mt-2">
                            {(() => {
                              const totalPay = summaryGroupedRecords.reduce((sum, g) => sum + (g.hourly_rate > 0 ? (g.total_minutes / 60) * g.hourly_rate : 0), 0);
                              return totalPay > 0 ? `Total Est. Pay: £${totalPay.toFixed(2)}` : "";
                            })()}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-y-2 border-slate-900 bg-slate-50/50" style={{ borderTopColor: '#0f172a', borderBottomColor: '#0f172a', backgroundColor: '#f8fafc' }}>
                          <th className="px-4 py-4 text-left font-black uppercase tracking-widest text-[10px]">Date</th>
                          <th className="px-4 py-4 text-left font-black uppercase tracking-widest text-[10px]">Clock in</th>
                          <th className="px-4 py-4 text-left font-black uppercase tracking-widest text-[10px]">Clock out</th>
                          <th className="px-4 py-4 text-right font-black uppercase tracking-widest text-[10px]">Total hours</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100" style={{ borderColor: '#f1f5f9' }}>
                        {groupedRecords.length > 0 ? (
                          groupedRecords.map((group, i) => (
                            <React.Fragment key={i}>
                              {/* Day header row */}
                              {group.sessions.length > 1 && (
                                <tr style={{ backgroundColor: '#f1f5f9' }}>
                                  <td colSpan="3" className="px-4 py-3 font-black text-[10px] uppercase tracking-widest" style={{ color: '#64748b' }}>
                                    {new Date(group.date).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })} — {group.sessions.length} Sessions
                                  </td>
                                  <td className="px-4 py-3 text-right font-black text-xs" style={{ color: '#0f172a' }}>
                                    Day Total: {formatWorkTime(group.total_minutes)}
                                  </td>
                                </tr>
                              )}
                              {/* Session rows */}
                              {group.sessions.map((session, sIdx) => (
                                <tr key={session.id || sIdx}>
                                  <td className="px-4 py-4 font-bold" style={{ color: '#334155' }}>
                                    {group.sessions.length > 1 ? (
                                      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#94a3b8' }}>Session #{group.sessions.length - sIdx}</span>
                                    ) : (
                                      new Date(group.date).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
                                    )}
                                  </td>
                                  <td className="px-4 py-4 font-mono font-bold" style={{ color: '#475569' }}>
                                    {session.clock_in ? getCalculatedTime(new Date(session.clock_in)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : "--:--"}
                                  </td>
                                  <td className="px-4 py-4 font-mono font-bold" style={{ color: '#475569' }}>
                                    {session.location_out === "System Auto-Logout" && (!session.edit_reason || session.edit_reason.trim() === "") ? '--' : formatTimeWithDateDiff(session.clock_in, session.clock_out)} {session.location_out === "System Auto-Logout" && (!session.edit_reason || session.edit_reason.trim() === "") ? <span className="text-[9px] uppercase tracking-widest text-slate-400 block">(Auto Logouted)</span> : null}
                                  </td>
                                  <td className="px-4 py-4 text-right font-mono font-black" style={{ color: '#0f172a' }}>
                                    {session.location_out === "System Auto-Logout" && (!session.edit_reason || session.edit_reason.trim() === "")
                                      ? '--'
                                      : formatWorkTime(session._calc_minutes != null ? session._calc_minutes : calcSessionMinutes(session))
                                    }
                                  </td>
                                </tr>
                              ))}
                            </React.Fragment>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="4" className="py-20 text-center font-bold italic" style={{ color: '#94a3b8' }}>No attendance records found for this period</td>
                          </tr>
                        )}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-900 bg-slate-50/30" style={{ borderTopColor: '#0f172a', backgroundColor: '#f8fafc' }}>
                          <td colSpan="3" className="px-4 py-6 text-right font-black uppercase tracking-widest text-xs" style={{ color: '#94a3b8' }}>
                            Grand Total ({formatWorkTime(groupedRecords.reduce((sum, g) => sum + g.total_minutes, 0))})
                          </td>
                          <td className="px-4 py-6 text-right font-black text-2xl" style={{ color: '#0f172a' }}>
                            {(() => {
                              const totalMinutes = groupedRecords.reduce((sum, g) => sum + g.total_minutes, 0);
                              const rate = Number(attendanceData?.staff?.hourly_rate || 0);
                              if (rate > 0) {
                                const pay = (totalMinutes / 60) * rate;
                                return `£${pay.toFixed(2)}`;
                              }
                              return formatWorkTime(totalMinutes);
                            })()}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  )}

                  {/* Footer */}
                  <div className="mt-12 pt-8 border-t border-slate-100 text-center italic text-[10px]" style={{ borderTopColor: '#f1f5f9', color: '#94a3b8' }}>
                    <p>© DigitalBotSolutions Management System • Report Generated on {new Date().toLocaleString()}</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Send Notification Modal */}
      <AnimatePresence>
        {showNotificationModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowNotificationModal(false)} className="absolute inset-0 bg-black/80 backdrop-blur-xl" />

            <motion.div initial={{ opacity: 0, scale: 0.95, y: 40 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 40 }} transition={{ type: "spring", damping: 25 }}
              className="relative w-full max-w-lg bg-[#0b1a3d] border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden">

              <div className="bg-white/5 px-8 py-6 border-b border-white/10 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3 text-[#D0B079] font-bold tracking-wider mb-1">
                    <Bell size={14} />
                    <span className="text-[10px] font-semibold tracking-widest uppercase">Direct Notification</span>
                  </div>
                  <h2 className="text-2xl font-semibold tracking-tight text-white">
                    Notify {notificationTarget?.name}
                  </h2>
                </div>
                <button onClick={() => setShowNotificationModal(false)} className="p-3 bg-white/5 hover:bg-rose-500/20 text-white/50 hover:text-rose-500 rounded-xl transition-all">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSendNotification} className="p-8 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-white/40 tracking-widest uppercase ml-1">Notification Title</label>
                  <input
                    type="text"
                    value={notificationData.title}
                    onChange={(e) => setNotificationData(p => ({ ...p, title: e.target.value }))}
                    placeholder="e.g., New Task Assigned"
                    className="w-full px-5 py-4 bg-white/[0.03] border border-white/[0.08] rounded-2xl text-white font-medium focus:outline-none focus:border-[#D0B079]/40 transition-all"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-white/40 tracking-widest uppercase ml-1">Message Content</label>
                  <textarea
                    value={notificationData.body}
                    onChange={(e) => setNotificationData(p => ({ ...p, body: e.target.value }))}
                    placeholder="Type your message here..."
                    rows={4}
                    className="w-full px-5 py-4 bg-white/[0.03] border border-white/[0.08] rounded-2xl text-white font-medium focus:outline-none focus:border-[#D0B079]/40 transition-all resize-none"
                    required
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowNotificationModal(false)}
                    className="flex-1 px-6 py-4 bg-white/5 text-white font-bold rounded-2xl hover:bg-white/10 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={sendingNotification}
                    className="flex-[2] px-6 py-4 bg-[#D0B079] text-slate-900 font-bold rounded-2xl hover:bg-[#b8965f] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {sendingNotification ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        <span>Sending...</span>
                      </>
                    ) : (
                      <>
                        <Bell size={18} />
                        <span>Send Notification</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Manual Add Modal */}
      <AnimatePresence>
        {showManualAddModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowManualAddModal(false)} className="absolute inset-0 bg-black/80 backdrop-blur-xl" />

            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-[#0b1a3d] border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col p-8"
            >
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                    <Plus className="text-[#D0B079]" size={20} /> Add Missing Record
                  </h3>
                  <p className="text-white/40 text-xs mt-1">Manual entry will be logged for audit purposes.</p>
                </div>
                <button onClick={() => setShowManualAddModal(false)} className="p-3 bg-white/5 hover:bg-rose-500/20 text-white/50 hover:text-rose-500 rounded-xl transition-all">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleAddAttendanceRecord} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-white/30 tracking-widest ml-1 uppercase">Clock In Time <span className="text-rose-500">*</span></label>
                  <DateTime12HrInput
                    value={manualAddData.clock_in}
                    onChange={(val) => setManualAddData(p => ({ ...p, clock_in: val }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-white/30 tracking-widest ml-1 uppercase">Clock Out Time <span className="text-rose-500">*</span></label>
                  <DateTime12HrInput
                    value={manualAddData.clock_out}
                    onChange={(val) => setManualAddData(p => ({ ...p, clock_out: val }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-white/30 tracking-widest ml-1 uppercase">Reason for manual entry <span className="text-rose-500">*</span></label>
                  <textarea
                    value={manualAddData.edit_reason}
                    onChange={(e) => setManualAddData(p => ({ ...p, edit_reason: e.target.value }))}
                    placeholder="e.g. Forgot to clock in due to app issue"
                    rows="2"
                    className="w-full px-5 py-3.5 bg-white/[0.03] border border-white/[0.08] rounded-2xl text-white font-semibold focus:outline-none focus:border-[#D0B079]/40 focus:ring-2 focus:ring-[#D0B079]/10 transition-all placeholder:text-white/20 resize-none"
                    required
                  ></textarea>
                </div>

                <button
                  type="submit"
                  disabled={addingAttendance}
                  className="w-full py-4 mt-6 bg-[#D0B079] text-slate-900 font-bold rounded-2xl text-xs tracking-widest hover:bg-[#b8965f] shadow-xl shadow-[#D0B079]/20 transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
                >
                  {addingAttendance ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  {addingAttendance ? 'SAVING...' : 'SAVE RECORD'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        @media print {
          @page { size: auto; margin: 15mm; }
          body, html {
            height: auto !important;
            overflow: visible !important;
            background: white !important;
          }
          #report-content {
            width: 100%;
            margin: 0;
            padding: 0;
            background: white !important;
            color: black !important;
          }
          /* Ensure parents don't clip the content */
          div { overflow: visible !important; }
          
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          thead { display: table-header-group; }
          tfoot { display: table-footer-group; }
          .page-break-inside-avoid { page-break-inside: avoid; }
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  );
}

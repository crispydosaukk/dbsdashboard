import React, { useEffect, useState } from "react";
import { logoBase64 } from "../../logoBase64";
import { formatTimeShort, calcCalculatedMinutes } from "../../utils/timeRounding";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, Legend
} from "recharts";
import { useNavigate } from "react-router-dom";
import {
  Users, ArrowRight, CheckCircle, Clock, X, Check,
  TrendingUp, TrendingDown, PoundSterling, ChevronDown, LayoutDashboard, XCircle, Shield, Calendar, Filter, Search, User, AlertTriangle, BellRing, Loader2, Store, Send, History
} from "lucide-react";


import Header from "../common/header.jsx";
import Sidebar from "../common/sidebar.jsx";
import Footer from "../common/footer.jsx";
import { db, functionsInstance } from "../../lib/firebase";
import { httpsCallable } from "firebase/functions";
import { collection, query, onSnapshot, where, getDocs, orderBy, limit, Timestamp, addDoc, serverTimestamp, updateDoc, doc, getDoc } from "firebase/firestore";
import { motion, AnimatePresence } from "framer-motion";
import { usePopup } from "../../context/PopupContext";
import { useAuth } from "../../context/AuthContext";
import { sendPushNotification } from "../../utils/fcm";


// --- Helpers ---

const getTrend = (current, previous) => {
  if (previous === 0) return current > 0 ? { text: "+100%", isUp: true } : { text: "0%", isUp: false };
  const diff = current - previous;
  const percent = (diff / previous) * 100;
  return {
    text: `${percent > 0 ? '+' : ''}${percent.toFixed(1)}%`,
    isUp: percent > 0
  };
};

// --- Components ---

const ChartCard = ({ title, subtitle, children, delay, className = "" }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ delay, duration: 0.4 }}
    className={`rounded-2xl p-6 shadow-2xl border border-white/[0.08] bg-[#0b1a3d]/60 backdrop-blur-xl flex flex-col ${className}`}
  >
    <div className="mb-6">
      <h3 className="text-lg font-bold text-white tracking-tight">{title}</h3>
      <p className="text-[11px] mt-1 text-white/40 uppercase tracking-widest font-semibold">{subtitle}</p>
    </div>
    <div className="flex-1 w-full min-h-[250px] relative">
      {children}
    </div>
  </motion.div>
);

const StatCard = ({ title, value, subtext, icon: Icon, colorClass, delay, onEyeClick, trend }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay, duration: 0.4 }}
    className="relative overflow-hidden rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-white/[0.08] bg-[#0b1a3d]/60 backdrop-blur-xl shadow-2xl group hover:bg-[#0b1a3d]/80 transition-all duration-300 flex flex-col justify-between h-full min-h-[140px] sm:min-h-[170px]"
  >
    <div className="relative z-10 flex justify-between items-start mb-2">
      <div className={`p-2.5 sm:p-3 rounded-lg sm:rounded-xl backdrop-blur-md inline-block shadow-inner ${colorClass} relative`}>
        <Icon size={18} className="sm:size-[22px] text-white" />
      </div>
      {(onEyeClick || trend) && (
        <div className="flex flex-col items-end gap-1.5">
          {onEyeClick && (
            <button
              onClick={onEyeClick}
              className="p-1.5 sm:p-2 rounded-lg bg-white/5 hover:bg-white/15 text-white/30 hover:text-white transition-all border border-white/5"
            >
              <ArrowRight size={16} />
            </button>
          )}
          {trend && (
            <div className={`flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md sm:rounded-lg text-[9px] sm:text-[10px] font-black border shadow-sm ${trend.isUp ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              }`}>
              {trend.isUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />} {trend.text}
            </div>
          )}
        </div>
      )}
    </div>

    <div className="relative z-10 mt-auto">
      <h3 className="text-xl sm:text-3xl font-semibold text-white drop-shadow-lg tracking-tight truncate">{value}</h3>
      <div className="mt-1 sm:mt-2 text-left">
        <p className="text-[12px] sm:text-sm font-medium text-white tracking-wider leading-tight mb-1 sm:mb-1.5">{title}</p>
        <p className="text-[10px] sm:text-xs font-normal text-white/90">{subtext}</p>
      </div>
    </div>

    <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-[#D0B079]/5 rounded-full blur-3xl group-hover:bg-[#D0B079]/10 transition-colors" />
  </motion.div>
);

// --- Main Dashboard ---

export default function Dashboard() {
  const { userData } = useAuth();
  const { showPopup } = usePopup();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const roleTitle = String(userData?.role_title || userData?.role || "").toLowerCase().trim();
  const roleId = String(userData?.role_id || "");
  const isSuper = roleId === "6" || roleTitle === "super admin" || roleTitle === "superadmin";

  const [stats, setStats] = useState({
    total_staff: 0,
    present_today: 0,
    active_now: 0,
    pending_clockouts: [],
    completed_shifts: [],
    total_hours_period: "0.0",
    recent_activity: [],
    weekly_data: [],
  });
  const [loading, setLoading] = useState(true);
  const [restaurants, setRestaurants] = useState([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState("");
  const [showRestaurantMenu, setShowRestaurantMenu] = useState(false);
  const [dateRange, setDateRange] = useState({
    from: new Date().toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0]
  });
  const [timeRange, setTimeRange] = useState({
    from: "",
    to: ""
  });
  const [period, setPeriod] = useState("today");
  const [showPeriodMenu, setShowPeriodMenu] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);

  // Snapshot States
  const [snapshotPeriod, setSnapshotPeriod] = useState("yesterday");
  const [snapshotCustomDates, setSnapshotCustomDates] = useState({
    from: new Date().toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0]
  });
  const [snapshotRestaurant, setSnapshotRestaurant] = useState("all");
  const [showSnapshotMenu, setShowSnapshotMenu] = useState(false);
  const [showSnapshotRestMenu, setShowSnapshotRestMenu] = useState(false);
  const [snapshotCompareMode, setSnapshotCompareMode] = useState(false);
  const [snapshotCompareRestIds, setSnapshotCompareRestIds] = useState([]);
  const [snapshotPage, setSnapshotPage] = useState(1);
  const [sendingEmail, setSendingEmail] = useState(false);

  // Super Admin: User/Staff filter
  const [allStaffList, setAllStaffList] = useState([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [showPendingClockouts, setShowPendingClockouts] = useState(false);
  const [showYesterdayClockouts, setShowYesterdayClockouts] = useState(false);
  const [activityPage, setActivityPage] = useState(1);
  const itemsPerPage = 10;
  const [sendingReminders, setSendingReminders] = useState(false);

  const handleRemindAll = async (e) => {
    e.stopPropagation();
    if (!stats.pending_clockouts || stats.pending_clockouts.length === 0) return;

    setSendingReminders(true);

    try {
      const broadcastId = `bcast_${Date.now()}_reminder`;

      const promises = stats.pending_clockouts.map(async (record) => {
        const staffDoc = allStaffList.find(s => s.id === record.staff_id);
        const fcmToken = staffDoc?.fcmToken || staffDoc?.fcm_token;

        // Add to Firestore
        const docRef = await addDoc(collection(db, "notifications"), {
          title: "Clock-Out Reminder",
          body: "You are currently clocked in. Please don't forget to clock out at the end of your shift!",
          staff_id: record.staff_id,
          staff_name: record.full_name,
          restaurant_id: staffDoc?.restaurant_id || "",
          type: "alert",
          priority: "high",
          status: "sent",
          sent_at: serverTimestamp(),
          broadcast_id: broadcastId,
          target_group: "Active Shifts",
          fcm_token: fcmToken || null,
          platform: staffDoc?.platform || "unknown"
        });

        if (fcmToken) {
          sendPushNotification({
            fcm_token: fcmToken,
            title: "Clock-Out Reminder",
            body: "You are currently clocked in. Please don't forget to clock out at the end of your shift!",
            priority: "high",
            type: "alert",
            notificationId: docRef.id
          });
        }
      });

      await Promise.all(promises);

      showPopup({
        title: "Reminders Sent",
        message: `Successfully sent clock-out reminders to ${stats.pending_clockouts.length} staff members.`,
        type: "success"
      });

    } catch (err) {
      console.error(err);
      showPopup({
        title: "Error",
        message: "Failed to send reminders.",
        type: "error"
      });
    } finally {
      setSendingReminders(false);
    }
  };


  useEffect(() => {
    if (isSuper) {
      const unsubRestaurants = onSnapshot(collection(db, "restaurants"), (snapshot) => {
        setRestaurants(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });
      return () => unsubRestaurants();
    } else if (userData?.restaurant_id) {
      const unsubRestaurant = onSnapshot(doc(db, "restaurants", String(userData.restaurant_id)), (docSnap) => {
        if (docSnap.exists()) {
          setRestaurants([{ id: docSnap.id, ...docSnap.data() }]);
        }
      });
      return () => unsubRestaurant();
    }
  }, [isSuper, userData?.restaurant_id]);


  const handlePeriodChange = (p) => {
    setPeriod(p);
    const from = new Date();
    const to = new Date();

    if (p === 'today' || p === 'today_vs') {
      // already set
    } else if (p === 'yesterday') {
      from.setDate(from.getDate() - 1);
      to.setDate(to.getDate() - 1);
    } else if (p === '3days') {
      from.setDate(from.getDate() - 2);
    } else if (p === 'week' || p === 'week_vs') {
      from.setDate(from.getDate() - 7);
    } else if (p === 'month' || p === 'month_vs') {
      from.setMonth(from.getMonth() - 1);
    } else if (p === 'quarter') {
      from.setMonth(from.getMonth() - 3);
    } else if (p === 'halfyear') {
      from.setMonth(from.getMonth() - 6);
    }

    if (p !== 'custom') {
      setDateRange({
        from: from.toISOString().split('T')[0],
        to: to.toISOString().split('T')[0]
      });
      setShowPeriodMenu(false);
    }
  };

  useEffect(() => {
    const unsubStaff = onSnapshot(collection(db, "staff"), (snap) => {
      const staffList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAllStaffList(staffList);
      calculateStaffStats(staffList);
    });
    return () => unsubStaff();
  }, [selectedRestaurant, selectedUser, dateRange, timeRange, isSuper, userData, restaurants, snapshotPeriod, snapshotCustomDates, snapshotRestaurant, snapshotCompareMode]);
  useEffect(() => {
    if (selectedRestaurant) {
      setSnapshotRestaurant(selectedRestaurant);
    } else {
      setSnapshotRestaurant("all");
    }
  }, [selectedRestaurant]);


  const calculateStaffStats = async (staffList) => {
    // 1. Determine the effective Restaurant ID
    const restaurantId = selectedRestaurant || String(userData?.restaurant_id || "");

    // Check super admin status directly from current userData
    const currentRoleTitle = String(userData?.role_title || userData?.role || "").toLowerCase().trim();
    const currentRoleId = String(userData?.role_id || "");
    const currentIsSuper = currentRoleId === "6" || currentRoleTitle === "super admin" || currentRoleTitle === "superadmin";

    let filteredStaff = [];

    if (currentIsSuper && !selectedRestaurant) {
      // Super Admin viewing all
      filteredStaff = staffList;
    } else if (currentIsSuper && selectedRestaurant) {
      // Super Admin filtered by a specific restaurant
      const selectedRest = restaurants.find(r => String(r.id) === String(selectedRestaurant));
      const restName = selectedRest?.restaurant_name;

      filteredStaff = staffList.filter(s => {
        const sRestId = String(s.restaurant_id || "");
        const sCreatedBy = String(s.created_by || "");
        const sRestName = String(s.restaurant_name || "");

        return sRestId === String(selectedRestaurant) ||
          sCreatedBy === String(selectedRestaurant) ||
          (restName && sRestId === String(restName)) ||
          (restName && sRestName === String(restName));
      });
    } else if (restaurantId) {
      // Regular Admin restricted to their restaurant
      const selectedRest = restaurants.find(r => String(r.id) === String(restaurantId));
      const restName = selectedRest?.restaurant_name;

      filteredStaff = staffList.filter(s => {
        const sRestId = String(s.restaurant_id || "");
        const sCreatedBy = String(s.created_by || "");
        const sRestName = String(s.restaurant_name || "");

        return sRestId === String(restaurantId) ||
          sCreatedBy === String(restaurantId) ||
          (restName && sRestId === String(restName)) ||
          (restName && sRestName === String(restName));
      });
    } else if (currentIsSuper) {
      // Super Admin fallback (no restaurant_id on user, no selection) - show all
      filteredStaff = staffList;
    } else {
      // Restricted user with NO restaurant_id assigned - SHOW NOTHING
      filteredStaff = [];
    }

    // Apply user/staff filter (Super Admin only)
    if (selectedUser && currentIsSuper) {
      filteredStaff = filteredStaff.filter(s => s.id === selectedUser);
    }



    const [fromY, fromM, fromD] = dateRange.from.split('-').map(Number);
    const fromDate = new Date(fromY, fromM - 1, fromD, 0, 0, 0, 0);

    const [toY, toM, toD] = dateRange.to.split('-').map(Number);
    const toDate = new Date(toY, toM - 1, toD, 23, 59, 59, 999);

    const attendanceQuery = query(
      collection(db, "attendance"),
      where("clock_in", ">=", fromDate),
      where("clock_in", "<=", toDate),
      orderBy("clock_in", "desc")
    );
    const attendanceSnap = await getDocs(attendanceQuery);
    const attendanceRecords = attendanceSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const presentStaffIds = new Set(attendanceRecords.map(r => r.staff_id));
    const presentCount = filteredStaff.filter(s => presentStaffIds.has(s.id)).length;

    // Filter attendance records to ONLY those belonging to staff in the selected restaurant
    const filteredStaffIds = new Set(filteredStaff.map(s => s.id));
    let filteredAttendance = attendanceRecords.filter(r => filteredStaffIds.has(r.staff_id));

    // Optional Time Range Filter
    if (timeRange.from || timeRange.to) {
      filteredAttendance = filteredAttendance.filter(r => {
        const rDate = r.clock_in?.toDate ? r.clock_in.toDate() : new Date(r.clock_in);
        const hours = rDate.getHours();
        const minutes = rDate.getMinutes();
        const rTime = hours * 60 + minutes;

        if (timeRange.from) {
          const [h, m] = timeRange.from.split(':').map(Number);
          if (rTime < h * 60 + m) return false;
        }
        if (timeRange.to) {
          const [h, m] = timeRange.to.split(':').map(Number);
          if (rTime > h * 60 + m) return false;
        }
        return true;
      });
    }

    // Fetch active sessions independently of the date range filter
    const activeQuery = query(
      collection(db, "attendance"),
      where("clock_out", "==", null)
    );
    const activeSnap = await getDocs(activeQuery);
    let activeAllRecords = activeSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Auto-logout expired sessions logic removed per user request

    const activeSessions = activeAllRecords.filter(r => filteredStaffIds.has(r.staff_id));
    const activeNowCount = activeSessions.length;

    const pendingClockouts = activeSessions.map(r => {
      const s = filteredStaff.find(staff => staff.id === r.staff_id);
      return {
        ...r,
        full_name: s?.full_name || "Unknown Staff",
        profile_image: s?.profile_image,
        designation: s?.designation,
        restaurant_name: s?.restaurant_name || "Unknown Restaurant"
      };
    });

    // Recalculate total_minutes from actual timestamps instead of trusting stored values
    const totalMinutesPeriod = filteredAttendance.reduce((sum, r) => {
      if (r.location_out === "System Auto-Logout" && (!r.edit_reason || r.edit_reason.trim() === "")) {
        return sum;
      }
      if (r.clock_in && r.clock_out) {
        return sum + calcCalculatedMinutes(r.clock_in, r.clock_out);
      }
      return sum;
    }, 0);
    const totalHoursPeriod = (totalMinutesPeriod / 60).toFixed(1);

    const recentActivity = filteredAttendance.slice(0, 10).map(r => {
      const s = filteredStaff.find(staff => staff.id === r.staff_id);
      return {
        ...r,
        full_name: s?.full_name || "Unknown Staff",
        profile_image: s?.profile_image,
        designation: s?.designation
      };
    });

    const completedShiftsList = filteredAttendance.filter(r => r.clock_out && r.location_out !== "System Auto-Logout").map(r => {
      const s = filteredStaff.find(staff => staff.id === r.staff_id);
      return {
        ...r,
        full_name: s?.full_name || "Unknown Staff",
        profile_image: s?.profile_image,
        designation: s?.designation,
        restaurant_name: s?.restaurant_name || "Unknown Restaurant"
      };
    });

    // Calculate weekly data (last 7 days from the END date)
    const weeklyData = [];
    const sevenDaysBeforeEnd = new Date(toDate);
    sevenDaysBeforeEnd.setDate(sevenDaysBeforeEnd.getDate() - 7);

    for (let i = 6; i >= 0; i--) {
      const d = new Date(toDate);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const nextD = new Date(d);
      nextD.setDate(d.getDate() + 1);

      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      const dayCount = filteredAttendance.filter(r => {
        const rDate = r.clock_in?.toDate ? r.clock_in.toDate() : new Date(r.clock_in);
        return rDate >= d && rDate < nextD;
      }).length;

      weeklyData.push({ day: dayName, count: dayCount });
    }

    setStats(prev => ({
      ...prev,
      total_staff: filteredStaff.length,
      present_today: presentCount,
      active_now: activeNowCount,
      pending_clockouts: pendingClockouts,
      completed_shifts: completedShiftsList,
      total_hours_period: totalHoursPeriod,
      recent_activity: recentActivity,
      weekly_data: weeklyData
    }));

    try {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(todayStart); todayEnd.setDate(todayEnd.getDate() + 1);
      const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1);
      const yesterdayEnd = new Date(todayStart);

      const thisWeekStart = new Date(todayStart);
      thisWeekStart.setDate(todayStart.getDate() - todayStart.getDay());

      const lastWeekStart = new Date(thisWeekStart);
      lastWeekStart.setDate(lastWeekStart.getDate() - 7);
      const lastWeekEnd = new Date(thisWeekStart);

      const thisMonthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
      const startOfLastMonth = new Date(todayStart.getFullYear(), todayStart.getMonth() - 1, 1);
      const lastMonthEnd = new Date(todayStart.getFullYear(), todayStart.getMonth(), 0);

      // Determine date range for snapshot filtering
      let fetchFrom = null;
      let fetchTo = null;

      if (['today_vs', 'today', 'yesterday'].includes(snapshotPeriod)) {
        fetchFrom = new Date(yesterdayStart);
        fetchTo = new Date(todayEnd);
      } else if (['week_vs', 'this_week'].includes(snapshotPeriod)) {
        fetchFrom = new Date(lastWeekStart);
        fetchTo = new Date(todayEnd);
      } else if (['month_vs', 'this_month'].includes(snapshotPeriod)) {
        fetchFrom = new Date(startOfLastMonth);
        fetchTo = new Date(todayEnd);
      } else if (snapshotPeriod === 'custom') {
        fetchFrom = new Date(snapshotCustomDates.from);
        fetchFrom.setHours(0, 0, 0, 0);
        fetchTo = new Date(snapshotCustomDates.to);
        fetchTo.setDate(fetchTo.getDate() + 1);
        fetchTo.setHours(0, 0, 0, 0);
      }

      const costQueryStart = fetchFrom ? new Date(Math.min(startOfLastMonth.getTime(), fetchFrom.getTime())) : startOfLastMonth;

      const costRecordsQuery = query(
        collection(db, "attendance"),
        where("clock_in", ">=", costQueryStart)
      );

      const costSnap = await getDocs(costRecordsQuery);
      const costRecords = costSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      const staffMap = {};
      staffList.forEach(s => staffMap[s.id] = { ...s, hourly_rate: parseFloat(s.hourly_rate) || 0 });

      const filteredCostRecords = costRecords.filter(r => {
        const s = staffMap[r.staff_id];
        if (!s) return false;

        if (isSuper) {
          if (selectedRestaurant) {
            const selectedRest = restaurants.find(res => String(res.id) === String(selectedRestaurant));
            const restName = selectedRest?.restaurant_name;
            const sRestId = String(s.restaurant_id || "");
            const sCreatedBy = String(s.created_by || "");
            const sRestName = String(s.restaurant_name || "");

            const matches = sRestId === String(selectedRestaurant) ||
              sCreatedBy === String(selectedRestaurant) ||
              (restName && sRestId === String(restName)) ||
              (restName && sRestName === String(restName));
            if (!matches) return false;
          }
        } else {
          if (restaurantId) {
            const selectedRest = restaurants.find(res => String(res.id) === String(restaurantId));
            const restName = selectedRest?.restaurant_name;
            const sRestId = String(s.restaurant_id || "");
            const sCreatedBy = String(s.created_by || "");
            const sRestName = String(s.restaurant_name || "");

            const matches = sRestId === String(restaurantId) ||
              sCreatedBy === String(restaurantId) ||
              (restName && sRestId === String(restName)) ||
              (restName && sRestName === String(restName));
            if (!matches) return false;
          }
        }
        return true;
      });

      const costMetrics = {
        today: 0, yesterday: 0,
        thisWeek: 0, lastWeek: 0,
        thisMonth: 0, lastMonth: 0,
        selectedPeriod: 0, prevSelectedPeriod: 0
      };

      filteredCostRecords.forEach(r => {
        if (!r.clock_in || !r.clock_out) return;
        const cin = r.clock_in?.toDate ? r.clock_in.toDate() : new Date(r.clock_in);
        const mins = calcCalculatedMinutes(r.clock_in, r.clock_out);
        const hours = mins / 60;
        const rate = staffMap[r.staff_id].hourly_rate;
        const cost = hours * rate;

        if (cin >= todayStart && cin < todayEnd) costMetrics.today += cost;
        if (cin >= yesterdayStart && cin < yesterdayEnd) costMetrics.yesterday += cost;
        if (cin >= thisWeekStart) costMetrics.thisWeek += cost;
        if (cin >= lastWeekStart && cin < lastWeekEnd) costMetrics.lastWeek += cost;
        if (cin >= thisMonthStart) costMetrics.thisMonth += cost;
        if (cin >= startOfLastMonth && cin < lastMonthEnd) costMetrics.lastMonth += cost;

        if (fetchFrom && fetchTo) {
          let pFrom, pTo, cFrom, cTo;
          if (snapshotPeriod === 'today_vs') {
            cFrom = todayStart; cTo = todayEnd;
            pFrom = yesterdayStart; pTo = yesterdayEnd;
          } else if (snapshotPeriod === 'week_vs') {
            cFrom = thisWeekStart; cTo = todayEnd;
            pFrom = lastWeekStart; pTo = lastWeekEnd;
          } else if (snapshotPeriod === 'month_vs') {
            cFrom = thisMonthStart; cTo = todayEnd;
            pFrom = startOfLastMonth; pTo = lastMonthEnd;
          } else if (snapshotPeriod === 'custom') {
            cFrom = fetchFrom; cTo = fetchTo;
            const durationMs = cTo.getTime() - cFrom.getTime();
            pFrom = new Date(cFrom.getTime() - durationMs);
            pTo = new Date(cTo.getTime() - durationMs);
          }
          if (cFrom && cin >= cFrom && cin < cTo) costMetrics.selectedPeriod += cost;
          if (pFrom && cin >= pFrom && cin < pTo) costMetrics.prevSelectedPeriod += cost;
        }
      });

      const currAgg = {};
      const prevAgg = {};
      const singleAgg = {};
      const compareRestAgg = {};

      filteredCostRecords.forEach(r => {
        if (!r.clock_in || !r.clock_out) return;
        if (r.location_out === "System Auto-Logout" && (!r.edit_reason || r.edit_reason.trim() === "")) return;
        const cin = r.clock_in?.toDate ? r.clock_in.toDate() : new Date(r.clock_in);

        const s = staffMap[r.staff_id];
        const rest = isSuper && restaurants ? restaurants.find(res => String(res.id) === String(s?.restaurant_id || s?.created_by)) : null;
        const rId = rest?.id || s?.restaurant_id || 'unknown';

        if (!snapshotCompareMode && snapshotRestaurant !== "all" && String(rId) !== String(snapshotRestaurant)) return;

        let isCurr = false;
        let isPrev = false;
        let isSingle = false;

        if (snapshotPeriod === 'today_vs') {
          if (cin >= todayStart && cin < todayEnd) isCurr = true;
          else if (cin >= yesterdayStart && cin < yesterdayEnd) isPrev = true;
        } else if (snapshotPeriod === 'week_vs') {
          if (cin >= thisWeekStart) isCurr = true;
          else if (cin >= lastWeekStart && cin < lastWeekEnd) isPrev = true;
        } else if (snapshotPeriod === 'month_vs') {
          if (cin >= thisMonthStart) isCurr = true;
          else if (cin >= startOfLastMonth && cin < lastMonthEnd) isPrev = true;
        } else if (snapshotPeriod === 'today') {
          if (cin >= todayStart && cin < todayEnd) isSingle = true;
        } else if (snapshotPeriod === 'yesterday') {
          if (cin >= yesterdayStart && cin < yesterdayEnd) isSingle = true;
        } else if (snapshotPeriod === 'this_week') {
          if (cin >= thisWeekStart) isSingle = true;
        } else if (snapshotPeriod === 'this_month') {
          if (cin >= thisMonthStart) isSingle = true;
        } else if (snapshotPeriod === 'custom') {
          const cFrom = new Date(snapshotCustomDates.from);
          const cTo = new Date(snapshotCustomDates.to);
          cTo.setDate(cTo.getDate() + 1); // Include end day fully
          if (cin >= cFrom && cin < cTo) isSingle = true;
        }

        if (!snapshotCompareMode && (isCurr || isPrev || isSingle)) {
          const mins = calcCalculatedMinutes(r.clock_in, r.clock_out);
          if (mins > 0) {
            const aggTarget = isSingle ? singleAgg : (isCurr ? currAgg : prevAgg);
            if (!aggTarget[r.staff_id]) aggTarget[r.staff_id] = { mins: 0, cost: 0 };
            aggTarget[r.staff_id].mins += mins;
            aggTarget[r.staff_id].cost += (mins / 60) * (staffMap[r.staff_id]?.hourly_rate || 0);
          }
        }

        const isCompareTime = ['today', 'yesterday', 'this_week', 'this_month', 'custom'].includes(snapshotPeriod) ? isSingle : isCurr;

        if (snapshotCompareMode && isCompareTime) {
          const mins = calcCalculatedMinutes(r.clock_in, r.clock_out);
          if (mins > 0) {
            if (!compareRestAgg[rId]) compareRestAgg[rId] = {};
            if (!compareRestAgg[rId][r.staff_id]) compareRestAgg[rId][r.staff_id] = { mins: 0, cost: 0 };
            compareRestAgg[rId][r.staff_id].mins += mins;
            compareRestAgg[rId][r.staff_id].cost += (mins / 60) * (staffMap[r.staff_id]?.hourly_rate || 0);
          }
        }
      });

      const getSnapshotPeriodStats = (aggData) => {
        let topEmp = null;
        let totalMins = 0;
        let presentCount = Object.keys(aggData).length;
        let totalCost = 0;
        const staff_list = [];

        Object.keys(aggData).forEach(id => {
          const agg = aggData[id];
          totalMins += agg.mins;
          totalCost += agg.cost;
          const s = staffList.find(staff => staff.id === id);

          const empData = {
            id,
            name: s?.full_name || "Unknown",
            designation: s?.designation || "Staff",
            image: s?.profile_image || null,
            restaurant_name: s?.restaurant_name || "Unknown",
            hours: (agg.mins / 60).toFixed(1),
            cost: agg.cost.toFixed(2)
          };
          staff_list.push(empData);
          if (!topEmp || Number(empData.cost) > Number(topEmp.cost)) {
            topEmp = empData;
          }
        });

        staff_list.sort((a, b) => Number(b.cost) - Number(a.cost));

        return {
          total_hours: (totalMins / 60).toFixed(1),
          total_cost: totalCost.toFixed(2),
          present_count: presentCount,
          top_employee: topEmp,
          staff_list: staff_list
        };
      };

      const compareRestaurantsStats = [];
      Object.keys(compareRestAgg).forEach(rId => {
        const rest = restaurants.find(res => String(res.id) === String(rId));
        compareRestaurantsStats.push({
          restaurant_id: String(rId),
          restaurant_name: rest?.restaurant_name || "Unknown Restaurant",
          stats: getSnapshotPeriodStats(compareRestAgg[rId])
        });
      });

      const snapshotData = {
        curr: getSnapshotPeriodStats(currAgg),
        prev: getSnapshotPeriodStats(prevAgg),
        single: getSnapshotPeriodStats(singleAgg),
        compare: compareRestaurantsStats
      };

      setStats(prev => ({
        ...prev,
        snapshot: snapshotData,
        cost_metrics: costMetrics
      }));
    } catch (error) {
      console.error("Error in calculateStaffStats:", error);
    }

    setLoading(false);
  };

  const handleEmailSnapshot = async () => {
    setSendingEmail(true);
    try {
      const html2pdfModule = await import('html2pdf.js');
      const html2pdf = html2pdfModule.default || html2pdfModule;

      const reportDate = new Date().toLocaleDateString('en-GB');
      const reportTime = new Date().toLocaleString('en-GB');
      let pLabel1 = "";
      let pLabel2 = "";
      let isComparative = false;

      if (snapshotCompareMode) {
        pLabel1 = `Restaurant Comparison - ` + (snapshotPeriod === 'custom' ? `Custom Range: ${snapshotCustomDates.from} to ${snapshotCustomDates.to}` : {
          today_vs: "Today", week_vs: "This Week", month_vs: "This Month",
          today: "Today", yesterday: "Yesterday", this_week: "This Week", this_month: "This Month"
        }[snapshotPeriod]);
      } else if (['today_vs', 'week_vs', 'month_vs'].includes(snapshotPeriod)) {
        isComparative = true;
        pLabel1 = snapshotPeriod === 'today_vs' ? 'Today' : snapshotPeriod === 'week_vs' ? 'This Week' : 'This Month';
        pLabel2 = snapshotPeriod === 'today_vs' ? 'Yesterday' : snapshotPeriod === 'week_vs' ? 'Last Week' : 'Last Month';
      } else if (snapshotPeriod === 'custom') {
        pLabel1 = `Custom Range: ${snapshotCustomDates.from} to ${snapshotCustomDates.to}`;
      } else {
        pLabel1 = {
          today: "Today's Totals",
          yesterday: "Yesterday's Totals",
          this_week: "This Week's Totals",
          this_month: "This Month's Totals"
        }[snapshotPeriod];
      }

      const effectiveRestId = snapshotCompareMode 
        ? null 
        : (isSuper 
            ? (snapshotRestaurant !== 'all' ? snapshotRestaurant : (selectedRestaurant || 'all'))
            : (String(userData?.restaurant_id || ''))
          );

      const restLabel = snapshotCompareMode
        ? `${snapshotCompareRestIds.length} Restaurants Selected`
        : (effectiveRestId === 'all' || !effectiveRestId
            ? 'All Restaurants'
            : (isSuper 
                 ? restaurants.find(r => String(r.id) === String(effectiveRestId))?.restaurant_name || 'Selected Restaurant'
                 : userData?.restaurant_name || restaurants.find(r => String(r.id) === String(effectiveRestId))?.restaurant_name || 'Selected Restaurant'
              )
          );

      const filterDetailsHtml = `
        <div style="background:#f8fafc;border:1px solid #e2e8f0;padding:15px;border-radius:8px;margin-bottom:20px;font-size:13px;">
          <p style="margin:0 0 5px 0;color:#64748b;"><strong>Report Details:</strong></p>
          <ul style="margin:0;padding-left:20px;color:#334155;line-height:1.6;">
            <li><strong>Restaurant:</strong> ${restLabel}</li>
            <li><strong>Period:</strong> ${snapshotPeriod === 'custom' ? `Custom (${snapshotCustomDates.from} to ${snapshotCustomDates.to})` : pLabel1.replace('Totals', '').trim()}</li>
            ${snapshotCompareMode ? `<li><strong>Compare Mode:</strong> Enabled</li>` : ''}
            <li><strong>Generated:</strong> ${reportTime}</li>
          </ul>
        </div>
      `;

      let reportHtml = "";

      if (snapshotCompareMode) {
        const compareRows = snapshotCompareRestIds.map(rId => {
          const restData = stats.snapshot?.compare?.find(c => String(c.restaurant_id) === String(rId));
          const restName = restaurants.find(r => String(r.id) === String(rId))?.restaurant_name || "Unknown Restaurant";
          const pCount = restData?.stats?.present_count || 0;
          const tHours = restData?.stats?.total_hours || "0.0";
          const tCost = restData?.stats?.total_cost || "0.00";
          const topEmp = restData?.stats?.top_employee || null;

          return `
          <tr style="border-bottom:1px solid #e5e7eb; page-break-inside: avoid;">
            <td style="padding:10px;font-size:13px;font-weight:bold;">${restName}</td>
            <td style="padding:10px;font-size:13px;text-align:center;">${pCount}</td>
            <td style="padding:10px;font-size:13px;text-align:right;">${tHours}h</td>
            <td style="padding:10px;font-size:13px;text-align:right;color:#b45309;font-weight:bold;">£${tCost}</td>
            <td style="padding:10px;font-size:13px;">${topEmp ? `${topEmp.name} (£${topEmp.cost})` : 'N/A'}</td>
          </tr>
        `}).join('') || `<tr><td colspan="5" style="padding:20px;text-align:center;color:#9ca3af;font-size:13px;font-style:italic;">No restaurants selected for comparison.</td></tr>`;

        reportHtml = `<div style="font-family:Arial,Helvetica,sans-serif;color:#111827;max-width:800px;margin:0 auto;background:#fff;padding:0;">
          <div style="background-color:#0b1a3d;padding:28px 36px;margin-bottom:20px;">
            <table style="width: 100%; border-collapse:collapse;">
              <tr>
                <td style="vertical-align: top;">
                  <div style="color:#D0B079;font-size:24px;font-weight:900;">DigitalBotSolutions</div>
                  <div style="color:#9ca3af;font-size:10px;letter-spacing:3px;text-transform:uppercase;margin-top:3px;">Restaurant Comparison Report</div>
                </td>
                <td style="vertical-align: top; text-align: right;">
                  <img src="${logoBase64}" style="display:block; width:120px; height:40px; margin-left:auto; object-fit:contain; margin-bottom:5px;" alt="Logo" />
                </td>
              </tr>
            </table>
          </div>
          <div style="padding:0 40px 40px 40px;">
          ${filterDetailsHtml}
          <h2 style="color:#1e40af;margin:0 0 15px 0;font-size:18px;text-transform:uppercase;">${pLabel1}</h2>
          
          <table style="width:100%;border-collapse:collapse;margin-bottom:30px;text-align:left;">
            <thead>
              <tr style="background:#f3f4f6;border-bottom:2px solid #e5e7eb;">
                <th style="padding:10px;font-size:11px;color:#374151;text-transform:uppercase;">Restaurant</th>
                <th style="padding:10px;font-size:11px;color:#374151;text-transform:uppercase;text-align:center;">Members</th>
                <th style="padding:10px;font-size:11px;color:#374151;text-transform:uppercase;text-align:right;">Total Hours</th>
                <th style="padding:10px;font-size:11px;color:#374151;text-transform:uppercase;text-align:right;">Total Pay</th>
                <th style="padding:10px;font-size:11px;color:#374151;text-transform:uppercase;">Top Earner</th>
              </tr>
            </thead>
            <tbody>
              ${compareRows}
            </tbody>
          </table>
          <p style="color:#9ca3af;font-size:11px;text-align:center;">Generated on ${reportTime}</p>
        </div>`;
      } else if (isComparative) {
        reportHtml = `<div style="font-family:Arial,sans-serif;color:#111827;max-width:800px;margin:0 auto;background:#fff;padding:40px;">
          <h1 style="color:#1e3a5f;margin:0 0 5px 0;">DigitalBotSolutions</h1>
          <p style="color:#6b7280;text-transform:uppercase;font-size:12px;margin:0 0 20px 0;letter-spacing:1px;">Period Snapshot Report</p>
          ${filterDetailsHtml}
                   <table style="width:100%;border-collapse:collapse;margin-bottom:30px;">
            <tr>
              <td style="width:50%;vertical-align:top;padding-right:15px;">
                <div style="background:#f8fafc;border:1px solid #e2e8f0;padding:20px;border-radius:8px;">
                  <h3 style="color:#3b82f6;margin:0 0 15px 0;font-size:16px;text-transform:uppercase;">${pLabel1}</h3>
                  <div style="margin-bottom:15px;">
                    <p style="font-size:11px;color:#64748b;text-transform:uppercase;margin:0 0 4px 0;">Total Members</p>
                    <p style="font-size:24px;font-weight:bold;margin:0;color:#0f172a;">${stats.snapshot?.curr?.present_count || 0}</p>
                  </div>
                  <div style="margin-bottom:15px;">
                    <p style="font-size:11px;color:#64748b;text-transform:uppercase;margin:0 0 4px 0;">Total Hours</p>
                    <p style="font-size:18px;font-weight:bold;margin:0;color:#0f172a;">${stats.snapshot?.curr?.total_hours || 0}h</p>
                  </div>
                  <div>
                    <p style="font-size:11px;color:#64748b;text-transform:uppercase;margin:0 0 4px 0;">Total Pay</p>
                    <p style="font-size:18px;font-weight:bold;margin:0;color:#3b82f6;">£${stats.snapshot?.curr?.total_cost || "0.00"}</p>
                  </div>
                </div>
              </td>
              <td style="width:50%;vertical-align:top;padding-left:15px;">
                <div style="background:#f8fafc;border:1px solid #e2e8f0;padding:20px;border-radius:8px;">
                  <h3 style="color:#64748b;margin:0 0 15px 0;font-size:16px;text-transform:uppercase;">${pLabel2}</h3>
                  <div style="margin-bottom:15px;">
                    <p style="font-size:11px;color:#64748b;text-transform:uppercase;margin:0 0 4px 0;">Total Members</p>
                    <p style="font-size:24px;font-weight:bold;margin:0;color:#0f172a;">${stats.snapshot?.prev?.present_count || 0}</p>
                  </div>
                  <div style="margin-bottom:15px;">
                    <p style="font-size:11px;color:#64748b;text-transform:uppercase;margin:0 0 4px 0;">Total Hours</p>
                    <p style="font-size:18px;font-weight:bold;margin:0;color:#0f172a;">${stats.snapshot?.prev?.total_hours || 0}h</p>
                  </div>
                  <div>
                    <p style="font-size:11px;color:#64748b;text-transform:uppercase;margin:0 0 4px 0;">Total Pay</p>
                    <p style="font-size:18px;font-weight:bold;margin:0;color:#64748b;">£${stats.snapshot?.prev?.total_cost || "0.00"}</p>
                  </div>
                </div>
              </td>
            </tr>
          </table>
          <p style="color:#9ca3af;font-size:11px;text-align:center;">Generated on ${reportTime}</p>
          </div>
        </div>`;
      } else {
        const staffRows = stats.snapshot?.single?.staff_list?.map(s => `
          <tr style="border-bottom:1px solid #e5e7eb; page-break-inside: avoid;">
            <td style="padding:10px;font-size:13px;font-weight:bold;">${s.name}</td>
            <td style="padding:10px;font-size:13px;color:#6b7280;">${s.designation}</td>
            <td style="padding:10px;font-size:13px;color:#6b7280;">${s.restaurant_name}</td>
            <td style="padding:10px;font-size:13px;text-align:right;">${s.hours}h</td>
            <td style="padding:10px;font-size:13px;text-align:right;color:#d97706;font-weight:bold;">£${s.cost}</td>
          </tr>
        `).join('') || `<tr><td colspan="5" style="padding:20px;text-align:center;color:#9ca3af;font-size:13px;font-style:italic;">No records found for this period.</td></tr>`;

        reportHtml = `<div style="font-family:Arial,Helvetica,sans-serif;color:#111827;max-width:800px;margin:0 auto;background:#fff;padding:0;">
          <div style="background-color:#0b1a3d;padding:28px 36px;margin-bottom:20px;">
            <table style="width: 100%; border-collapse:collapse;">
              <tr>
                <td style="vertical-align: top;">
                  <div style="color:#D0B079;font-size:24px;font-weight:900;">DigitalBotSolutions</div>
                  <div style="color:#9ca3af;font-size:10px;letter-spacing:3px;text-transform:uppercase;margin-top:3px;">Period Snapshot Report</div>
                </td>
                <td style="vertical-align: top; text-align: right;">
                  <img src="${logoBase64}" style="display:block; width:120px; height:40px; margin-left:auto; object-fit:contain; margin-bottom:5px;" alt="Logo" />
                </td>
              </tr>
            </table>
          </div>
          <div style="padding:0 40px 40px 40px;">
          ${filterDetailsHtml}
          
          <div style="background:#f8fafc;border:1px solid #e2e8f0;padding:30px;border-radius:8px;max-width:600px;margin:0 auto 30px auto;">
            <h3 style="color:#d97706;margin:0 0 20px 0;font-size:18px;text-transform:uppercase;text-align:center;">${pLabel1}</h3>
            <table style="width:100%; border-collapse:collapse;">
              <tr>
                <td style="text-align:center; width:33%;">
                  <p style="font-size:12px;color:#64748b;text-transform:uppercase;margin:0 0 5px 0;">Total Members</p>
                  <p style="font-size:28px;font-weight:bold;margin:0;color:#0f172a;">${stats.snapshot?.single?.present_count || 0}</p>
                </td>
                <td style="text-align:center; width:33%; border-left:1px solid #e2e8f0; border-right:1px solid #e2e8f0;">
                  <p style="font-size:12px;color:#64748b;text-transform:uppercase;margin:0 0 5px 0;">Total Hours</p>
                  <p style="font-size:24px;font-weight:bold;margin:0;color:#0f172a;">${stats.snapshot?.single?.total_hours || 0}h</p>
                </td>
                <td style="text-align:center; width:33%;">
                  <p style="font-size:12px;color:#64748b;text-transform:uppercase;margin:0 0 5px 0;">Total Pay</p>
                  <p style="font-size:24px;font-weight:bold;margin:0;color:#d97706;">£${stats.snapshot?.single?.total_cost || "0.00"}</p>
                </td>
              </tr>
            </table>
          </div>

          <table style="width:100%;border-collapse:collapse;margin-bottom:30px;text-align:left;">
            <thead>
              <tr style="background:#f3f4f6;border-bottom:2px solid #e5e7eb;">
                <th style="padding:10px;font-size:11px;color:#374151;text-transform:uppercase;">Staff Member</th>
                <th style="padding:10px;font-size:11px;color:#374151;text-transform:uppercase;">Designation</th>
                <th style="padding:10px;font-size:11px;color:#374151;text-transform:uppercase;">Restaurant</th>
                <th style="padding:10px;font-size:11px;color:#374151;text-transform:uppercase;text-align:right;">Hours</th>
                <th style="padding:10px;font-size:11px;color:#374151;text-transform:uppercase;text-align:right;">Total Pay</th>
              </tr>
            </thead>
            <tbody>
              ${staffRows}
            </tbody>
          </table>

          <p style="color:#9ca3af;font-size:11px;text-align:center;">Generated on ${reportTime}</p>
          </div>
        </div>`;
      }

      const opt = {
        margin: 10,
        filename: `snapshot_report_${reportDate.replace(/\//g, '-')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] }
      };

      const pdfBase64 = await html2pdf().from(reportHtml).set(opt).outputPdf('datauristring');

      const sendEmailReportFunc = httpsCallable(functionsInstance, "sendEmailReport");
      const emailHtmlBody = `<div style="font-family:Arial,sans-serif;color:#333;max-width:600px;margin:0 auto;">
          <div style="background:#0b1a3d;padding:30px;border-radius:12px 12px 0 0;text-align:center;">
            <h1 style="color:#D0B079;margin:0;font-size:24px;font-weight:800;">DigitalBotSolutions</h1>
            <p style="color:#9ca3af;margin:8px 0 0;font-size:13px;letter-spacing:2px;text-transform:uppercase;">Snapshot Report</p>
          </div>
          <div style="background:#f9fafb;padding:30px;border:1px solid #e5e7eb;">
            <p style="font-size:15px;color:#374151;">Dear Team,</p>
            <p style="font-size:15px;color:#374151;line-height:1.6;">Attached is the ${pLabel1} snapshot report as a PDF.</p>
            <div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin:20px 0;">
              <table style="width:100%;border-collapse:collapse;">
                <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Restaurant(s)</td><td style="padding:8px 0;font-weight:600;color:#111827;font-size:13px;">${restLabel}</td></tr>
                <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Period</td><td style="padding:8px 0;font-weight:600;color:#111827;font-size:13px;">${pLabel1}</td></tr>
                <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Generated</td><td style="padding:8px 0;font-weight:600;color:#111827;font-size:13px;">${reportTime}</td></tr>
              </table>
            </div>
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

      await sendEmailReportFunc({
        to: recipientEmails,
        subject: `Period Snapshot Report - ${restLabel} - ${pLabel1}`,
        htmlBody: emailHtmlBody,
        attachmentUrl: pdfBase64,
        attachmentName: opt.filename
      });

      showPopup({ title: "Email Sent", message: "Snapshot report sent to your email successfully.", type: "success" });
    } catch (err) {
      console.error("Error generating/sending snapshot PDF:", err);
      showPopup({ title: "Email Failed", message: "Failed to send the report.", type: "error" });
    } finally {
      setSendingEmail(false);
    }
  };



  return (
    <div className="min-h-screen bg-gradient-to-br from-[#071428] via-[#0d1f45] to-[#071428] text-white font-sans selection:bg-[#D0B079]/30">
      <style dangerouslySetInnerHTML={{
        __html: `
            .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
            .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
            .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }
            .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.2); }
        `}} />
      <Header onToggleSidebar={() => setSidebarOpen((s) => !s)} darkMode={true} />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className={`flex-1 flex flex-col transition-all duration-300 ease-in-out ${sidebarOpen ? "lg:pl-72" : "lg:pl-0"}`}>
        <main className="flex-1 pt-24 lg:pt-20 pb-12 px-4 sm:px-6 lg:px-10 transition-all duration-300 ease-in-out">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col items-center text-center mt-2 mb-6 sm:mb-10 lg:mb-12 gap-6 sm:gap-8">
              <div>
                <h1 className="text-3xl sm:text-4xl font-bold text-white drop-shadow-lg tracking-tight whitespace-nowrap">
                  Welcome, {userData?.name || "Admin"}
                </h1>
                <p className="text-white/60 mt-2 text-sm tracking-wider font-medium">Real-time overview of your team's attendance and performance</p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-3xl mx-auto mt-6 z-40">
                  {isSuper && (
                    <>
                      {/* Restaurant Dropdown Container */}
                      <div className="relative w-full sm:w-auto">
                        <button
                          onClick={() => { setShowRestaurantMenu(!showRestaurantMenu); setShowUserMenu(false); setShowPeriodMenu(false); }}
                          className="w-full sm:w-auto flex items-center justify-between sm:justify-start gap-3 px-6 py-3.5 bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 text-white/80 font-semibold hover:bg-white/10 transition-all text-sm tracking-wider shadow-xl group"
                        >
                          <LayoutDashboard size={18} className="text-[#D0B079] group-hover:scale-110 transition-transform" />
                          <span className="flex-1 sm:min-w-[160px] text-left">
                            {selectedRestaurant ? (restaurants.find(r => String(r.id) === String(selectedRestaurant))?.restaurant_name || "Select Restaurant") : "All Restaurants"}
                          </span>
                          <ChevronDown size={16} className={`transition-transform duration-300 ${showRestaurantMenu ? 'rotate-180' : ''}`} />
                        </button>

                        <AnimatePresence>
                          {showRestaurantMenu && (
                            <motion.div
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: 10 }}
                              className="absolute top-full left-0 mt-3 w-72 bg-[#0b1a3d] border border-white/10 rounded-2xl shadow-2xl z-[100] py-2 overflow-hidden"
                            >
                              <div className="px-4 py-2 border-b border-white/5 mb-1">
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Switch Restaurant View</p>
                              </div>
                              <div className="max-h-64 overflow-y-auto custom-scrollbar">
                                <button
                                  onClick={() => {
                                    setSelectedRestaurant("");
                                    setShowRestaurantMenu(false);
                                  }}
                                  className={`w-full px-5 py-3 text-left hover:bg-white/5 transition-colors text-sm font-medium flex items-center justify-between ${selectedRestaurant === "" ? 'text-[#D0B079] bg-[#D0B079]/5' : 'text-white/60'}`}
                                >
                                  All Restaurants
                                  {selectedRestaurant === "" && <div className="w-1.5 h-1.5 rounded-full bg-[#D0B079] shadow-[0_0_8px_#D0B079]" />}
                                </button>
                                {restaurants.map((r) => (
                                  <button
                                    key={r.id}
                                    onClick={() => {
                                      setSelectedRestaurant(String(r.id));
                                      setShowRestaurantMenu(false);
                                    }}
                                    className={`w-full px-5 py-3 text-left hover:bg-white/5 transition-colors text-sm font-medium flex items-center justify-between ${String(selectedRestaurant) === String(r.id) ? 'text-[#D0B079] bg-[#D0B079]/5' : 'text-white/60'}`}
                                  >
                                    {r.restaurant_name}
                                    {String(selectedRestaurant) === String(r.id) && <div className="w-1.5 h-1.5 rounded-full bg-[#D0B079] shadow-[0_0_8px_#D0B079]" />}
                                  </button>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* User Dropdown Container */}
                      <div className="relative w-full sm:w-auto">
                        <button
                          onClick={() => { setShowUserMenu(!showUserMenu); setShowRestaurantMenu(false); setShowPeriodMenu(false); }}
                          className={`w-full sm:w-auto flex items-center justify-between sm:justify-start gap-3 px-6 py-3.5 backdrop-blur-md rounded-2xl border font-semibold hover:bg-white/10 transition-all text-sm tracking-wider shadow-xl group ${selectedUser ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-white/5 border-white/10 text-white/80'
                            }`}
                        >
                          <User size={18} className="text-emerald-400 group-hover:scale-110 transition-transform" />
                          <span className="flex-1 sm:min-w-[120px] text-left truncate">
                            {selectedUser ? (allStaffList.find(s => s.id === selectedUser)?.full_name || "Selected User") : "All Users"}
                          </span>
                          <ChevronDown size={16} className={`transition-transform duration-300 ${showUserMenu ? 'rotate-180' : ''}`} />
                        </button>

                        <AnimatePresence>
                          {showUserMenu && (
                            <motion.div
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: 10 }}
                              className="absolute top-full left-0 mt-3 w-80 bg-[#0b1a3d] border border-white/10 rounded-2xl shadow-2xl z-[100] py-2 overflow-hidden"
                            >
                              <div className="px-4 py-2 border-b border-white/5 mb-1">
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Filter by Staff Member</p>
                              </div>
                              <div className="px-3 py-2">
                                <div className="relative">
                                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                                  <input
                                    type="text"
                                    value={userSearch}
                                    onChange={(e) => setUserSearch(e.target.value)}
                                    placeholder="Search staff..."
                                    className="w-full pl-9 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-emerald-500/40 transition-all"
                                  />
                                </div>
                              </div>
                              <div className="max-h-56 overflow-y-auto custom-scrollbar">
                                <button
                                  onClick={() => {
                                    setSelectedUser("");
                                    setShowUserMenu(false);
                                    setUserSearch("");
                                  }}
                                  className={`w-full px-5 py-3 text-left hover:bg-white/5 transition-colors text-sm font-medium flex items-center justify-between ${selectedUser === "" ? 'text-emerald-400 bg-emerald-500/5' : 'text-white/60'}`}
                                >
                                  All Users
                                  {selectedUser === "" && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />}
                                </button>
                                {allStaffList
                                  .filter(s => !userSearch || s.full_name?.toLowerCase().includes(userSearch.toLowerCase()) || s.email?.toLowerCase().includes(userSearch.toLowerCase()))
                                  .map((s) => (
                                    <button
                                      key={s.id}
                                      onClick={() => {
                                        setSelectedUser(s.id);
                                        setShowUserMenu(false);
                                        setUserSearch("");
                                      }}
                                      className={`w-full px-5 py-3 text-left hover:bg-white/5 transition-colors text-sm font-medium flex items-center justify-between gap-2 ${selectedUser === s.id ? 'text-emerald-400 bg-emerald-500/5' : 'text-white/60'}`}
                                    >
                                      <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-[10px] font-bold text-[#D0B079] shrink-0 overflow-hidden">
                                          {s.profile_image ? <img src={s.profile_image} className="w-full h-full object-cover" alt="" /> : s.full_name?.[0]?.toUpperCase()}
                                        </div>
                                        <div className="min-w-0">
                                          <p className="truncate text-sm">{s.full_name}</p>
                                          <p className="text-[10px] text-white/30 truncate">{s.designation || 'Staff'}</p>
                                        </div>
                                      </div>
                                      {selectedUser === s.id && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399] shrink-0" />}
                                    </button>
                                  ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </>
                  )}

                  {/* Period Filter Container */}
                  <div className="relative w-full sm:w-auto">
                    <button
                      onClick={() => { setShowPeriodMenu(!showPeriodMenu); setShowRestaurantMenu(false); setShowUserMenu(false); }}
                      className="w-full sm:w-auto flex items-center justify-between sm:justify-start gap-3 px-6 py-3.5 bg-[#D0B079]/10 backdrop-blur-md rounded-2xl border border-[#D0B079]/20 text-[#D0B079] font-semibold hover:bg-[#D0B079]/20 transition-all text-sm tracking-wider shadow-xl group"
                    >
                      <Filter size={18} className="group-hover:rotate-12 transition-transform" />
                      <span className="flex-1 sm:flex-none whitespace-nowrap">
                        {period === 'custom' ? `${dateRange.from} to ${dateRange.to}` :
                          period === '3days' ? 'Last 3 Days' :
                            period.charAt(0).toUpperCase() + period.slice(1)}
                      </span>
                      <ChevronDown size={16} className={`transition-transform duration-300 ${showPeriodMenu ? 'rotate-180' : ''}`} />
                    </button>

                    <AnimatePresence>
                      {showPeriodMenu && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className="absolute top-full right-0 sm:right-auto sm:left-0 mt-3 w-72 bg-[#0b1a3d] border border-white/10 rounded-2xl shadow-2xl z-[100] py-2 overflow-hidden"
                        >
                          <div className="px-4 py-2 border-b border-white/5 mb-1">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Select Date Range</p>
                          </div>
                          <div className="max-h-80 overflow-y-auto custom-scrollbar flex flex-col">
                            {[
                              { id: 'today', label: 'Today' },
                              { id: 'yesterday', label: 'Yesterday' },
                              { id: '3days', label: 'Last 3 Days' },
                              { id: 'week', label: 'This Week' },
                              { id: 'today_vs', label: 'Today vs. Yesterday' },
                              { id: 'week_vs', label: 'This Week vs. Last Week' },
                              { id: 'month_vs', label: 'This Month vs. Last Month' },
                              { id: 'custom', label: 'Custom Range' }
                            ].map((opt) => (
                              <div key={opt.id} className="w-full">
                                <button
                                  onClick={() => {
                                    handlePeriodChange(opt.id);
                                    if (opt.id !== 'custom') setShowPeriodMenu(false);
                                  }}
                                  className={`w-full px-5 py-3 text-left hover:bg-white/5 transition-colors text-sm font-medium flex items-center justify-between ${period === opt.id ? 'text-[#D0B079] bg-[#D0B079]/5' : 'text-white/60'}`}
                                >
                                  {opt.label}
                                  {period === opt.id && <div className="w-1.5 h-1.5 rounded-full bg-[#D0B079] shadow-[0_0_8px_#D0B079]" />}
                                </button>

                                {/* Inline Custom Date Picker */}
                                {opt.id === 'custom' && period === 'custom' && (
                                  <div className="px-5 pb-4 pt-2 bg-black/20 border-t border-white/5 space-y-3">
                                    <div>
                                      <label className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1 block">From</label>
                                      <input
                                        type="date"
                                        value={dateRange.from}
                                        onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white font-medium focus:outline-none focus:border-[#D0B079]/50 text-sm"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1 block">To</label>
                                      <input
                                        type="date"
                                        value={dateRange.to}
                                        onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white font-medium focus:outline-none focus:border-[#D0B079]/50 text-sm"
                                      />
                                    </div>
                                    <button
                                      onClick={() => setShowPeriodMenu(false)}
                                      className="w-full py-2 bg-[#D0B079]/20 text-[#D0B079] rounded-xl text-xs font-bold hover:bg-[#D0B079]/30 transition-all mt-2"
                                    >
                                      Apply Custom Range
                                    </button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>



            </div>

            <div className="mb-8 bg-[#0b1a3d] border border-white/10 rounded-2xl overflow-hidden backdrop-blur-md shadow-lg">
              <div
                onClick={() => setShowPendingClockouts(!showPendingClockouts)}
                className={`cursor-pointer w-full flex items-center justify-between p-4 sm:p-5 transition-all ${stats.pending_clockouts?.length > 0 ? 'bg-rose-500/10 hover:bg-rose-500/20' : 'bg-white/5 hover:bg-white/10'
                  }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`p-2.5 rounded-xl shrink-0 ${stats.pending_clockouts?.length > 0 ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                    {stats.pending_clockouts?.length > 0 ? <AlertTriangle size={20} /> : <CheckCircle size={20} />}
                  </div>
                  <div className="text-left">
                    <h3 className={`text-base font-bold mb-0.5 ${stats.pending_clockouts?.length > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                      Active Shifts Pending Clock-Out ({stats.pending_clockouts?.length || 0})
                    </h3>
                    <p className="text-xs text-white/60">
                      {stats.pending_clockouts?.length > 0
                        ? 'Staff members currently clocked in. Expand to view.'
                        : 'No active shifts at the moment.'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {stats.pending_clockouts?.length > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemindAll(e);
                      }}
                      disabled={sendingReminders}
                      className="flex items-center gap-2 px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-rose-500/20 disabled:opacity-50"
                    >
                      {sendingReminders ? <Loader2 size={14} className="animate-spin" /> : <BellRing size={14} />}
                      Remind All
                    </button>
                  )}
                  <ChevronDown size={20} className={`transition-transform duration-300 ${stats.pending_clockouts?.length > 0 ? 'text-rose-400' : 'text-emerald-400'} ${showPendingClockouts ? 'rotate-180' : ''}`} />
                </div>
              </div>

              <AnimatePresence>
                {showPendingClockouts && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="p-5 sm:p-6 border-t border-white/5">
                      {stats.pending_clockouts?.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {stats.pending_clockouts.map((staff, idx) => (
                            <div key={idx} className="flex items-center gap-3 bg-white/5 border border-white/10 p-3 rounded-xl">
                              <div className="w-10 h-10 rounded-lg overflow-hidden bg-rose-500/20 flex items-center justify-center shrink-0 border border-rose-500/30">
                                {staff.profile_image ? (
                                  <img src={staff.profile_image} alt={staff.full_name} className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-rose-400 font-black text-sm">{staff.full_name?.charAt(0)}</span>
                                )}
                              </div>
                              <div className="overflow-hidden">
                                <p className="text-sm font-bold text-white truncate">{staff.full_name}</p>
                                <p className="text-[10px] text-white/50 uppercase tracking-widest truncate">{staff.restaurant_name}</p>
                                <p className="text-[10px] font-mono text-rose-400/80 mt-0.5">In: {new Date(staff.clock_in?.toDate ? staff.clock_in.toDate() : staff.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <CheckCircle size={32} className="text-emerald-400/50 mx-auto mb-3" />
                          <p className="text-emerald-400 font-bold">All clear!</p>
                          <p className="text-white/50 text-sm mt-1">There are no staff members currently logged in.</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>


            {/* Completed Shifts Dropdown */}
            <div className="mb-8 bg-[#0b1a3d] border border-white/10 rounded-2xl overflow-hidden backdrop-blur-md shadow-lg">
              <div
                onClick={() => setShowYesterdayClockouts(!showYesterdayClockouts)}
                className={`cursor-pointer w-full flex items-center justify-between p-4 sm:p-5 transition-all ${stats.completed_shifts?.length > 0 ? 'bg-blue-500/10 hover:bg-blue-500/20' : 'bg-white/5 hover:bg-white/10'
                  }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`p-2.5 rounded-xl shrink-0 ${stats.completed_shifts?.length > 0 ? 'bg-blue-500/20 text-blue-400' : 'bg-white/10 text-white/40'}`}>
                    <History size={20} />
                  </div>
                  <div className="text-left">
                    <h3 className={`text-base font-bold mb-0.5 ${stats.completed_shifts?.length > 0 ? 'text-blue-400' : 'text-white/40'}`}>
                      Completed Shifts ({stats.completed_shifts?.length || 0})
                    </h3>
                    <p className="text-xs text-white/60">
                      {stats.completed_shifts?.length > 0
                        ? 'Staff members who completed shifts in this period. Expand to view.'
                        : 'No completed shifts recorded for this period.'}
                    </p>
                  </div>
                </div>
                <ChevronDown size={20} className={`transition-transform duration-300 ${stats.completed_shifts?.length > 0 ? 'text-blue-400' : 'text-white/40'} ${showYesterdayClockouts ? 'rotate-180' : ''}`} />
              </div>

              <AnimatePresence>
                {showYesterdayClockouts && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-white/5">
                      {stats.completed_shifts?.length > 0 ? (
                        <div className="overflow-x-auto max-h-[400px] custom-scrollbar">
                          <table className="w-full text-left">
                            <thead className="bg-white/5 border-b border-white/10 sticky top-0 z-10 backdrop-blur-md">
                              <tr>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-white/40">Staff Name</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-white/40">Restaurant</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-blue-400/70 text-right">Clock Out</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                              {stats.completed_shifts.map((staff, idx) => (
                                <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                                  <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-[#D0B079] font-bold text-xs overflow-hidden shrink-0">
                                        {staff.profile_image ? <img src={staff.profile_image} className="w-full h-full object-cover" /> : staff.full_name?.[0]}
                                      </div>
                                      <p className="text-white font-bold text-sm truncate">{staff.full_name}</p>
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 text-white/60 font-medium text-xs">{staff.restaurant_name}</td>
                                  <td className="px-6 py-4 text-right">
                                    <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg font-mono text-xs font-bold inline-block">
                                      {new Date(staff.clock_out?.toDate ? staff.clock_out.toDate() : staff.clock_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <History size={32} className="text-white/20 mx-auto mb-3" />
                          <p className="text-white/40 font-bold">No Data</p>
                          <p className="text-white/30 text-sm mt-1">There are no completed shifts for this period.</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>




            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-6 sm:mb-8">
              <StatCard
                title="Total Staff"
                value={stats.total_staff}
                subtext="Registered Members"
                icon={Users}
                colorClass="bg-[#D0B079]/20 border border-yellow-400/30"
                delay={0}
                onEyeClick={() => navigate('/allstaff')}
              />
              <StatCard
                title={period === 'custom' ? 'Present (Selected)' : period === 'today' ? 'Present Today' : `Present (${period.charAt(0).toUpperCase() + period.slice(1)})`}
                value={stats.present_today}
                subtext="Staff Members Active"
                icon={CheckCircle}
                colorClass="bg-emerald-500/20 border border-emerald-400/30"
                delay={0.1}
              />
              <StatCard
                title="Currently Active"
                value={stats.active_now}
                subtext="Currently Clocked In"
                icon={CheckCircle}
                colorClass="bg-emerald-500/20 border border-emerald-400/30"
                delay={0.2}
              />
              <StatCard
                title={period === 'custom' ? 'Total Hours' : period === 'today' ? 'Total Hours Today' : `Total Hours (${period.charAt(0).toUpperCase() + period.slice(1)})`}
                value={`${stats.total_hours_period}h`}
                subtext="Combined Work Time"
                icon={Clock}
                colorClass="bg-blue-500/20 border border-blue-400/30"
                delay={0.3}
              />
            </div>

            <div className="mb-8">
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <PoundSterling size={20} className="text-[#D0B079]" />
                Labour Cost Metrics
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
                <StatCard
                  title={
                    period === 'custom' ? 'Selected Period Cost' :
                      period === 'today' || period === 'today_vs' ? "Today's Cost" :
                        period === 'yesterday' ? "Yesterday's Cost" :
                          period === '3days' ? "Last 3 Days Cost" :
                            period === 'week' || period === 'week_vs' ? "This Week's Cost" :
                              period === 'month' || period === 'month_vs' ? "This Month's Cost" :
                                period === 'quarter' ? "This Qtr's Cost" :
                                  period === 'halfyear' ? "Half Year Cost" : "Selected Period Cost"
                  }
                  value={`£${(stats.cost_metrics?.selectedPeriod || 0).toFixed(2)}`}
                  subtext={`Prev Period: £${(stats.cost_metrics?.prevSelectedPeriod || 0).toFixed(2)}`}
                  icon={PoundSterling}
                  colorClass="bg-slate-500/20 border border-slate-400/30"
                  trend={stats.cost_metrics ? getTrend(stats.cost_metrics.selectedPeriod, stats.cost_metrics.prevSelectedPeriod) : null}
                  delay={0.1}
                />
                <StatCard
                  title="This Week's Cost"
                  value={`£${(stats.cost_metrics?.thisWeek || 0).toFixed(2)}`}
                  subtext={`Last Week: £${(stats.cost_metrics?.lastWeek || 0).toFixed(2)}`}
                  icon={PoundSterling}
                  colorClass="bg-slate-500/20 border border-slate-400/30"
                  trend={stats.cost_metrics ? getTrend(stats.cost_metrics.thisWeek, stats.cost_metrics.lastWeek) : null}
                  delay={0.2}
                />
                <StatCard
                  title="This Month's Cost"
                  value={`£${(stats.cost_metrics?.thisMonth || 0).toFixed(2)}`}
                  subtext={`Last Month: £${(stats.cost_metrics?.lastMonth || 0).toFixed(2)}`}
                  icon={PoundSterling}
                  colorClass="bg-slate-500/20 border border-slate-400/30"
                  trend={stats.cost_metrics ? getTrend(stats.cost_metrics.thisMonth, stats.cost_metrics.lastMonth) : null}
                  delay={0.3}
                />
              </div>
            </div>

            <div className="mb-8">
              <ChartCard title="Weekly Attendance Trends" subtitle="Attendance volume over the last 7 days" delay={0.35}>
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={stats.weekly_data}>
                    <defs>
                      <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#D0B079" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#D0B079" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0b1a3d', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                      itemStyle={{ color: '#D0B079' }}
                    />
                    <Area type="monotone" dataKey="count" stroke="#D0B079" strokeWidth={3} fillOpacity={1} fill="url(#colorCount)" />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>


            <div className="grid grid-cols-1 gap-6 mb-8">
              <ChartCard title="Recent Activity" subtitle="Real-time attendance log" delay={0.4}>
                <div className="overflow-x-auto h-full">
                  <table className="w-full text-left">
                    <thead className="bg-white/5 border-b border-white/10">
                      <tr>
                        <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-white/40">Staff member</th>
                        <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-white/40">Clock In</th>
                        <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-white/40">Clock Out</th>
                        <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-white/40">Date</th>
                        <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-white/40 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {loading ? (
                        <tr><td colSpan="5" className="px-6 py-12 text-center text-white/20 font-bold uppercase tracking-widest text-xs">Loading activity...</td></tr>
                      ) : stats.recent_activity?.length > 0 ? (
                        stats.recent_activity.slice((activityPage - 1) * itemsPerPage, activityPage * itemsPerPage).map((act, i) => {
                          const actualIn = act.clock_in?.toDate ? act.clock_in.toDate() : new Date(act.clock_in);
                          const actualOut = act.clock_out ? (act.clock_out?.toDate ? act.clock_out.toDate() : new Date(act.clock_out)) : null;
                          return (
                            <tr key={i} className="hover:bg-white/[0.02] transition-colors group">
                              <td className="px-4 py-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-[#D0B079] font-bold text-xs overflow-hidden shrink-0">
                                    {act.profile_image ? <img src={act.profile_image} className="w-full h-full object-cover" /> : act.full_name?.[0]}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-white font-bold text-sm truncate">{act.full_name}</p>
                                    <p className="text-[10px] text-white/30 font-medium uppercase tracking-wider">{act.designation || 'Staff'}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-4">
                                <span className="text-emerald-400 font-mono text-sm font-bold">{formatTimeShort(actualIn)}</span>
                              </td>
                              <td className="px-4 py-4">
                                <span className="text-rose-400 font-mono text-sm font-bold">{actualOut ? (act.location_out === "System Auto-Logout" && (!act.edit_reason || act.edit_reason.trim() === "") ? "--" : formatTimeShort(actualOut)) : '--:--'}</span>
                                {actualOut && act.location_out === "System Auto-Logout" && (!act.edit_reason || act.edit_reason.trim() === "") && (
                                  <span className="text-[9px] uppercase tracking-widest text-white/40 block mt-1">(Auto Logouted)</span>
                                )}
                              </td>
                              <td className="px-4 py-4">
                                <span className="text-white/30 font-mono text-xs">{actualIn.toLocaleDateString('en-GB')}</span>
                              </td>
                              <td className="px-4 py-4 text-right">
                                <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border ${!act.clock_out ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                  }`}>
                                  {!act.clock_out ? "ACTIVE" : "COMPLETED"}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr><td colSpan="5" className="px-6 py-20 text-center text-white/20 font-bold uppercase tracking-widest text-xs">No activity found today</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {stats.recent_activity?.length > 0 && (
                  <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 mt-4 -mx-6 -mb-6 bg-white/[0.02] rounded-b-2xl">
                    <button
                      disabled={activityPage === 1}
                      onClick={() => setActivityPage(prev => Math.max(1, prev - 1))}
                      className="px-4 py-2 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-xs font-bold text-white transition-all"
                    >
                      Previous
                    </button>
                    <span className="text-xs text-white/50">
                      Page {activityPage} of {Math.max(1, Math.ceil(stats.recent_activity.length / itemsPerPage))}
                    </span>
                    <button
                      disabled={activityPage === Math.max(1, Math.ceil(stats.recent_activity.length / itemsPerPage))}
                      onClick={() => setActivityPage(prev => Math.min(Math.ceil(stats.recent_activity.length / itemsPerPage), prev + 1))}
                      className="px-4 py-2 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-xs font-bold text-white transition-all"
                    >
                      Next
                    </button>
                  </div>
                )}
              </ChartCard>


            </div>

            {/* --- Snapshot Module --- */}
            <div className="mt-16 pt-8 border-t border-white/10 mb-8 space-y-6 clear-both">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between w-full gap-4 mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-[#D0B079]/20 rounded-xl">
                    <LayoutDashboard className="text-[#D0B079]" size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-white tracking-wide">Period Snapshot</h2>
                    <p className="text-sm text-white/50 mt-1">Compare performance between periods</p>
                  </div>
                </div>

                <div className="relative flex items-center gap-3">
                  <button
                    onClick={handleEmailSnapshot}
                    disabled={sendingEmail}
                    className="flex items-center gap-2 px-4 py-2 bg-[#D0B079]/10 hover:bg-[#D0B079]/20 border border-[#D0B079]/20 rounded-xl text-[#D0B079] text-sm font-bold transition-all disabled:opacity-50"
                  >
                    {sendingEmail ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    {sendingEmail ? 'Sending...' : 'Email Report'}
                  </button>

                  <button
                    onClick={() => setShowSnapshotMenu(!showSnapshotMenu)}
                    className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white text-sm font-bold transition-all"
                  >
                    <Filter size={16} />
                    {{
                      today_vs: 'Today vs Yesterday', week_vs: 'This Week vs Last Week', month_vs: 'This Month vs Last Month',
                      today: "Today's Totals", yesterday: "Yesterday's Totals", this_week: "This Week's Totals", this_month: "This Month's Totals",
                      custom: "Custom Range"
                    }[snapshotPeriod] || 'Period'}
                    <ChevronDown size={16} className={`transition-transform duration-300 ${showSnapshotMenu ? 'rotate-180' : ''}`} />
                  </button>

                  <AnimatePresence>
                    {showSnapshotMenu && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute top-full left-0 mt-2 w-64 bg-[#0b1a3d] border border-white/10 rounded-2xl shadow-2xl z-[100] overflow-hidden"
                      >
                        <div className="p-2 border-b border-white/5">
                          <p className="px-3 py-1.5 text-[10px] font-black text-white/40 uppercase tracking-widest">Comparisons</p>
                          {[
                            { id: 'today_vs', label: 'Today vs Yesterday' },
                            { id: 'week_vs', label: 'This Week vs Last Week' },
                            { id: 'month_vs', label: 'This Month vs Last Month' }
                          ].map(opt => (
                            <button key={opt.id} onClick={() => { setSnapshotPeriod(opt.id); setShowSnapshotMenu(false); setSnapshotPage(1); }}
                              className={`w-full text-left px-3 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${snapshotPeriod === opt.id ? 'bg-[#D0B079]/10 text-[#D0B079]' : 'text-white/70 hover:bg-white/5 hover:text-white'}`}>
                              <Calendar size={14} /> {opt.label}
                            </button>
                          ))}
                        </div>
                        <div className="p-2">
                          <p className="px-3 py-1.5 text-[10px] font-black text-white/40 uppercase tracking-widest">Single Totals</p>
                          {[
                            { id: 'today', label: "Today's Totals" },
                            { id: 'yesterday', label: "Yesterday's Totals" },
                            { id: 'this_week', label: "This Week's Totals" },
                            { id: 'this_month', label: "This Month's Totals" },
                            { id: 'custom', label: "Custom Range" }
                          ].map(opt => (
                            <button key={opt.id} onClick={() => { setSnapshotPeriod(opt.id); setShowSnapshotMenu(false); setSnapshotPage(1); }}
                              className={`w-full text-left px-3 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${snapshotPeriod === opt.id ? 'bg-[#D0B079]/10 text-[#D0B079]' : 'text-white/70 hover:bg-white/5 hover:text-white'}`}>
                              <Calendar size={14} /> {opt.label}
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {snapshotPeriod === 'custom' && (
                    <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-2">
                      <input
                        type="date"
                        value={snapshotCustomDates.from}
                        onChange={(e) => setSnapshotCustomDates(prev => ({ ...prev, from: e.target.value }))}
                        className="bg-transparent text-white text-sm py-2 px-2 outline-none cursor-pointer [color-scheme:dark]"
                      />
                      <span className="text-white/30 text-sm">to</span>
                      <input
                        type="date"
                        value={snapshotCustomDates.to}
                        onChange={(e) => setSnapshotCustomDates(prev => ({ ...prev, to: e.target.value }))}
                        className="bg-transparent text-white text-sm py-2 px-2 outline-none cursor-pointer [color-scheme:dark]"
                      />
                    </div>
                  )}

                  {isSuper && (
                    <div className="relative flex items-center gap-2">
                      <button
                        onClick={() => setSnapshotCompareMode(!snapshotCompareMode)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all ${snapshotCompareMode ? 'bg-[#D0B079]/20 border-[#D0B079]/40 text-[#D0B079]' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}
                      >
                        <Store size={16} />
                        Compare
                      </button>
                      <button
                        onClick={() => setShowSnapshotRestMenu(!showSnapshotRestMenu)}
                        className={`flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white text-sm font-bold transition-all ${snapshotCompareMode ? 'border-[#D0B079]/20' : ''}`}
                      >
                        <span className="max-w-[120px] truncate">{snapshotCompareMode ? `${snapshotCompareRestIds.length} Selected` : (snapshotRestaurant === 'all' ? 'All Restaurants' : (restaurants.find(r => String(r.id) === snapshotRestaurant)?.restaurant_name || 'Selected'))}</span>
                        <ChevronDown size={16} className={`transition-transform duration-300 ${showSnapshotRestMenu ? 'rotate-180' : ''}`} />
                      </button>
                      <AnimatePresence>
                        {showSnapshotRestMenu && (
                          <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="absolute top-[calc(100%+0.5rem)] right-0 w-64 bg-[#0b1a3d] border border-white/10 rounded-xl shadow-2xl z-[100] max-h-72 overflow-y-auto custom-scrollbar origin-top"
                          >
                            {snapshotCompareMode ? (
                              <div className="p-2 space-y-1">
                                {restaurants.map(r => {
                                  const isChecked = snapshotCompareRestIds.includes(String(r.id));
                                  return (
                                    <label key={r.id} className={`flex items-center px-3 py-2.5 gap-3 text-sm rounded-xl cursor-pointer transition-all ${isChecked ? 'bg-[#D0B079]/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}>
                                      <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border transition-all ${isChecked ? 'bg-[#D0B079] border-[#D0B079] shadow-[0_0_10px_rgba(208,176,121,0.3)]' : 'border-white/20 bg-black/20'}`}>
                                        {isChecked && <Check size={14} strokeWidth={4} className="text-[#0b1a3d]" />}
                                      </div>
                                      <input
                                        type="checkbox"
                                        className="hidden"
                                        checked={isChecked}
                                        onChange={(e) => {
                                          if (e.target.checked) setSnapshotCompareRestIds(prev => [...prev, String(r.id)]);
                                          else setSnapshotCompareRestIds(prev => prev.filter(id => id !== String(r.id)));
                                        }}
                                      />
                                      <span className="truncate flex-1 font-bold">{r.restaurant_name}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            ) : (
                              <>
                                <button
                                  onClick={() => { setSnapshotRestaurant('all'); setShowSnapshotRestMenu(false); setSnapshotPage(1); }}
                                  className={`w-full text-left px-4 py-3 text-sm font-bold transition-all ${snapshotRestaurant === 'all' ? 'bg-[#D0B079]/10 text-[#D0B079]' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}
                                >
                                  All Restaurants
                                </button>
                                {restaurants.map(r => (
                                  <button
                                    key={r.id}
                                    onClick={() => { setSnapshotRestaurant(String(r.id)); setShowSnapshotRestMenu(false); setSnapshotPage(1); }}
                                    className={`w-full text-left px-4 py-3 text-sm font-bold transition-all ${snapshotRestaurant === String(r.id) ? 'bg-[#D0B079]/10 text-[#D0B079]' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}
                                  >
                                    {r.restaurant_name}
                                  </button>
                                ))}
                              </>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              </div>

              {snapshotCompareMode ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {snapshotCompareRestIds.map((rId, idx) => {
                    const restData = stats.snapshot?.compare?.find(c => String(c.restaurant_id) === String(rId));
                    const restName = restaurants.find(r => String(r.id) === String(rId))?.restaurant_name || "Unknown Restaurant";
                    const pCount = restData?.stats?.present_count || 0;
                    const topEmp = restData?.stats?.top_employee || null;
                    const tHours = restData?.stats?.total_hours || "0.0";
                    const tCost = restData?.stats?.total_cost || "0.00";

                    return (
                      <div key={idx} className="bg-[#0b1a3d] border border-[#D0B079]/20 rounded-3xl p-6 relative overflow-hidden shadow-2xl group hover:border-[#D0B079]/40 transition-all">
                        <div className="absolute inset-0 bg-gradient-to-br from-[#D0B079]/5 to-transparent opacity-50" />
                        <div className="relative z-10">
                          <h3 className="text-xl font-black text-[#D0B079] mb-6 uppercase tracking-widest truncate">
                            {restName}
                          </h3>

                          <div className="space-y-4">
                            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex justify-between items-center">
                              <div>
                                <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1 font-bold">Total Members</p>
                                <p className="text-2xl font-black text-white">{pCount}</p>
                              </div>
                              <div className="p-2.5 bg-[#D0B079]/20 text-[#D0B079] rounded-xl"><Users size={20} /></div>
                            </div>

                            <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-3 font-bold">Highest Earner</p>
                              {topEmp ? (
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-lg bg-[#D0B079]/20 border border-[#D0B079]/30 flex items-center justify-center text-[#D0B079] font-bold overflow-hidden shrink-0">
                                    {topEmp.image ? <img src={topEmp.image} className="w-full h-full object-cover" /> : <User size={16} />}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-bold text-white text-sm truncate">{topEmp.name}</p>
                                    <p className="text-[9px] text-white/40 uppercase tracking-wider truncate">{topEmp.designation}</p>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <p className="text-base font-black text-[#D0B079]">£{topEmp.cost}</p>
                                    <p className="text-[9px] text-white/40 font-bold">{topEmp.hours}h</p>
                                  </div>
                                </div>
                              ) : (
                                <p className="text-xs text-white/30 italic">No earners in this period</p>
                              )}
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                                <p className="text-[9px] text-white/40 uppercase tracking-wider mb-1 font-bold">Total Hours</p>
                                <p className="text-lg font-bold text-white">{tHours}h</p>
                              </div>
                              <div className="bg-[#D0B079]/10 border border-[#D0B079]/20 rounded-2xl p-4 shadow-[0_0_15px_rgba(208,176,121,0.1)]">
                                <p className="text-[9px] text-[#D0B079]/70 uppercase tracking-wider mb-1 font-bold">Total Pay</p>
                                <p className="text-lg font-black text-[#D0B079]">£{tCost}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {snapshotCompareRestIds.length === 0 && (
                    <div className="col-span-full py-12 text-center text-white/40 border border-white/5 rounded-3xl bg-white/[0.02]">
                      <p className="italic text-lg mb-2">No restaurants selected.</p>
                      <p className="text-sm">Click the restaurant dropdown above to check which restaurants to compare.</p>
                    </div>
                  )}
                </div>
              ) : ['today_vs', 'week_vs', 'month_vs'].includes(snapshotPeriod) ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* CURRENT PERIOD BLOCK */}
                  <div className="bg-[#0b1a3d] border border-blue-500/20 rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-2xl group hover:border-blue-500/40 transition-all">
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent opacity-50" />
                    <div className="relative z-10">
                      <h3 className="text-xl sm:text-2xl font-black text-blue-400 mb-6 flex items-center gap-3 uppercase tracking-widest">
                        <Calendar size={24} /> {snapshotPeriod === 'today_vs' ? 'Today' : snapshotPeriod === 'week_vs' ? 'This Week' : 'This Month'}
                      </h3>

                      <div className="space-y-4">
                        {/* Total Members */}
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex justify-between items-center">
                          <div>
                            <p className="text-xs text-white/40 uppercase tracking-wider mb-1 font-bold">Total Members</p>
                            <p className="text-3xl font-black text-white">{stats.snapshot?.curr?.present_count || 0}</p>
                          </div>
                          <div className="p-3.5 bg-blue-500/20 text-blue-400 rounded-xl"><Users size={24} /></div>
                        </div>

                        {/* Highest Earner */}
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                          <p className="text-xs text-white/40 uppercase tracking-wider mb-4 font-bold">Highest Earner</p>
                          {stats.snapshot?.curr?.top_employee ? (
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-blue-400 font-bold overflow-hidden shrink-0 text-lg">
                                {stats.snapshot.curr.top_employee.image ? <img src={stats.snapshot.curr.top_employee.image} className="w-full h-full object-cover" /> : stats.snapshot.curr.top_employee.name[0]}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-bold text-white text-base truncate">{stats.snapshot.curr.top_employee.name}</p>
                                <p className="text-[10px] text-white/40 uppercase tracking-wider truncate">{stats.snapshot.curr.top_employee.designation} • {stats.snapshot.curr.top_employee.restaurant_name}</p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-lg font-black text-blue-400">£{stats.snapshot.curr.top_employee.cost}</p>
                                <p className="text-[10px] text-white/40 font-bold">{stats.snapshot.curr.top_employee.hours}h</p>
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm text-white/30 italic">No earners</p>
                          )}
                        </div>

                        {/* Hours & Pay */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                            <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1 font-bold">Total Hours</p>
                            <p className="text-2xl font-bold text-white">{stats.snapshot?.curr?.total_hours || 0}h</p>
                          </div>
                          <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-5 shadow-[0_0_15px_rgba(59,130,246,0.1)]">
                            <p className="text-[10px] text-blue-400/70 uppercase tracking-wider mb-1 font-bold">Total Pay</p>
                            <p className="text-2xl font-black text-blue-400">£{stats.snapshot?.curr?.total_cost || "0.00"}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* PREVIOUS PERIOD BLOCK */}
                  <div className="bg-[#0b1a3d] border border-[#D0B079]/20 rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-2xl group hover:border-[#D0B079]/40 transition-all">
                    <div className="absolute inset-0 bg-gradient-to-br from-[#D0B079]/10 to-transparent opacity-50" />
                    <div className="relative z-10">
                      <h3 className="text-xl sm:text-2xl font-black text-[#D0B079] mb-6 flex items-center gap-3 uppercase tracking-widest">
                        <Calendar size={24} /> {snapshotPeriod === 'today_vs' ? 'Yesterday' : snapshotPeriod === 'week_vs' ? 'Last Week' : 'Last Month'}
                      </h3>

                      <div className="space-y-4">
                        {/* Total Members */}
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex justify-between items-center">
                          <div>
                            <p className="text-xs text-white/40 uppercase tracking-wider mb-1 font-bold">Total Members</p>
                            <p className="text-3xl font-black text-white">{stats.snapshot?.prev?.present_count || 0}</p>
                          </div>
                          <div className="p-3.5 bg-[#D0B079]/20 text-[#D0B079] rounded-xl"><Users size={24} /></div>
                        </div>

                        {/* Highest Earner */}
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                          <p className="text-xs text-white/40 uppercase tracking-wider mb-4 font-bold">Highest Earner</p>
                          {stats.snapshot?.prev?.top_employee ? (
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-[#D0B079] font-bold overflow-hidden shrink-0 text-lg">
                                {stats.snapshot.prev.top_employee.image ? <img src={stats.snapshot.prev.top_employee.image} className="w-full h-full object-cover" /> : stats.snapshot.prev.top_employee.name[0]}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-bold text-white text-base truncate">{stats.snapshot.prev.top_employee.name}</p>
                                <p className="text-[10px] text-white/40 uppercase tracking-wider truncate">{stats.snapshot.prev.top_employee.designation} • {stats.snapshot.prev.top_employee.restaurant_name}</p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-lg font-black text-[#D0B079]">£{stats.snapshot.prev.top_employee.cost}</p>
                                <p className="text-[10px] text-white/40 font-bold">{stats.snapshot.prev.top_employee.hours}h</p>
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm text-white/30 italic">No earners</p>
                          )}
                        </div>

                        {/* Hours & Pay */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                            <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1 font-bold">Total Hours</p>
                            <p className="text-2xl font-bold text-white">{stats.snapshot?.prev?.total_hours || 0}h</p>
                          </div>
                          <div className="bg-[#D0B079]/10 border border-[#D0B079]/20 rounded-2xl p-5 shadow-[0_0_15px_rgba(208,176,121,0.1)]">
                            <p className="text-[10px] text-[#D0B079]/70 uppercase tracking-wider mb-1 font-bold">Total Pay</p>
                            <p className="text-2xl font-black text-[#D0B079]">£{stats.snapshot?.prev?.total_cost || "0.00"}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-[#0b1a3d] border border-white/10 rounded-3xl p-6 relative overflow-hidden shadow-2xl">
                  <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-50" />
                  <div className="relative z-10">
                    <h3 className="text-xl font-black text-white mb-6 flex items-center gap-3 uppercase tracking-widest">
                      <Calendar size={24} className="text-[#D0B079]" />
                      {snapshotPeriod === 'custom' ? `Custom: ${snapshotCustomDates.from} to ${snapshotCustomDates.to}` : {
                        today: "Today's Totals",
                        yesterday: "Yesterday's Totals",
                        this_week: "This Week's Totals",
                        this_month: "This Month's Totals"
                      }[snapshotPeriod]}
                    </h3>

                    <div className="flex flex-col sm:flex-row gap-6 mb-8">
                      <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex-1 flex items-center justify-between">
                        <div>
                          <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1 font-bold">Total Members</p>
                          <p className="text-3xl font-black text-white">{stats.snapshot?.single?.present_count || 0}</p>
                        </div>
                        <div className="p-3.5 bg-blue-500/20 text-blue-400 rounded-xl"><Users size={24} /></div>
                      </div>
                      <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex-1">
                        <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1 font-bold">Total Hours</p>
                        <p className="text-3xl font-black text-white">{stats.snapshot?.single?.total_hours || 0}h</p>
                      </div>
                      <div className="bg-[#D0B079]/10 border border-[#D0B079]/20 rounded-2xl p-5 flex-1 shadow-[0_0_15px_rgba(208,176,121,0.1)]">
                        <p className="text-[10px] text-[#D0B079]/70 uppercase tracking-wider mb-1 font-bold">Total Pay</p>
                        <p className="text-3xl font-black text-[#D0B079]">£{stats.snapshot?.single?.total_cost || "0.00"}</p>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-white/10 text-[10px] uppercase tracking-widest text-white/40">
                            <th className="p-4 font-bold">Staff Member</th>
                            <th className="p-4 font-bold">Designation</th>
                            <th className="p-4 font-bold">Restaurant</th>
                            <th className="p-4 font-bold text-right">Hours</th>
                            <th className="p-4 font-bold text-right text-[#D0B079]">Total Pay</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {stats.snapshot?.single?.staff_list?.slice((snapshotPage - 1) * 10, snapshotPage * 10).map((s, i) => {
                            const isTopEarner = snapshotPage === 1 && i === 0 && s.cost > 0;
                            return (
                              <tr key={i} className={`transition-colors ${isTopEarner ? 'bg-[#D0B079]/5 hover:bg-[#D0B079]/10' : 'hover:bg-white/5'}`}>
                                <td className="p-4 flex items-center gap-3">
                                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden shrink-0 ${isTopEarner ? 'bg-[#D0B079]/20 border border-[#D0B079]/30 text-[#D0B079]' : 'bg-white/10'}`}>
                                    {s.image ? <img src={s.image} className="w-full h-full object-cover" /> : <User size={14} className={isTopEarner ? "text-[#D0B079]" : "text-white/50"} />}
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="text-sm font-bold text-white flex items-center gap-2">
                                      {s.name}
                                      {isTopEarner && <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-[#D0B079] text-[#0b1a3d]">Top Earner</span>}
                                    </span>
                                  </div>
                                </td>
                                <td className="p-4 text-sm text-white/70">{s.designation}</td>
                                <td className="p-4 text-sm text-white/70">{s.restaurant_name}</td>
                                <td className="p-4 text-sm text-white/90 text-right font-medium">{s.hours}h</td>
                                <td className="p-4 text-sm text-[#D0B079] text-right font-bold">£{s.cost}</td>
                              </tr>
                            );
                          })}
                          {!stats.snapshot?.single?.staff_list?.length && (
                            <tr>
                              <td colSpan="5" className="p-8 text-center text-white/40 text-sm italic">No records found for this period.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination Controls for Single Snapshot */}
                    {stats.snapshot?.single?.staff_list?.length > 10 && (
                      <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 mt-4 -mx-6 -mb-6 bg-white/[0.02] rounded-b-3xl">
                        <button
                          disabled={snapshotPage === 1}
                          onClick={() => setSnapshotPage(prev => Math.max(1, prev - 1))}
                          className="px-4 py-2 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-xs font-bold text-white transition-all"
                        >
                          Previous
                        </button>
                        <span className="text-xs text-white/50">
                          Page {snapshotPage} of {Math.ceil(stats.snapshot.single.staff_list.length / 10)}
                        </span>
                        <button
                          disabled={snapshotPage === Math.ceil(stats.snapshot.single.staff_list.length / 10)}
                          onClick={() => setSnapshotPage(prev => Math.min(Math.ceil(stats.snapshot.single.staff_list.length / 10), prev + 1))}
                          className="px-4 py-2 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-xs font-bold text-white transition-all"
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

          </div>
        </main>
        <Footer />
      </div>

      <AnimatePresence>
        {showFilterModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowFilterModal(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-2xl bg-[#0b1a3d] border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

              <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/5">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <Filter size={20} className="text-[#D0B079]" />
                  Advanced Filters
                </h3>
                <button onClick={() => setShowFilterModal(false)} className="p-2 hover:bg-white/10 text-white/40 hover:text-white rounded-xl transition-all">
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 overflow-y-auto custom-scrollbar space-y-10">
                {/* Select Comparison (Not used anymore as we moved to inline dropdown, keeping this modal around just in case you still need time filters) */}
                <section className="space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-[0.2em] text-white/30 ml-1">Select Comparison</h4>
                  <div className="grid grid-cols-1 gap-3">
                    {[
                      { id: 'today', label: 'Today vs Yesterday' },
                      { id: 'week', label: 'This week vs last week' },
                      { id: 'month', label: 'This Month vs Last Month' },
                      { id: 'quarter', label: 'This Quarter vs Last Quarter' },
                      { id: 'halfyear', label: 'This Half Year Vs Last Half Year' },
                      { id: 'custom', label: 'Custom Range' }
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => handlePeriodChange(opt.id)}
                        className={`flex items-center gap-4 p-4 rounded-2xl border transition-all text-left group ${period === opt.id
                            ? 'bg-[#D0B079]/10 border-[#D0B079] text-[#D0B079]'
                            : 'bg-white/5 border-white/10 text-white/60 hover:border-white/20'
                          }`}
                      >
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${period === opt.id ? 'border-[#D0B079]' : 'border-white/20 group-hover:border-white/40'
                          }`}>
                          {period === opt.id && <div className="w-2.5 h-2.5 rounded-full bg-[#D0B079]" />}
                        </div>
                        <span className="font-bold text-sm">{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </section>

                {/* Select Period */}
                <section className="space-y-6">
                  <h4 className="text-xs font-black uppercase tracking-[0.2em] text-white/30 ml-1">Select Period</h4>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Start Date</label>
                      <div className="relative">
                        <Calendar size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" />
                        <input
                          type="date"
                          value={dateRange.from}
                          onChange={(e) => {
                            setPeriod('custom');
                            setDateRange(prev => ({ ...prev, from: e.target.value }));
                          }}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 py-3.5 text-white font-bold focus:outline-none focus:border-[#D0B079]/50 transition-all text-sm"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">End Date</label>
                      <div className="relative">
                        <Calendar size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" />
                        <input
                          type="date"
                          value={dateRange.to}
                          onChange={(e) => {
                            setPeriod('custom');
                            setDateRange(prev => ({ ...prev, to: e.target.value }));
                          }}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 py-3.5 text-white font-bold focus:outline-none focus:border-[#D0B079]/50 transition-all text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Time Range */}
                  <div className="pt-6 border-t border-white/5">
                    <div className="flex items-center gap-2 mb-6">
                      <Clock size={16} className="text-[#D0B079]" />
                      <h4 className="text-xs font-black uppercase tracking-[0.2em] text-white/30">Time Range (Optional)</h4>
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">From Time</label>
                        <div className="relative">
                          <Clock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" />
                          <input
                            type="time"
                            value={timeRange.from}
                            onChange={(e) => setTimeRange(prev => ({ ...prev, from: e.target.value }))}
                            className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 py-3.5 text-white font-bold focus:outline-none focus:border-[#D0B079]/50 transition-all text-sm"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">To Time</label>
                        <div className="relative">
                          <Clock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" />
                          <input
                            type="time"
                            value={timeRange.to}
                            onChange={(e) => setTimeRange(prev => ({ ...prev, to: e.target.value }))}
                            className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 py-3.5 text-white font-bold focus:outline-none focus:border-[#D0B079]/50 transition-all text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              </div>


              <div className="p-6 border-t border-white/10 bg-white/5 flex gap-4">
                <button
                  onClick={() => setShowFilterModal(false)}
                  className="flex-1 py-4 rounded-2xl border border-white/10 text-white/60 font-bold hover:bg-white/5 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setShowFilterModal(false)}
                  className="flex-1 py-4 bg-[#D0B079] text-slate-900 font-black rounded-2xl hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-[#D0B079]/10"
                >
                  Apply Filters
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

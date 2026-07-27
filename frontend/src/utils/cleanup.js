import { 
  collection, 
  query, 
  where, 
  getDocs, 
  writeBatch, 
  doc, 
  Timestamp, 
  serverTimestamp 
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { sendPushNotification } from "./fcm";

/**
 * Ported logic from Firebase Functions: cleanupOldAttendance
 * This runs on the frontend when an Admin is active.
 */
export const performAttendanceCleanup = async () => {
  console.log("[Cleanup] Starting attendance cleanup...");
  const now = new Date();
  
  const attendanceRef = collection(db, "attendance");
  const q = query(
    attendanceRef, 
    where("clock_out", "==", null)
  );
 
  try {
    const snapshot = await getDocs(q);
 
    if (snapshot.empty) {
      console.log("[Cleanup] No active attendance records found.");
      return;
    }
 
    const restSnap = await getDocs(collection(db, "restaurants"));
    const restaurants = restSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const staffSnap = await getDocs(collection(db, "staff"));
    const staffList = staffSnap.docs.map(d => ({ id: d.id, ...d.data() }));
 
    const batch = writeBatch(db);
    const notificationsRef = collection(db, "notifications");
    let count = 0;
 
    snapshot.docs.forEach((docSnap) => {
      const data = docSnap.data();
      if (!data.clock_in) return;

      const staffId = data.staff_id;
      const staffName = data.staff_name || "Unknown Staff";
      
      const staffInfo = staffList.find(s => s.id === staffId) || {};
      const rId = data.restaurant_id || staffInfo.restaurant_id;
      const rDoc = restaurants.find(r => r.id === String(rId));
      const autoLogoutEnabled = rDoc?.is_auto_logout_enabled !== undefined ? rDoc.is_auto_logout_enabled : true;
      const thresholdHours = rDoc?.auto_logout_hours !== undefined ? parseFloat(rDoc.auto_logout_hours) : 15;

      const clockInDate = data.clock_in.toDate();
      const forcedClockOutDate = new Date(clockInDate.getTime() + (thresholdHours * 60 * 60 * 1000));
      
      if (autoLogoutEnabled && now > forcedClockOutDate) {
        count++;
        batch.update(docSnap.ref, {
          clock_out: Timestamp.fromDate(forcedClockOutDate),
          total_minutes: Math.round(thresholdHours * 60),
          auto_clocked_out: true,
          location_out: "System Auto-Logout",
          notes: `System: Auto clock-out (Forgot to logout). Recorded ${thresholdHours}h limit reached.`
        });

      // 2. Notify Staff Member
      const staffNotifRef = doc(notificationsRef);
      const staffNotifData = {
        title: "Auto Clock-Out Triggered",
        body: "Your shift was automatically closed because you forgot to clock out yesterday.",
        staff_id: staffId,
        staff_name: staffName,
        type: "alert",
        priority: "high",
        status: "pending",
        sent_at: serverTimestamp(),
        fcm_token: data.fcm_token || data.fcmToken || null
      };
      batch.set(staffNotifRef, staffNotifData);

      // Trigger push for staff
      if (staffNotifData.fcm_token) {
        sendPushNotification({
          fcm_token: staffNotifData.fcm_token,
          title: staffNotifData.title,
          body: staffNotifData.body,
          priority: "high",
          type: "alert",
          notificationId: staffNotifRef.id
        });
      }

      // 3. Notify Admin Dashboard
      const adminNotifRef = doc(notificationsRef);
      batch.set(adminNotifRef, {
        title: "Staff Attendance Alert",
        body: `FAIL: ${staffName} did not clock out on ${clockInDate.toLocaleDateString()}. System performed auto clock-out.`,
        staff_id: "admin_dashboard_alert",
        staff_name: "System Monitor",
        type: "alert",
        priority: "urgent",
        status: "pending",
        sent_at: serverTimestamp()
      });
      }
    });

    if (count === 0) {
      console.log("[Cleanup] No old attendance records requiring auto clock-out.");
      return;
    }

    await batch.commit();
    console.log(`[Cleanup] Successfully auto-clocked out ${count} records.`);
  } catch (error) {
    console.error("[Cleanup] Error during attendance cleanup:", error);
  }
};

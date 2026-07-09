import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../../lib/firebase";
import { collection, query, where, getDocs, addDoc, updateDoc, doc, serverTimestamp, orderBy, limit } from "firebase/firestore";
import * as faceapi from "face-api.js";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, CheckCircle, Clock, X, AlertCircle } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { usePopup } from "../../context/PopupContext";

export default function LiveKiosk() {
  const { user, userData } = useAuth();
  const navigate = useNavigate();
  const { showPopup } = usePopup();

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  
  // Geofence
  const [geofenceStatus, setGeofenceStatus] = useState("checking");
  const geofenceStatusRef = useRef("checking"); // ref for stale-closure-safe access
  const [restaurantData, setRestaurantData] = useState(null);
  const kioskLocationRef = useRef(null);

  // Refs for scan loop closure
  const faceMatcherRef = useRef(null);
  const staffDataRef = useRef([]);
  
  const [scanStatus, setScanStatus] = useState("initializing"); // initializing, ready, scanning, success, error
  const [message, setMessage] = useState("Initializing system...");
  const [recentAction, setRecentAction] = useState(null); // To show success overlay
  
  const scanningRef = useRef(false);
  const cooldownRef = useRef(false);
  const unknownCountRef = useRef(0);

  useEffect(() => {
    const init = async () => {
      try {
        await loadModels();
        await fetchRestaurantAndGeofence();
        await fetchStaffAndCreateMatcher();
        await startCamera();
      } catch (err) {
        console.error("Initialization error:", err);
        setScanStatus("error");
        setMessage("Failed to initialize system. Please refresh.");
      }
    };
    init();

    return () => {
      stopCamera();
    };
  }, [user]);

  const loadModels = async () => {
    const MODEL_URL = '/models';
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
    ]);
    setModelsLoaded(true);
  };

  const isSuperAdmin = 
    userData?.role_id === 6 || 
    userData?.role_id === "6" || 
    String(userData?.role_title || "").toLowerCase().trim() === "super admin";

  // Helper: sets both state (UI) and ref (used inside stale closures like scanLoop)
  const setGeoStatus = (status) => {
    geofenceStatusRef.current = status;
    setGeofenceStatus(status);
  };

  // Haversine formula to calculate distance between two lat/lng points in meters
  const getDistanceInMeters = (lat1, lng1, lat2, lng2) => {
    const R = 6371000; // Earth radius in meters
    const toRad = (v) => (v * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  const fetchRestaurantAndGeofence = async () => {
    try {
      const restId = isSuperAdmin ? null : user?.uid;
      if (!restId) return; // Super admin bypass geofence for testing

      // Fetch restaurant geofence config
      const { getDoc } = await import("firebase/firestore");
      const restDoc = await getDoc(doc(db, "restaurants", restId));
      if (!restDoc.exists()) return;

      const restData = restDoc.data();
      setRestaurantData(restData);

      const restLat = parseFloat(restData.latitude);
      const restLng = parseFloat(restData.longitude);
      const radiusM = parseFloat(restData.geofence_radius) || 50;

      if (!restLat || !restLng) {
        setGeoStatus("inside");
        return;
      }

      if (!navigator.geolocation) {
        setGeoStatus("inside");
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          kioskLocationRef.current = { lat: latitude, lng: longitude };
          const distance = getDistanceInMeters(latitude, longitude, restLat, restLng);
          console.log(`Kiosk distance: ${distance.toFixed(1)}m (allowed: ${radiusM}m)`);
          setGeoStatus(distance <= radiusM ? "inside" : "outside");
        },
        (err) => {
          console.warn("Geolocation unavailable:", err.message, "— allowing attendance without geofence.");
          setGeoStatus("inside");
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } catch (err) {
      console.error("Geofence fetch error:", err);
      setGeoStatus("inside"); // Don't block if fetch fails
    }
  };

  const fetchStaffAndCreateMatcher = async () => {
    try {
      let staffQuery;
      
      if (isSuperAdmin) {
        // Super admins fetch all staff across all restaurants to test
        staffQuery = query(collection(db, "staff"));
      } else {
        const restId = user?.uid || "";
        if (!restId) return;
        staffQuery = query(collection(db, "staff"), where("created_by", "==", restId));
      }

      const staffSnap = await getDocs(staffQuery);
      
      const staffList = [];
      const labeledDescriptors = [];

      staffSnap.docs.forEach(doc => {
        const data = doc.data();
        if (data.faceDescriptor && Array.isArray(data.faceDescriptor) && data.faceDescriptor.length > 0) {
          staffList.push({ id: doc.id, ...data });
          
          const descriptor = new Float32Array(data.faceDescriptor);
          labeledDescriptors.push(new faceapi.LabeledFaceDescriptors(doc.id, [descriptor]));
        }
      });

      staffDataRef.current = staffList;

      if (labeledDescriptors.length > 0) {
        // Create face matcher with 0.60 distance threshold (standard default for face-api)
        // This is more forgiving for different lighting conditions and angles
        const matcher = new faceapi.FaceMatcher(labeledDescriptors, 0.60);
        faceMatcherRef.current = matcher;
      } else {
        setMessage("No staff members have registered faces yet.");
      }
    } catch (err) {
      console.error("Error fetching staff:", err);
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      streamRef.current = stream;
      setIsCameraOn(true);
      
      if (faceMatcherRef.current) {
        setScanStatus("ready");
        setMessage("Ready. Please look at the camera.");
      } else {
        setScanStatus("error");
        setMessage("System offline: No staff registered yet.");
      }
      
      // Start scanning loop
      scanningRef.current = true;
      scanLoop();
    } catch (err) {
      console.error("Camera access denied:", err);
      setScanStatus("error");
      setMessage("Camera access denied or device not found.");
    }
  };

  const stopCamera = () => {
    scanningRef.current = false;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraOn(false);
  };

  const scanLoop = async () => {
    if (!scanningRef.current || !videoRef.current || videoRef.current.readyState < 2 || cooldownRef.current || !faceMatcherRef.current) {
      if (scanningRef.current) {
        setTimeout(scanLoop, 500); // Check again soon
      }
      return;
    }

    try {
      const detection = await faceapi.detectSingleFace(videoRef.current)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (detection) {
        const bestMatch = faceMatcherRef.current.findBestMatch(detection.descriptor);
        
        if (bestMatch.label !== "unknown") {
          unknownCountRef.current = 0; // Reset on match
          const matchedStaffId = bestMatch.label;
          const staffMember = staffDataRef.current.find(s => s.id === matchedStaffId);
          
          if (staffMember) {
            await handleAttendanceAction(staffMember);
          }
        } else {
          // Face detected but not recognized
          unknownCountRef.current += 1;
          
          if (unknownCountRef.current >= 4) {
            // Trigger Unknown Face error after a few consecutive unrecognized frames
            unknownCountRef.current = 0;
            cooldownRef.current = true;
            setScanStatus("error");
            setMessage("Face not recognized. Please try again or register.");
            
            setTimeout(() => {
              setScanStatus("ready");
              setMessage("Ready. Please look at the camera.");
              cooldownRef.current = false;
            }, 3000);
          }
        }
      } else {
        // No face detected, slowly reduce unknown count so brief look-aways don't trigger error
        if (unknownCountRef.current > 0) unknownCountRef.current -= 1;
      }
    } catch (err) {
      console.error("Scan error:", err);
    }

    if (scanningRef.current) {
      // Run next frame
      setTimeout(scanLoop, 300);
    }
  };

  const handleAttendanceAction = async (staffMember) => {
    // Use ref for geofenceStatus to avoid stale closure issue
    const currentGeoStatus = geofenceStatusRef.current;

    if (!isSuperAdmin && currentGeoStatus !== "inside") {
      setScanStatus("error");
      if (currentGeoStatus === "outside") {
        setMessage("Outside restaurant area. Clock-in not allowed.");
      } else {
        setMessage("Verifying location, please wait...");
      }
      cooldownRef.current = true;
      setTimeout(() => {
        setScanStatus("ready");
        setMessage("Ready. Please look at the camera.");
        cooldownRef.current = false;
      }, 3000);
      return;
    }

    // Put system in cooldown so it doesn't repeatedly scan the same person
    cooldownRef.current = true;
    setScanStatus("scanning");
    setMessage(`Processing attendance for ${staffMember.full_name}...`);

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Find if they have an active session today (Removed orderBy and limit to prevent Firebase Index requirement)
      const attQuery = query(
        collection(db, "attendance"),
        where("staff_id", "==", staffMember.id),
        where("date", "==", today)
      );
      
      const attSnap = await getDocs(attQuery);
      let isClockingOut = false;
      let existingRecordId = null;
      let existingClockInTime = null;

      if (!attSnap.empty) {
        // Sort manually to find the most recent record
        const records = attSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        records.sort((a, b) => {
          const tA = a.clock_in?.toMillis ? a.clock_in.toMillis() : 0;
          const tB = b.clock_in?.toMillis ? b.clock_in.toMillis() : 0;
          return tB - tA; // Descending
        });

        const latestRecord = records[0];
        if (!latestRecord.clock_out) {
          isClockingOut = true;
          existingRecordId = latestRecord.id;
          existingClockInTime = latestRecord.clock_in?.toDate ? latestRecord.clock_in.toDate() : new Date();
        }
      }

      const now = new Date();
      let actionType = "";

      if (isClockingOut) {
        // Calculate total minutes worked
        const totalMinutes = existingClockInTime ? Math.floor((now - existingClockInTime) / 60000) : 0;

        // Clock Out
        await updateDoc(doc(db, "attendance", existingRecordId), {
          clock_out: serverTimestamp(),
          location_out: "Face Kiosk",
          total_minutes: totalMinutes > 0 ? totalMinutes : 0,
          updated_at: serverTimestamp()
        });
        actionType = "Clocked Out";
      } else {
        // Clock In — use staffMember.created_by as restaurant_id (not logged-in user)
        await addDoc(collection(db, "attendance"), {
          staff_id: staffMember.id,
          staff_name: staffMember.full_name,
          designation: staffMember.designation || "Staff",
          restaurant_id: staffMember.created_by || user?.uid,
          restaurant_name: staffMember.restaurant_name || "",
          date: today,
          clock_in: serverTimestamp(),
          location_in: "Face Kiosk",
          clock_out: null,
          created_at: serverTimestamp()
        });
        actionType = "Clocked In";
      }

      setRecentAction({
        name: staffMember.full_name,
        action: actionType,
        time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });

      // Show success message for 4 seconds, then resume scanning
      setTimeout(() => {
        setRecentAction(null);
        setScanStatus("ready");
        setMessage("Ready. Please look at the camera.");
        cooldownRef.current = false; // Release cooldown
      }, 4000);

    } catch (err) {
      console.error("Attendance Error:", err);
      setMessage("Failed to record attendance. Please try again.");
      setTimeout(() => {
        setScanStatus("ready");
        setMessage("Ready. Please look at the camera.");
        cooldownRef.current = false;
      }, 3000);
    }
  };

  return (
    <div className="min-h-screen bg-black font-sans relative overflow-hidden flex flex-col">
      {/* Top Bar */}
      <div className="absolute top-0 left-0 right-0 p-6 z-50 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-4 text-white">
          <Clock className="text-[#00f2ff]" size={32} />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Live Attendance Kiosk</h1>
            <p className="text-white/60 text-sm font-medium">{userData?.name || "Restaurant"}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate('/dashboard')}
            className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors backdrop-blur-md"
          >
            <X size={24} />
          </button>
        </div>
      </div>

      {/* Main Kiosk Area */}
      <div className="flex-1 relative flex items-center justify-center">
        
        {/* Video Feed */}
        <video 
          ref={videoRef} 
          autoPlay 
          muted 
          playsInline
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${isCameraOn ? 'opacity-100' : 'opacity-0'}`}
          style={{ transform: "scaleX(-1)" }} // Mirror effect
        />

        {/* Overlay / Scanning UI */}
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none">
          
          {/* Target Box */}
          <div className={`relative w-[300px] h-[300px] md:w-[400px] md:h-[400px] border-4 rounded-[3rem] transition-all duration-500 flex items-center justify-center
            ${scanStatus === 'ready' ? 'border-[#00f2ff]/40 shadow-[0_0_50px_rgba(0,242,255,0.1)]' : ''}
            ${scanStatus === 'scanning' ? 'border-[#D0B079] shadow-[0_0_50px_rgba(208,176,121,0.3)] scale-105' : ''}
            ${scanStatus === 'error' ? 'border-red-500/50' : ''}
            ${recentAction ? 'border-green-500 scale-105 shadow-[0_0_80px_rgba(34,197,94,0.3)]' : ''}
          `}>
            {/* Corner Markers */}
            <div className="absolute top-0 left-0 w-16 h-16 border-t-4 border-l-4 rounded-tl-[3rem] border-current opacity-50" />
            <div className="absolute top-0 right-0 w-16 h-16 border-t-4 border-r-4 rounded-tr-[3rem] border-current opacity-50" />
            <div className="absolute bottom-0 left-0 w-16 h-16 border-b-4 border-l-4 rounded-bl-[3rem] border-current opacity-50" />
            <div className="absolute bottom-0 right-0 w-16 h-16 border-b-4 border-r-4 rounded-br-[3rem] border-current opacity-50" />
            
            {/* Scan Line effect */}
            {scanStatus === 'ready' && (
              <div className="absolute top-0 left-0 right-0 h-1 bg-[#00f2ff]/60 shadow-[0_0_20px_#00f2ff] animate-scan opacity-60" />
            )}
          </div>

          {/* Status Message */}
          <div className="mt-12 bg-black/40 backdrop-blur-xl px-8 py-4 rounded-full border border-white/10">
            <p className={`text-lg font-bold tracking-wide
              ${scanStatus === 'error' ? 'text-red-400' : 'text-white'}
            `}>
              {message}
            </p>
          </div>

          {/* Geofence text below status */}
          {!isSuperAdmin && geofenceStatus !== 'inside' && (
            <p className={`mt-4 text-sm font-semibold tracking-wide
              ${geofenceStatus === 'outside' ? 'text-red-400' : ''}
              ${geofenceStatus === 'checking' ? 'text-white/50' : ''}
              ${geofenceStatus === 'error' ? 'text-yellow-400' : ''}
            `}>
              {geofenceStatus === 'outside' && '⚠ You are outside the restaurant area. Attendance cannot be recorded.'}
              {geofenceStatus === 'checking' && 'Verifying your location...'}
              {geofenceStatus === 'error' && '⚠ Location access denied. Please allow location to record attendance.'}
            </p>
          )}

        {/* Success Overlay */}
        <AnimatePresence>
          {recentAction && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -20 }}
              className="absolute z-40 bg-gradient-to-br from-green-500/90 to-emerald-700/90 backdrop-blur-2xl px-12 py-10 rounded-[3rem] shadow-[0_20px_60px_rgba(0,0,0,0.5)] border border-white/20 text-center pointer-events-none"
            >
              <CheckCircle className="text-white mx-auto mb-4" size={80} />
              <h2 className="text-4xl font-black text-white mb-2">{recentAction.name}</h2>
              <div className="bg-black/20 rounded-full px-6 py-2 inline-block mb-4">
                <p className="text-xl font-bold text-white uppercase tracking-widest">{recentAction.action}</p>
              </div>
              <p className="text-white/80 font-medium text-lg">{recentAction.time}</p>
            </motion.div>
          )}
        </AnimatePresence>

      </div>{/* End overlay z-10 */}

      </div>{/* End main kiosk area */}

      <style>{`
        @keyframes scan {
          0% { transform: translateY(0); }
          50% { transform: translateY(300px); }
          100% { transform: translateY(0); }
        }
        @media (min-width: 768px) {
          @keyframes scan {
            0% { transform: translateY(0); }
            50% { transform: translateY(400px); }
            100% { transform: translateY(0); }
          }
        }
        .animate-scan {
          animation: scan 2.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
      `}</style>
    </div>
  );
}

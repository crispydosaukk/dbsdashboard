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

  const fetchStaffAndCreateMatcher = async () => {
    try {
      const restId = user?.uid || "";
      if (!restId) return;

      const staffQuery = query(collection(db, "staff"), where("created_by", "==", restId));
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
        // Create face matcher with 0.45 distance threshold (lower is stricter)
        const matcher = new faceapi.FaceMatcher(labeledDescriptors, 0.45);
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
    if (!scanningRef.current || !videoRef.current || cooldownRef.current || !faceMatcherRef.current) {
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
    // Put system in cooldown so it doesn't repeatedly scan the same person
    cooldownRef.current = true;
    setScanStatus("scanning");
    setMessage(`Processing attendance for ${staffMember.full_name}...`);

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Find if they have an active session today
      const attQuery = query(
        collection(db, "attendance"),
        where("staff_id", "==", staffMember.id),
        where("date", "==", today),
        orderBy("clock_in", "desc"),
        limit(1)
      );
      
      const attSnap = await getDocs(attQuery);
      let isClockingOut = false;
      let existingRecordId = null;

      if (!attSnap.empty) {
        const record = attSnap.docs[0].data();
        if (!record.clock_out) {
          isClockingOut = true;
          existingRecordId = attSnap.docs[0].id;
        }
      }

      const now = new Date();
      let actionType = "";

      if (isClockingOut) {
        // Clock Out
        await updateDoc(doc(db, "attendance", existingRecordId), {
          clock_out: serverTimestamp(),
          location_out: "Face Kiosk",
          updated_at: serverTimestamp()
        });
        actionType = "Clocked Out";
      } else {
        // Clock In
        await addDoc(collection(db, "attendance"), {
          staff_id: staffMember.id,
          staff_name: staffMember.full_name,
          designation: staffMember.designation || "Staff",
          restaurant_id: user?.uid,
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
        <button 
          onClick={() => navigate('/dashboard')}
          className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors backdrop-blur-md"
        >
          <X size={24} />
        </button>
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
        </div>

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

      </div>

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

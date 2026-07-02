import React from 'react';
import { Link } from 'react-router-dom';
import Footer from '../../components/common/footer';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-[#071428] via-[#0d1f45] to-[#071428] text-white font-sans">
      <div className="flex-1 max-w-4xl w-full mx-auto p-6 mt-8 mb-12">
        <Link to="/login" className="text-[#D0B079] hover:underline mb-6 inline-block">&larr; Back to App</Link>
        <div className="bg-[#0b1a3d]/60 backdrop-blur-xl rounded-lg border border-white/10 p-8 shadow-2xl">
          <h1 className="text-3xl font-bold mb-6 text-white drop-shadow-lg">Privacy Policy</h1>
          <div className="space-y-4 text-white/80 leading-relaxed">
            <p className="text-sm text-white/50">Last updated: {new Date().toLocaleDateString()}</p>
            <p>
              Catering Spice Ltd ("we", "our", or "us") operates the DigitalBotSolutions application (the "App"), a staff management and attendance monitoring platform. This Privacy Policy describes how we collect, use, and handle your information when you use our App.
            </p>
            
            <h2 className="text-2xl font-semibold mt-6 text-white/90 border-b border-white/10 pb-2">1. Information We Collect</h2>
            <p>To provide our attendance and staff management services effectively, we may collect the following types of information:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Personal Information:</strong> Name, email address, phone number, and employee ID provided during account creation.</li>
              <li><strong>Attendance Data:</strong> Clock-in and clock-out times, dates, and work shift details.</li>
              <li><strong>Location Data (if enabled):</strong> We may collect location data when you clock in or out to verify your presence at the designated work location.</li>
              <li><strong>Device Information:</strong> Device type, operating system, and unique device identifiers to ensure secure access.</li>
            </ul>

            <h2 className="text-2xl font-semibold mt-6 text-white/90 border-b border-white/10 pb-2">2. How We Use Your Information</h2>
            <p>We use the collected information for the following purposes:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>To monitor staff attendance and manage work schedules accurately.</li>
              <li>To process payroll and calculate working hours.</li>
              <li>To maintain the security and integrity of our App and prevent unauthorized access.</li>
              <li>To provide customer support and respond to your inquiries.</li>
            </ul>

            <h2 className="text-2xl font-semibold mt-6 text-white/90 border-b border-white/10 pb-2">3. Data Sharing and Disclosure</h2>
            <p>
              Your information is primarily used internally by Catering Spice Ltd for management purposes. We do not sell your personal data to third parties. We may share your information only:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>With authorized company administrators and managers for staffing purposes.</li>
              <li>When required by law, such as to comply with a subpoena or similar legal process.</li>
              <li>To protect our rights, protect your safety or the safety of others, and investigate fraud.</li>
            </ul>

            <h2 className="text-2xl font-semibold mt-6 text-white/90 border-b border-white/10 pb-2">4. Data Security</h2>
            <p>
              We implement appropriate technical and organizational security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. However, please be aware that no method of transmission over the internet or mobile device is 100% secure.
            </p>

            <h2 className="text-2xl font-semibold mt-6 text-white/90 border-b border-white/10 pb-2">5. Your Rights</h2>
            <p>
              Depending on your jurisdiction, you may have the right to access, correct, update, or delete your personal information. If you wish to exercise any of these rights, please contact your company administrator or reach out to us directly.
            </p>

            <h2 className="text-2xl font-semibold mt-6 text-white/90 border-b border-white/10 pb-2">6. Contact Us</h2>
            <p>
              If you have any questions or concerns about this Privacy Policy or our data practices, please contact us at:
            </p>
            <div className="bg-[#D0B079]/10 p-6 rounded-xl mt-4 border border-[#D0B079]/20 shadow-inner">
              <p className="font-bold text-white mb-2">Catering Spice Ltd</p>
              <p>Email: <a href="mailto:cateringspiceltd@gmail.com" className="text-[#D0B079] hover:underline">cateringspiceltd@gmail.com</a></p>
              <p>Phone: <a href="tel:+447368374770" className="text-[#D0B079] hover:underline">+447368 374770</a></p>
              <p>Address: Brook Industrial Estate, Bullsbrook Rd, Hayes UB4 0JZ, UK</p>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}

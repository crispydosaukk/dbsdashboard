import React from 'react';
import Layout from '../../components/common/layout';

export default function TermsConditions() {
  return (
    <Layout>
      <div className="mx-auto max-w-4xl p-6 bg-white/5 rounded-lg border border-white/10 mt-8 text-white mb-12">
        <h1 className="text-3xl font-bold mb-6 text-white/90">Terms and Conditions</h1>
        <div className="space-y-4 text-white/80 leading-relaxed">
          <p>Last updated: {new Date().toLocaleDateString()}</p>
          <p>
            Welcome to the DigitalBotSolutions application (the "App"). These terms and conditions outline the rules and regulations for the use of our staff management and attendance monitoring platform.
          </p>
          <p>
            By accessing or using the App, you accept these terms and conditions in full. Do not continue to use the App if you do not agree to all the terms and conditions stated on this page.
          </p>

          <h2 className="text-2xl font-semibold mt-6 text-white/90">1. Usage of the App</h2>
          <p>
            This App is intended solely for the employees and authorized personnel of Catering Spice Ltd and its affiliated partners. You agree to use the App strictly for employment-related purposes, such as logging attendance, viewing schedules, and managing staff records.
          </p>

          <h2 className="text-2xl font-semibold mt-6 text-white/90">2. User Accounts and Security</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>You are responsible for maintaining the confidentiality of your login credentials.</li>
            <li>You must not share your account details with anyone else.</li>
            <li>You must notify your administrator immediately if you suspect any unauthorized access to your account.</li>
            <li>Catering Spice Ltd reserves the right to suspend or terminate accounts that are suspected of fraudulent activity or policy violations.</li>
          </ul>

          <h2 className="text-2xl font-semibold mt-6 text-white/90">3. Attendance and Data Accuracy</h2>
          <p>
            By using this App to log your attendance, you certify that the information you provide (such as clock-in and clock-out times) is accurate and truthful. Falsifying attendance records may result in disciplinary action up to and including termination of employment.
          </p>

          <h2 className="text-2xl font-semibold mt-6 text-white/90">4. Intellectual Property</h2>
          <p>
            Unless otherwise stated, Catering Spice Ltd and/or its licensors own the intellectual property rights for all material in the App. All intellectual property rights are reserved. You may not reproduce, distribute, or create derivative works from this platform without explicit permission.
          </p>

          <h2 className="text-2xl font-semibold mt-6 text-white/90">5. Limitation of Liability</h2>
          <p>
            Catering Spice Ltd shall not be held liable for any direct, indirect, incidental, or consequential damages arising from the use or inability to use the App, including but not limited to errors in payroll calculation resulting from inaccurate data entry by the user.
          </p>

          <h2 className="text-2xl font-semibold mt-6 text-white/90">6. Changes to Terms</h2>
          <p>
            We reserve the right to modify these terms at any time. We will notify you of any changes by posting the new Terms and Conditions on this page. Your continued use of the App following any changes indicates your acceptance of the new terms.
          </p>

          <h2 className="text-2xl font-semibold mt-6 text-white/90">7. Contact Us</h2>
          <p>
            If you have any questions about these Terms, please contact us at:
          </p>
          <div className="bg-white/5 p-4 rounded mt-4 border border-white/10">
            <p><strong>Catering Spice Ltd</strong></p>
            <p>Email: cateringspiceltd@gmail.com</p>
            <p>Phone: +447368 374770</p>
            <p>Address: Brook Industrial Estate, Bullsbrook Rd, Hayes UB4 0JZ, UK</p>
          </div>
        </div>
      </div>
    </Layout>
  );
}

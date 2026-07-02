const fs = require('fs');

const emailReportLogic = `
  const handleEmailReport = async () => {
    setSendingEmail(true);
    setSendingProgress("Generating PDF...");
    try {
      const html2pdfModule = await import('html2pdf.js');
      const html2pdf = html2pdfModule.default || html2pdfModule;

      const reportDate = new Date().toLocaleDateString('en-GB');
      const reportTime = new Date().toLocaleString('en-GB');

      const period = \`\${attendanceFilters.from || "All Time"} - \${attendanceFilters.to || "Present"}\`;

      const isIndividualView = attendanceData?.staff?.id !== "all";
      const isFilterEmployeeView = typeof reportEmployeeFilter !== 'undefined' && reportEmployeeFilter !== "all";

      const selectedRestaurantName = typeof reportRestaurantFilter !== 'undefined' && reportRestaurantFilter !== "all" ? (restaurantsMap[reportRestaurantFilter] || reportRestaurantFilter) : "All Restaurants";
      const selectedEmployee = isIndividualView ? attendanceData.staff : (isFilterEmployeeView ? staff.find(s => s.id === reportEmployeeFilter) : null);
      
      const scopeLabel = isIndividualView 
        ? \`\${selectedEmployee.full_name} — \${selectedEmployee.restaurant_name || "Restaurant"}\`
        : (isFilterEmployeeView 
            ? \`\${selectedEmployee?.full_name || ""} — \${selectedRestaurantName}\` 
            : (typeof reportRestaurantFilter !== 'undefined' && reportRestaurantFilter !== "all" ? selectedRestaurantName : "All Staff"));
      const scope = scopeLabel;

      let tableRows = "";
      let thead = "";

      if (isIndividualView || isFilterEmployeeView) {
        thead = \`<tr style="background-color:#1e3a5f;"><th style="padding:10px 12px;color:white;font-size:12px;text-align:left;">Date</th><th style="padding:10px 12px;color:white;font-size:12px;text-align:left;">Clock In</th><th style="padding:10px 12px;color:white;font-size:12px;text-align:left;">Clock Out</th><th style="padding:10px 12px;color:white;font-size:12px;text-align:right;">Duration</th></tr>\`;
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
          tableRows += \`<tr style="background-color:\${bg};border-bottom:1px solid #e5e7eb;">
            <td style="padding:10px 12px;font-size:13px;color:#111827;">\${actualCin.toLocaleDateString('en-GB')}</td>
            <td style="padding:10px 12px;font-size:13px;color:#374151;">\${formatTime(calcCin)}</td>
            <td style="padding:10px 12px;font-size:13px;color:#374151;">\${rec.location_out === "System Auto-Logout" && (!rec.edit_reason || rec.edit_reason.trim() === "") ? '--' : formatTime(calcCout)} \${rec.location_out === "System Auto-Logout" && (!rec.edit_reason || rec.edit_reason.trim() === "") ? '<span style="font-size:10px;color:#9ca3af;">(Auto Logouted)</span>' : ''}</td>
            <td style="padding:10px 12px;font-size:13px;color:#374151;text-align:right;">\${rec.location_out === "System Auto-Logout" && (!rec.edit_reason || rec.edit_reason.trim() === "") ? '--' : \`\${hrs}h \${mins}m\`}</td>
          </tr>\`;
        });
        if (filteredRecs.length > 0) {
          const totalMins = filteredRecs.reduce((s, r) => s + calcSessionMinutes(r), 0);
          const tHrs = Math.floor(totalMins / 60);
          const tMins = totalMins % 60;
          const rate = Number(selectedEmployee?.hourly_rate || 0);
          const totalPay = rate > 0 ? (totalMins / 60) * rate : 0;
          tableRows += \`<tr style="background-color:#0b1a3d;">
            <td style="padding:12px 12px;font-size:13px;font-weight:700;color:white;" colspan="2">TOTAL HOURS</td>
            <td style="padding:12px 12px;font-size:14px;font-weight:800;color:#D0B079;text-align:right;" colspan="2">\${tHrs}h \${tMins}m</td>
          </tr>\`;
          if (rate > 0) {
            tableRows += \`<tr style="background-color:#1a2f5a;">
              <td style="padding:12px 12px;font-size:13px;font-weight:700;color:white;" colspan="2">TOTAL PAY (£\${rate}/hr)</td>
              <td style="padding:14px 12px;font-size:18px;font-weight:900;color:#D0B079;text-align:right;" colspan="2">£\${totalPay.toFixed(2)}</td>
            </tr>\`;
          }
        }
      } else {
        thead = \`<tr style="background-color:#1e3a5f;"><th style="padding:10px 12px;color:white;font-size:12px;text-align:left;">Date</th><th style="padding:10px 12px;color:white;font-size:12px;text-align:left;">Clock In</th><th style="padding:10px 12px;color:white;font-size:12px;text-align:left;">Clock Out</th><th style="padding:10px 12px;color:white;font-size:12px;text-align:right;">Duration</th></tr>\`;

        // Assuming summaryGroupedRecords exists in allstaff/index.jsx, or use simple grouping
        const grouped = typeof summaryGroupedRecords !== 'undefined' ? summaryGroupedRecords : [];
        grouped.forEach(sg => {
          const rate = Number(sg.hourly_rate || 0);
          const tHrs = Math.floor(sg.total_minutes / 60);
          const tMins = sg.total_minutes % 60;
          const totalPay = rate > 0 ? (sg.total_minutes / 60) * rate : 0;

          tableRows += \`<tr style="background-color:#1e3a5f;">
            <td style="padding:10px 12px;font-size:13px;font-weight:800;color:#D0B079;" colspan="3">\${sg.staff_name || "Unknown"} &nbsp;<span style="font-weight:400;font-size:11px;color:#9ca3af;">\${sg.designation || "Staff"} — \${sg.restaurant_name || ""}</span></td>
            <td style="padding:10px 12px;font-size:12px;color:#9ca3af;text-align:right;">\${sg.sessions?.length || 0} session(s)</td>
          </tr>\`;

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
            tableRows += \`<tr style="background-color:\${bg};border-bottom:1px solid #e5e7eb;">
              <td style="padding:8px 12px 8px 24px;font-size:12px;color:#374151;">\${actualCin.toLocaleDateString('en-GB')}</td>
              <td style="padding:8px 12px;font-size:12px;color:#374151;">\${formatTime(calcCin)}</td>
              <td style="padding:8px 12px;font-size:12px;color:#374151;">\${sess.location_out === "System Auto-Logout" && (!sess.edit_reason || sess.edit_reason.trim() === "") ? '--' : formatTime(calcCout)} \${sess.location_out === "System Auto-Logout" && (!sess.edit_reason || sess.edit_reason.trim() === "") ? '<span style="font-size:9px;color:#9ca3af;">(Auto Logouted)</span>' : ''}</td>
              <td style="padding:8px 12px;font-size:12px;color:#374151;text-align:right;">\${sess.location_out === "System Auto-Logout" && (!sess.edit_reason || sess.edit_reason.trim() === "") ? '--' : \`\${sHrs}h \${sMins}m\`}</td>
            </tr>\`;
          });

          tableRows += \`<tr style="background-color:#f0f4ff;border-top:1px solid #c7d2fe;border-bottom:3px solid #e5e7eb;">
            <td style="padding:10px 12px 10px 24px;font-size:12px;font-weight:700;color:#1e3a5f;" colspan="2">Subtotal — \${tHrs}h \${tMins}m\${rate > 0 ? \` &nbsp;|&nbsp; <span style="color:#b45309;">£\${totalPay.toFixed(2)}</span>\` : ""}</td>
            <td style="padding:10px 12px;font-size:12px;color:#374151;text-align:right;" colspan="2">\${sg.sessions?.length || 0} session(s)</td>
          </tr>
          <tr><td colspan="4" style="padding:4px;background-color:#e5e7eb;"></td></tr>\`;
        });
      }

      const reportHtml = \`<div style="font-family:Arial,Helvetica,sans-serif;background-color:#ffffff;padding:0;margin:0;color:#111827;">
        <div style="background-color:#0b1a3d;padding:28px 36px;">
          <table style="width:100%;border-collapse:collapse;"><tr>
            <td><div style="color:#D0B079;font-size:24px;font-weight:900;">DigitalBotSolutions</div><div style="color:#9ca3af;font-size:10px;letter-spacing:3px;text-transform:uppercase;margin-top:3px;">Staff Attendance Report</div></td>
            <td style="text-align:right;"><div style="color:white;font-size:18px;font-weight:800;">ATTENDANCE REPORT</div><div style="color:#9ca3af;font-size:11px;margin-top:3px;">Generated: \${reportDate}</div></td>
          </tr></table>
        </div>
        <div style="background-color:#f3f4f6;padding:16px 36px;border-bottom:2px solid #e5e7eb;">
          <table style="width:100%;border-collapse:collapse;"><tr>
            <td><div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Period</div><div style="font-size:13px;font-weight:700;color:#111827;margin-top:2px;">\${period}</div></td>
            <td><div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Scope</div><div style="font-size:13px;font-weight:700;color:#111827;margin-top:2px;">\${scope}</div></td>
            <td style="text-align:right;"><div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Generated</div><div style="font-size:12px;font-weight:600;color:#374151;margin-top:2px;">\${reportTime}</div></td>
          </tr></table>
        </div>
        <div style="padding:28px 36px;">
          <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;">
            <thead>\${thead}</thead>
            <tbody>\${tableRows || '<tr><td colspan="4" style="text-align:center;padding:20px;color:#6b7280;">No records found for selected period</td></tr>'}</tbody>
          </table>
        </div>
        <div style="background-color:#0b1a3d;padding:16px 36px;text-align:center;">
          <div style="color:#6b7280;font-size:11px;">DigitalBotSolutions - Confidential - DigitalBotSolutions Dashboard</div>
        </div>
      </div>\`;

      const opt = {
        margin: [0.3, 0.3, 0.3, 0.3],
        filename: \`DigitalBotSolutions_Attendance_\${new Date().getTime()}.pdf\`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, scrollX: 0, scrollY: 0, windowWidth: 1024, allowTaint: true },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
      };

      await new Promise(resolve => setTimeout(resolve, 50));
      const pdfDataUri = await html2pdf().from(reportHtml).set(opt).outputPdf('datauristring');

      setSendingProgress("Sending Email...");
      const sendEmailReportFunc = httpsCallable(functionsInstance, "sendEmailReport");
      const emailHtmlBody = \`<div style="font-family:Arial,sans-serif;color:#333;max-width:600px;margin:0 auto;">
          <div style="background:#0b1a3d;padding:30px;border-radius:12px 12px 0 0;text-align:center;">
            <h1 style="color:#D0B079;margin:0;font-size:24px;font-weight:800;">DigitalBotSolutions</h1>
            <p style="color:#9ca3af;margin:8px 0 0;font-size:13px;letter-spacing:2px;text-transform:uppercase;">Staff Attendance Report</p>
          </div>
          <div style="background:#f9fafb;padding:30px;border:1px solid #e5e7eb;">
            <p style="font-size:15px;color:#374151;">Dear Team,</p>
            <p style="font-size:15px;color:#374151;line-height:1.6;">Please find the attendance report attached as a PDF.</p>
            <div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin:20px 0;">
              <table style="width:100%;border-collapse:collapse;">
                <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Period</td><td style="padding:8px 0;font-weight:600;color:#111827;font-size:13px;">\${period}</td></tr>
                <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Scope</td><td style="padding:8px 0;font-weight:600;color:#111827;font-size:13px;">\${scope}</td></tr>
                <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Generated</td><td style="padding:8px 0;font-weight:600;color:#111827;font-size:13px;">\${reportTime}</td></tr>
              </table>
            </div>
          </div>
          <div style="background:#0b1a3d;padding:20px;border-radius:0 0 12px 12px;text-align:center;">
            <p style="color:#6b7280;font-size:12px;margin:0;">DigitalBotSolutions Dashboard - Confidential</p>
          </div>
        </div>\`;

      await Promise.all([
        sendEmailReportFunc({
          to: "rahulbadugu22@gmail.com",
          subject: \`DigitalBotSolutions Attendance Report - \${reportDate}\`,
          htmlBody: emailHtmlBody,
          attachmentUrl: pdfDataUri,
          attachmentName: opt.filename
        })
      ]);

      showPopup({ title: "Email Sent!", message: "Report emailed to rahulbadugu22@gmail.com", type: "success" });
    } catch (error) {
      console.error("Error emailing report:", error);
      showPopup({ title: "Error", message: \`Email failed: \${error.message}\`, type: "error" });
    } finally {
      setSendingEmail(false);
      setSendingProgress("");
    }
  };
`;

const stateVars = `
  const [sendingEmail, setSendingEmail] = useState(false);
  const [sendingProgress, setSendingProgress] = useState("");
`;

const emailButtonJSX = `
                  <button 
                    onClick={handleEmailReport} 
                    disabled={sendingEmail}
                    className="px-6 py-3 bg-white text-slate-900 font-bold rounded-xl text-xs flex items-center gap-2 hover:bg-slate-100 transition-all disabled:opacity-50"
                  >
                    {sendingEmail ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} 
                    {sendingEmail ? "Sending..." : "Email Report"}
                  </button>`;

function patchFrontendFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Add state variables
  if (!content.includes('sendingEmail')) {
    content = content.replace('const [loadingAttendance, setLoadingAttendance] = useState(false);', \`const [loadingAttendance, setLoadingAttendance] = useState(false);\${stateVars}\`);
  }

  // Add handleEmailReport function right before handlePrint
  if (!content.includes('handleEmailReport')) {
    content = content.replace('const handlePrint = () => {', \`\${emailReportLogic}\n  const handlePrint = () => {\`);
  }

  // Add Send icon to lucide-react if missing
  if (!content.includes('Send,')) {
    content = content.replace('Trash2', 'Trash2, Send');
  }

  // Add Email button right before the Print button
  if (!content.includes('handleEmailReport}') && !content.includes('Email Report')) {
    const printBtnMarker = '<Printer size={14} /> Print / Save as PDF';
    // Let's replace the whole Print button and prepend the email button
    const regex = new RegExp('<button[\\\\s\\\\S]*?onClick=\\{handlePrint\\}[\\\\s\\\\S]*?</button>');
    const match = content.match(regex);
    if (match) {
      content = content.replace(match[0], \`\${emailButtonJSX}\n                    \${match[0]}\`);
    }
  }

  fs.writeFileSync(filePath, content, 'utf8');
}

patchFrontendFile('src/pages/allstaff/index.jsx');
patchFrontendFile('src/pages/staff/index.jsx');
console.log('Frontend patched with handleEmailReport.');

const nodemailer = require("nodemailer");
const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

/**
 * Updates a user's email and/or password in Firebase Authentication.
 * Requires the caller to be authenticated.
 */
exports.updateUserCredentials = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Only authenticated users can call this function."
    );
  }

  const { uid, email, password } = data;

  if (!uid) {
    throw new functions.https.HttpsError("invalid-argument", "The 'uid' must be provided.");
  }

  try {
    const updatePayload = {};
    if (email) updatePayload.email = email;
    if (password) updatePayload.password = password;

    await admin.auth().updateUser(uid, updatePayload);

    return { success: true, message: "Successfully updated user credentials." };
  } catch (error) {
    console.error("Error updating user:", error);
    throw new functions.https.HttpsError("invalid-argument", error.message);
  }
});

/**
 * Deletes a user from Firebase Authentication.
 * Requires the caller to be authenticated.
 */
exports.deleteAuthUser = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Only authenticated users can call this function."
    );
  }

  const { uid } = data;

  if (!uid) {
    throw new functions.https.HttpsError("invalid-argument", "The 'uid' must be provided.");
  }

  try {
    await admin.auth().deleteUser(uid);
    return { success: true, message: "Successfully deleted user from Auth." };
  } catch (error) {
    console.error("Error deleting user from Auth:", error);
    // If user not found in Auth, that's fine - just return success
    if (error.code === 'auth/user-not-found') {
      return { success: true, message: "User was already removed from Auth." };
    }
    throw new functions.https.HttpsError("invalid-argument", error.message);
  }
});

/**
 * Restored: Sends a push notification via FCM.
 */
exports.sendpushnotification = functions.https.onCall(async (data, context) => {
  // if (!context.auth) {
  //   throw new functions.https.HttpsError("unauthenticated", "Only authenticated users can call this function.");
  // }

  const { fcm_token, title, body, priority, type, notificationId } = data;

  if (!fcm_token) {
    throw new functions.https.HttpsError("invalid-argument", "The 'fcm_token' must be provided.");
  }

  const message = {
    token: fcm_token,
    notification: {
      title: title || "Notification",
      body: body || "",
    },
    data: {
      notificationId: String(notificationId || ""),
      type: String(type || 'announcement'),
      priority: String(priority || "normal"),
    },
    android: {
      priority: "high",
      notification: {
        channelId: "high_importance_channel",
        sound: "default",
        defaultSound: true,
        priority: "max",
        visibility: "public"
      }
    },
    apns: {
      payload: {
        aps: {
          sound: "default",
          badge: 1
        }
      }
    }
  };

  try {
    const response = await admin.messaging().send(message);
    return { success: true, messageId: response };
  } catch (error) {
    console.error("Error sending push notification:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});


exports.sendEmailReport = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Unauthorized");

  const { to, subject, htmlBody, attachmentUrl, attachmentName } = data;
  if (!to || !subject || !htmlBody) {
    throw new functions.https.HttpsError("invalid-argument", "Missing required email fields");
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: functions.config().email?.user || process.env.EMAIL_USER || "your-email@gmail.com",
      pass: functions.config().email?.pass || process.env.EMAIL_PASS || "your-app-password"
    }
  });

  const mailOptions = {
    from: '"DigitalBotSolutions Dashboard" <noreply@digitalbotsolutions.com>',
    to: to,
    subject: subject,
    html: htmlBody,
    attachments: attachmentUrl ? [
      {
        filename: attachmentName || "Report.pdf",
        path: attachmentUrl
      }
    ] : []
  };

  try {
    await transporter.sendMail(mailOptions);
    return { success: true, message: "Email sent successfully" };
  } catch (error) {
    console.error("Error sending email:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});

/**
 * Scheduled function to detect dead phones (missing heartbeats) and auto-logout users.
 * Runs every 1 minutes.
 */
exports.autoLogoutInactiveSessions = functions.pubsub.schedule("every 1 minutes").onRun(async (context) => {
  const now = new Date();
  const cutoff = new Date(now.getTime() - 40 * 1000); // 40 seconds ago

  try {
    const snapshot = await admin.firestore().collection("attendance")
      .where("clock_out", "==", null)
      .get();

    const batch = admin.firestore().batch();
    let processed = 0;

    snapshot.forEach(doc => {
      const data = doc.data();
      let lastActiveDate = null;
      
      if (data.last_active) {
        lastActiveDate = data.last_active.toDate();
      } else if (data.clock_in) {
        lastActiveDate = data.clock_in.toDate();
      }

      // If they haven't sent a heartbeat in over 10 minutes
      if (lastActiveDate && lastActiveDate < cutoff) {
        const cinDate = data.clock_in.toDate();
        const diffMin = Math.max(1, Math.round((lastActiveDate.getTime() - cinDate.getTime()) / 60000));
        const safeDiffMin = Math.min(diffMin, 1440);

        batch.update(doc.ref, {
          clock_out: lastActiveDate, // Retroactively clock out at last known online time
          total_minutes: Math.max(0, safeDiffMin),
          location_out: "System Auto-Logout"
        });
        processed++;
      }
    });

    if (processed > 0) {
      await batch.commit();
      console.log(`Auto-logged out ${processed} inactive sessions.`);
    } else {
      console.log("No inactive sessions found.");
    }
  } catch (error) {
    console.error("Error in autoLogoutInactiveSessions:", error);
  }
  return null;
});

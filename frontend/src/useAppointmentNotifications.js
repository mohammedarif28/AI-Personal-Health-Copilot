import { useCallback, useEffect, useState } from "react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const REMINDER_LEAD_MS = 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 60 * 1000;
const STORAGE_KEY = "health-copilot-sent-appointment-reminders";

function getSentReminders() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveSentReminder(key) {
  const sent = getSentReminders();

  if (!sent.includes(key)) {
    sent.push(key);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sent));
  }
}

export function useAppointmentNotifications() {
  const [permission, setPermission] = useState(
    typeof Notification === "undefined"
      ? "unsupported"
      : Notification.permission
  );

  const [status, setStatus] = useState("Checking notifications...");

  const enableNotifications = useCallback(async () => {
    if (!("Notification" in window)) {
      setStatus("This browser does not support notifications.");
      return;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);

      if (result === "granted") {
        setStatus("Appointment notifications enabled.");
        new Notification("Health Copilot", {
          body: "Browser notifications are enabled.",
          tag: "health-copilot-test",
        });
      } else {
        setStatus("Allow notifications in your browser settings.");
      }
    } catch {
      setStatus("Could not enable browser notifications.");
    }
  }, []);

  useEffect(() => {
    if (!("Notification" in window)) return;

    let active = true;
    let checking = false;

    async function checkAppointments() {
      if (
        !active ||
        checking ||
 
        Notification.permission !== "granted"
      ) {
        return;
      }

      checking = true;

      try {
        const response = await fetch(`${API_BASE_URL}/appointments`);

        if (!response.ok) {
          throw new Error("Could not fetch appointments.");
        }

        const data = await response.json();
        const appointments = data.appointments || [];
        const now = Date.now();

        for (const appointment of appointments) {
          const appointmentTime = new Date(
            appointment.appointment_date
          ).getTime();

          if (!Number.isFinite(appointmentTime)) continue;

          const reminderTime = appointmentTime - REMINDER_LEAD_MS;

          if (now < reminderTime || now >= appointmentTime) {
            continue;
          }

          const key = `${appointment.id}:${appointment.appointment_date}`;

          if (getSentReminders().includes(key)) continue;

          try {
            new Notification("Upcoming doctor appointment", {
              body: `${appointment.doctor || "Doctor"} appointment is in 1 hour.`,
              tag: `appointment-${appointment.id}`,
            });

            saveSentReminder(key);
          } catch (error) {
            console.error(
              "Could not show appointment notification:",
              error
            );
          }
        }

        if (active) {
          setStatus("Appointment reminders are being checked.");
        }
      } catch (error) {
        console.error("Appointment reminder error:", error);

        if (active) {
          setStatus(
            "Could not check appointments. Is the backend running?"
          );
        }
      } finally {
        checking = false;
      }
    }

    checkAppointments();

    const intervalId = window.setInterval(
      checkAppointments,
      CHECK_INTERVAL_MS
    );

    const handleFocus = () => checkAppointments();

    window.addEventListener("focus", handleFocus);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  return {
    permission,
    status,
    enableNotifications,
  };
}
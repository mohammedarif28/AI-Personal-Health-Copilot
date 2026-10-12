    import { useEffect } from "react";

    const CHECK_INTERVAL = 15 * 1000;
    const NOTIFIED_KEY = "health-copilot-notified-medicines-v1";

    function parseSchedule(schedule) {
    if (!schedule) return [];

    // Accept schedules such as "08:00", "08:00 AM", or "8:00 PM".
    const matches = String(schedule).match(
        /\b(\d{1,2}):(\d{2})\s*(AM|PM)?\b/gi
    );

    if (!matches) return [];

    return matches
        .map((match) => {
        const parsed = match.match(
            /(\d{1,2}):(\d{2})\s*(AM|PM)?/i
        );

        let hour = Number(parsed[1]);
        const minute = Number(parsed[2]);
        const meridiem = parsed[3]?.toUpperCase();

        if (minute > 59 || hour > 23) return null;

        if (meridiem) {
            if (hour < 1 || hour > 12) return null;
            hour = hour % 12 + (meridiem === "PM" ? 12 : 0);
        }

        return { hour, minute };
        })
        .filter(Boolean);
    }

    function getNotified() {
    try {
        return JSON.parse(localStorage.getItem(NOTIFIED_KEY) || "{}");
    } catch {
        return {};
    }
    }

    export function useMedicineNotifications(reminders) {
    useEffect(() => {
        function checkMedicines() {
        if (!("Notification" in window)) return;
        if (Notification.permission !== "granted") return;

        const now = new Date();
        const today = [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, "0"),
            String(now.getDate()).padStart(2, "0"),
        ].join("-");

        const notified = getNotified();
        let changed = false;

        for (const item of reminders) {
            if (item.id == null) continue;

            const times = parseSchedule(item.schedule);

            for (const time of times) {
            if (
                time.hour !== now.getHours() ||
                time.minute !== now.getMinutes()
            ) {
                continue;
            }

            const key = `${today}-${item.id}-${time.hour}:${time.minute}`;

            if (notified[key]) continue;

            try {
                new Notification("Medicine reminder", {
                body: `Time to take ${item.medicine || "your medicine"}. Follow your prescribed instructions.`,
                tag: key,
                });

                notified[key] = true;
                changed = true;
            } catch (error) {
                console.error("Could not show medicine notification:", error);
            }
            }
        }

        if (changed) {
            try {
            localStorage.setItem(NOTIFIED_KEY, JSON.stringify(notified));
            } catch (error) {
            console.error("Could not save notification history:", error);
            }
        }
        }

        checkMedicines();
        const timer = window.setInterval(checkMedicines, CHECK_INTERVAL);

        return () => window.clearInterval(timer);
    }, [reminders]);
    }
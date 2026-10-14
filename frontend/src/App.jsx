import React, { useEffect, useRef, useState } from "react";
import "./App.css";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  Activity,
  Bot,
  CalendarDays,
  FileText,
  Image as ImageIcon,
  Mic,
  Plus,
  Send,
  ShieldCheck,
  Stethoscope,
  Trash2,
  User,
  Pencil,
  X,
  MessageSquare,
  LogOut,
  Clock,
  Eye,
  HeartPulse,
} from "lucide-react";

import Login from "./Login";
import { auth } from "./firebase";
import { useAppointmentNotifications } from "./useAppointmentNotifications";
import { useMedicineNotifications } from "./useMedicineNotifications";
const API_BASE =
import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const API_BASE_URL = "https://ai-personal-health-copilot-ty75.vercel.app";
const STORAGE_KEY = "health-copilot-conversations-v1";

const createId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const welcomeMessage = {
  role: "assistant",
  content:
    "Hello! I'm Health Copilot. Ask me a health question, or upload a medical report for a simple explanation. How can I help you today?",
};

function createConversation() {
  return {
    id: createId(),
    title: "New chat",
    messages: [{ ...welcomeMessage }],
    updatedAt: Date.now(),
  };
}

function loadSavedChats() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) return null;

    const parsed = JSON.parse(saved);

    if (!Array.isArray(parsed) || parsed.length === 0) {
      return null;
    }

    const validChats = parsed
      .filter(
        (chat) =>
          chat &&
          chat.id &&
          Array.isArray(chat.messages)
      )
      .map((chat) => ({
        id: String(chat.id),
        title: String(chat.title || "New chat"),
        messages: chat.messages.filter(
          (item) =>
            item &&
            ["user", "assistant"].includes(item.role) &&
            typeof item.content === "string"
        ),
        updatedAt: Number(chat.updatedAt) || Date.now(),
      }));

    return validChats.length ? validChats : null;
  } catch {
    return null;
  }
}

async function apiRequest(path, options = {}) {
  let response;

  try {
    response = await fetch(`${API_BASE}${path}`, options);
  } catch {
    throw new Error(
      "Cannot connect to the backend. Make sure FastAPI is running at http://127.0.0.1:8000."
    );
  }

  const responseText = await response.text();
  let data = {};

  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { message: responseText };
    }
  }

  if (!response.ok) {
    const detail =
      typeof data.detail === "string"
        ? data.detail
        : typeof data.message === "string"
          ? data.message
          : `Request failed with status ${response.status}.`;

    throw new Error(detail);
  }

  return data;
}

function getAnswer(data) {
  if (typeof data === "string") return data;

  const answer =
    data?.answer ??
    data?.response ??
    data?.result ??
    data?.message ??
    data?.detail;

  if (typeof answer === "string" && answer.trim()) {
    return answer;
  }

  return "The server responded, but no answer was found in its response. Please check the backend response format.";
}

export default function App() {
  const {
    permission,
    status,
    enableNotifications,
  } = useAppointmentNotifications();

  const [reminders, setReminders] = useState([]);

  useMedicineNotifications(reminders);

  // Declare activePage before any effect or function uses it.
  const [activePage, setActivePage] = useState("chat");

  const [medicalReports, setMedicalReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError, setReportsError] = useState("");

  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const [initialChats] = useState(
    () => loadSavedChats() || [createConversation()]
  );

  const [conversations, setConversations] = useState(initialChats);
  const [activeChatId, setActiveChatId] = useState(
    initialChats[0].id
  );

  const [language, setLanguage] = useState("Auto-detect");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  const [appointments, setAppointments] = useState([]);
  const [appointmentAlert, setAppointmentAlert] = useState("");

  const [doctor, setDoctor] = useState("");
  const [appointmentDate, setAppointmentDate] = useState("");
  const [appointmentNotes, setAppointmentNotes] = useState("");

  const [medicine, setMedicine] = useState("");
  const [schedule, setSchedule] = useState("");
  const [reminderNotes, setReminderNotes] = useState("");

  const [symptoms, setSymptoms] = useState("");
  const [recording, setRecording] = useState(false);

  const messagesEndRef = useRef(null);
  const reportInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const recorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);

  const activeChat =
    conversations.find((chat) => chat.id === activeChatId) ||
    conversations[0];

  const messages = activeChat?.messages || [];

  const getInitials = (name) => {
    if (!name) return "U";

    const parts = name.trim().split(/\s+/);

    if (parts.length >= 2) {
      return (
        parts[0][0] + parts[parts.length - 1][0]
      ).toUpperCase();
    }

    return parts[0].slice(0, 2).toUpperCase();
  };

  // Firebase authentication listener.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        setUser(firebaseUser);
        setAuthLoading(false);
      },
      () => {
        setUser(null);
        setAuthLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  // Save conversation history in browser storage.
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(conversations)
      );
    } catch {
      setError(
        "Chat history could not be saved. Your browser storage may be full."
      );
    }
  }, [conversations]);

  // Keep the latest message visible.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, loading, activeChatId]);

  // Stop the microphone if the component unmounts.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => {
        track.stop();
      });
    };
  }, []);

  // Load appointments and medicine reminders after login.
  useEffect(() => {
    if (!user) {
      setAppointments([]);
      setReminders([]);
      return;
    }

    loadAppointments();
    loadReminders();

    // These functions use the backend API.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Load saved medical reports when Health Timeline opens.
  async function loadMedicalReports() {
    setReportsLoading(true);
    setReportsError("");

    try {
      const data = await apiRequest("/medical-reports");

      setMedicalReports(
        Array.isArray(data)
          ? data
          : Array.isArray(data.reports)
            ? data.reports
            : []
      );
    } catch (err) {
      setReportsError(err.message);
    } finally {
      setReportsLoading(false);
    }
  }

  useEffect(() => {
    if (user && activePage === "timeline") {
      loadMedicalReports();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage, user]);

  // Check upcoming appointments in one place to avoid
  // duplicate browser notifications.
  useEffect(() => {
    if (!user) return;

    let active = true;

    async function checkAppointments() {
      try {
        const data = await apiRequest("/appointments");

        const list = Array.isArray(data)
          ? data
          : Array.isArray(data.appointments)
            ? data.appointments
            : [];

        const now = Date.now();

        for (const appointment of list) {
          if (
            !appointment.appointment_date ||
            appointment.id == null
          ) {
            continue;
          }

          const appointmentTime = new Date(
            appointment.appointment_date
          ).getTime();

          if (!Number.isFinite(appointmentTime)) continue;

          const minutesLeft = (appointmentTime - now) / 60000;

          // Notify between 0 and 10 minutes before the appointment.
          if (minutesLeft < 0 || minutesLeft > 10) continue;

          const key = `appointment-alert-${appointment.id}`;

          if (sessionStorage.getItem(key)) continue;

          const text =
            `Your appointment with ${appointment.doctor || "your doctor"
            } is in ${Math.ceil(minutesLeft)} minute(s).`;

          if (active) {
            setAppointmentAlert(text);
          }

          if (
            "Notification" in window &&
            Notification.permission === "granted"
          ) {
            new Notification("Health Copilot Reminder", {
              body: text,
            });
          }

          sessionStorage.setItem(key, "shown");
          break;
        }
      } catch (err) {
        console.error("Appointment reminder error:", err);
      }
    }

    checkAppointments();

    const timer = window.setInterval(
      checkAppointments,
      30000
    );

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [user]);

  function addMessage(
    role,
    content,
    chatId = activeChatId
  ) {
    setConversations((previous) =>
      previous.map((chat) => {
        if (chat.id !== chatId) return chat;

        let title = chat.title;

        if (role === "user" && title === "New chat") {
          title =
            content.length > 35
              ? content.slice(0, 35).trimEnd() + "…"
              : content;
        }

        return {
          ...chat,
          title,
          messages: [
            ...chat.messages,
            { role, content },
          ],
          updatedAt: Date.now(),
        };
      })
    );
  }

  function startNewChat() {
    const chat = createConversation();

    setConversations((previous) => [
      chat,
      ...previous,
    ]);

    setActiveChatId(chat.id);
    setActivePage("chat");
    setMessage("");
    setError("");
  }

  function openChat(chatId) {
    setActiveChatId(chatId);
    setActivePage("chat");
    setMessage("");
    setError("");
  }

  function deleteChat(chatId) {
    const chat = conversations.find(
      (item) => item.id === chatId
    );

    if (!chat) return;

    const confirmed = window.confirm(
      `Delete "${chat.title}"? This conversation will be permanently removed from this browser.`
    );

    if (!confirmed) return;

    const remaining = conversations.filter(
      (item) => item.id !== chatId
    );

    if (remaining.length === 0) {
      const newChat = createConversation();

      setConversations([newChat]);
      setActiveChatId(newChat.id);
    } else {
      setConversations(remaining);

      if (activeChatId === chatId) {
        setActiveChatId(remaining[0].id);
      }
    }

    setMessage("");
    setError("");
  }

  function renameChat(chatId) {
    const chat = conversations.find(
      (item) => item.id === chatId
    );

    if (!chat) return;

    const name = window.prompt(
      "Enter a name for this chat:",
      chat.title
    );

    if (name === null || !name.trim()) return;

    setConversations((previous) =>
      previous.map((item) =>
        item.id === chatId
          ? {
            ...item,
            title: name.trim().slice(0, 80),
            updatedAt: Date.now(),
          }
          : item
      )
    );
  }

  async function loadAppointments() {
    try {
      const data = await apiRequest("/appointments");

      setAppointments(
        Array.isArray(data)
          ? data
          : Array.isArray(data.appointments)
            ? data.appointments
            : []
      );
    } catch (err) {
      setAppointments([]);
      setError(err.message);
    }
  }

  async function loadReminders() {
    try {
      const data = await apiRequest("/reminders");

      setReminders(
        Array.isArray(data)
          ? data
          : Array.isArray(data.reminders)
            ? data.reminders
            : []
      );
    } catch (err) {
      setReminders([]);
      setError(err.message);
    }
  }

async function sendMessage(event) {
  event?.preventDefault();

  const question = message.trim();

  if (!question || loading) return;

  const chatId = activeChatId;

  // Collect previous messages before adding the new question.
  const chatHistory = (activeChat?.messages || [])
    .filter(
      (item) =>
        (item.role === "user" || item.role === "assistant") &&
        typeof item.content === "string" &&
        item.content.trim()
    )
    .map((item) => ({
      role: item.role,
      content: item.content,
    }));

  setError("");
  setMessage("");
  addMessage("user", question, chatId);
  setLoading(true);

  try {
    const data = await apiRequest("/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: question,
        language,
        report_context: "",
        chat_history: chatHistory,
      }),
    });

    addMessage(
      "assistant",
      getAnswer(data),
      chatId
    );
  } catch (err) {
    setError(err.message);

    addMessage(
      "assistant",
      "I couldn't generate a response. Please check the error message above and try again.",
      chatId
    );
  } finally {
    setLoading(false);
  }
}

  async function uploadFile(file, type) {
    if (!file || loading) return;

    const isReport = type === "report";
    const chatId = activeChatId;

    const question = isReport
      ? "Explain this medical report in simple words. Summarize important findings and values outside the provided reference ranges. Do not invent values that are not present in the report."
      : "Describe what is visible in this image in simple words. Do not make a diagnosis from the image.";

    setError("");
    setUploading(true);
    setLoading(true);

    addMessage(
      "user",
      `${isReport ? "Medical report" : "Medical image"} uploaded: ${file.name}`,
      chatId
    );

    try {
      const formData = new FormData();

      formData.append("file", file);
      formData.append("question", question);
      formData.append("language", language);

      const endpoint = isReport
        ? "/upload-report"
        : "/analyze-image";

      const data = await apiRequest(endpoint, {
        method: "POST",
        body: formData,
      });

      addMessage(
        "assistant",
        getAnswer(data),
        chatId
      );

      // Refresh saved reports if the timeline is currently open.
      if (isReport && activePage === "timeline") {
        await loadMedicalReports();
      }
    } catch (err) {
      setError(err.message);

      addMessage(
        "assistant",
        `I couldn't process this ${isReport ? "medical report" : "image"
        }. Check the error message above and the backend terminal.`,
        chatId
      );
    } finally {
      setLoading(false);
      setUploading(false);

      if (reportInputRef.current) {
        reportInputRef.current.value = "";
      }

      if (imageInputRef.current) {
        imageInputRef.current.value = "";
      }
    }
  }

  async function checkSymptoms(event) {
    event.preventDefault();

    const text = symptoms.trim();

    if (!text || loading) return;

    const chatId = activeChatId;

    setError("");
    addMessage("user", `My symptoms: ${text}`, chatId);
    setSymptoms("");
    setLoading(true);

    try {
      const data = await apiRequest("/symptoms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          symptoms: text,
          message: text,
          language,
        }),
      });

      addMessage(
        "assistant",
        getAnswer(data),
        chatId
      );

      setActivePage("chat");
    } catch (err) {
      setError(err.message);

      addMessage(
        "assistant",
        "I couldn't process your symptoms. Please check the error message and try again.",
        chatId
      );
    } finally {
      setLoading(false);
    }
  }

  async function startVoiceInput() {
    setError("");

    if (
      !navigator.mediaDevices?.getUserMedia ||
      !window.MediaRecorder
    ) {
      setError(
        "Voice recording is not supported by this browser."
      );
      return;
    }

    try {
      const stream =
        await navigator.mediaDevices.getUserMedia({
          audio: true,
        });

      streamRef.current = stream;
      audioChunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        setError(
          "An error occurred while recording audio."
        );

        stream.getTracks().forEach((track) => {
          track.stop();
        });

        streamRef.current = null;
        setRecording(false);
      };

      recorder.onstop = async () => {
        const blob = new Blob(
          audioChunksRef.current,
          {
            type: recorder.mimeType || "audio/webm",
          }
        );

        stream.getTracks().forEach((track) => {
          track.stop();
        });

        streamRef.current = null;
        setRecording(false);

        if (!blob.size) {
          setError(
            "No audio was recorded. Please try again."
          );
          return;
        }

        const extension = blob.type.includes("ogg")
          ? "ogg"
          : blob.type.includes("mp4")
            ? "mp4"
            : "webm";

        const audioFile = new File(
          [blob],
          `voice-input.${extension}`,
          { type: blob.type }
        );

        await submitVoice(audioFile);
      };

      recorder.start();
      setRecording(true);
    } catch {
      setError(
        "Microphone access was denied or is unavailable."
      );
    }
  }

  function stopVoiceInput() {
    if (
      recorderRef.current?.state === "recording"
    ) {
      recorderRef.current.stop();
    }

    setRecording(false);
  }

  async function submitVoice(audioFile) {
    if (loading) return;

    const chatId = activeChatId;

    setError("");
    setLoading(true);

    addMessage(
      "user",
      "Voice message submitted",
      chatId
    );

    try {
      const formData = new FormData();

      formData.append("file", audioFile);
      formData.append("language", language);

      const data = await apiRequest("/voice-chat", {
        method: "POST",
        body: formData,
      });

      const transcript =
        data.transcription || data.transcript || "";

      if (transcript) {
        addMessage(
          "assistant",
          `I heard: "${transcript}"`,
          chatId
        );
      }

      addMessage(
        "assistant",
        getAnswer(data),
        chatId
      );
    } catch (err) {
      setError(err.message);

      addMessage(
        "assistant",
        "I couldn't process the voice recording. Please check the backend and try again.",
        chatId
      );
    } finally {
      setLoading(false);
    }
  }

  async function addAppointment(event) {
    event.preventDefault();
    setError("");

    try {
      await apiRequest("/appointments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          doctor,
          appointment_date: appointmentDate,
          notes: appointmentNotes,
        }),
      });

      setDoctor("");
      setAppointmentDate("");
      setAppointmentNotes("");

      await loadAppointments();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteAppointment(id) {
    setError("");

    try {
      await apiRequest(`/appointments/${id}`, {
        method: "DELETE",
      });

      await loadAppointments();
    } catch (err) {
      setError(`Delete failed: ${err.message}`);
    }
  }

  async function addReminder(event) {
    event.preventDefault();
    setError("");

    try {
      await apiRequest("/reminders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          medicine,
          schedule,
          notes: reminderNotes,
        }),
      });

      setMedicine("");
      setSchedule("");
      setReminderNotes("");

      await loadReminders();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteReminder(id) {
    setError("");

    try {
      await apiRequest(`/reminders/${id}`, {
        method: "DELETE",
      });

      await loadReminders();
    } catch (err) {
      setError(err.message);
    }
  }

  async function viewMedicalReport(report) {
    setReportsError("");

    try {
      const details = await apiRequest(
        `/medical-reports/${report.id}`
      );

      setSelectedReport(details);
    } catch (err) {
      setReportsError(err.message);
    }
  }

  async function deleteMedicalReport(report) {
    const confirmed = window.confirm(
      "Delete this saved medical report?"
    );

    if (!confirmed) return;

    setReportsError("");

    try {
      await apiRequest(
        `/medical-reports/${report.id}`,
        { method: "DELETE" }
      );

      setMedicalReports((previous) =>
        previous.filter(
          (item) => item.id !== report.id
        )
      );

      setSelectedReport((previous) =>
        previous?.id === report.id ? null : previous
      );
    } catch (err) {
      setReportsError(err.message);
    }
  }

  async function handleSignOut() {
    setError("");
    setIsSigningOut(true);

    try {
      await signOut(auth);
      setShowSignOutModal(false);
    } catch {
      setError(
        "Unable to sign out. Please try again."
      );
    } finally {
      setIsSigningOut(false);
    }
  }

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setShowSignOutModal(false);
      }
    }

    if (showSignOutModal) {
      window.addEventListener(
        "keydown",
        handleKeyDown
      );

      return () =>
        window.removeEventListener(
          "keydown",
          handleKeyDown
        );
    }
  }, [showSignOutModal]);

  const pageDetails = {
    chat: {
      title: "Health Chat",
      subtitle:
        "Understand health information with greater clarity.",
    },
    symptoms: {
      title: "Symptom Checker",
      subtitle:
        "Describe how you feel to receive general health information.",
    },
    appointments: {
      title: "Appointments",
      subtitle:
        "Keep your healthcare appointments organized.",
    },
    reminders: {
      title: "Medicine Reminders",
      subtitle:
        "Keep a record of your medicine schedules.",
    },
    timeline: {
      title: "Health Timeline",
      subtitle:
        "View your saved medical reports and health history.",
    },
  };

  const currentPage =
    pageDetails[activePage] || pageDetails.chat;

  if (authLoading) {
    return (
      <div className="auth-loading">
        Checking login...
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <Activity size={27} />
          </div>

          <div>
            <h2>Health Copilot</h2>
            <p>Personal health assistant</p>
          </div>
        </div>

        <div className="sidebar-label">
          WORKSPACE
        </div>

        <nav className="sidebar-nav">
          <button
            className={`nav-item ${activePage === "chat" ? "active" : ""
              }`}
            onClick={() => setActivePage("chat")}
          >
            <HeartPulse size={20} />
            Health Chat
          </button>

          <button
            className={`nav-item ${activePage === "symptoms" ? "active" : ""
              }`}
            onClick={() => setActivePage("symptoms")}
          >
            <Stethoscope size={20} />
            Symptoms
          </button>

          <button
            className={`nav-item ${activePage === "appointments"
              ? "active"
              : ""
              }`}
            onClick={() =>
              setActivePage("appointments")
            }
          >
            <CalendarDays size={20} />
            Appointments
          </button>

          <button
            className={`nav-item ${activePage === "reminders" ? "active" : ""
              }`}
            onClick={() => setActivePage("reminders")}
          >
            <Activity size={20} />
            Medicine Reminders
          </button>

          <button
            className={`nav-item ${activePage === "timeline" ? "active" : ""
              }`}
            onClick={() => setActivePage("timeline")}
          >
            <CalendarDays size={20} />
            Health Timeline
          </button>
        </nav>

        <div className="history-heading">
          <span>RECENT CHATS</span>

          <button
            type="button"
            className="history-add"
            onClick={startNewChat}
            title="Start a new chat"
            aria-label="Start a new chat"
          >
            <Plus size={18} />
          </button>
        </div>

        <div className="chat-history-list">
          {conversations.map((chat) => (
            <div
              key={chat.id}
              className={`history-item ${activeChatId === chat.id &&
                activePage === "chat"
                ? "selected"
                : ""
                }`}
            >
              <button
                className="history-open"
                onClick={() => openChat(chat.id)}
                title={chat.title}
              >
                <MessageSquare size={16} />
                <span>{chat.title}</span>
              </button>

              <div className="history-actions">
                <button
                  type="button"
                  onClick={() => renameChat(chat.id)}
                  title="Rename chat"
                  aria-label={`Rename ${chat.title}`}
                >
                  <Pencil size={14} />
                </button>

                <button
                  type="button"
                  onClick={() => deleteChat(chat.id)}
                  title="Delete chat"
                  aria-label={`Delete ${chat.title}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-notice">
            <div className="notice-header">
              <ShieldCheck size={18} />
              <strong>Your health matters</strong>
            </div>

            <p>
              Use this assistant for general
              information, not as a substitute for
              professional medical care.
            </p>
          </div>

          <div className="profile-card">
            <div className="profile-avatar-wrap">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={
                    user.displayName ||
                    user.email?.split("@")[0] ||
                    "User"
                  }
                  className="profile-avatar-img"
                />
              ) : (
                <div className="profile-avatar">
                  {getInitials(
                    user.displayName ||
                    user.email?.split("@")[0] ||
                    "User"
                  )}
                </div>
              )}

              <span
                className="profile-status-indicator"
                title="Online"
              />
            </div>

            <div className="profile-details">
              <div className="profile-name-row">
                <span
                  className="profile-name"
                  title={
                    user.displayName ||
                    user.email?.split("@")[0] ||
                    "User"
                  }
                >
                  {user.displayName ||
                    user.email?.split("@")[0] ||
                    "User"}
                </span>
              </div>

              <div className="profile-meta-row">
                <span className="profile-badge">
                  Free
                </span>

                {user.email && (
                  <span
                    className="profile-email"
                    title={user.email}
                  >
                    {user.email}
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              className="profile-logout-btn"
              onClick={() =>
                setShowSignOutModal(true)
              }
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="page-header">
          <div>
            <h1>{currentPage.title}</h1>
            <p>{currentPage.subtitle}</p>
          </div>

          <label className="language-control">
            <span>Response language</span>

            <select
              value={language}
              onChange={(event) =>
                setLanguage(event.target.value)
              }
            >
              <option>Auto-detect</option>
              <option>English</option>
              <option>Tamil</option>
              <option>Hindi</option>
              <option>Telugu</option>
              <option>Malayalam</option>
              <option>Kannada</option>
            </select>
          </label>

          <button
            type="button"
            className="primary-button"
            onClick={enableNotifications}
            disabled={
              permission === "granted" ||
              permission === "unsupported"
            }
          >
            {permission === "granted"
              ? "Notifications enabled"
              : "Enable notifications"}
          </button>
        </header>

        <p role="status" className="muted-text">
          {status}
        </p>

        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>

            <button
              type="button"
              onClick={() => setError("")}
              aria-label="Dismiss error"
            >
              <X size={18} />
            </button>
          </div>
        )}

        {appointmentAlert && (
          <div
            role="alert"
            className="appointment-alert"
          >
            🔔 {appointmentAlert}
          </div>
        )}

        {activePage === "chat" && (
          <section className="chat-panel">
            <div className="chat-messages">
              {messages.map((item, index) => (
                <div
                  className={`message-row ${item.role === "user"
                    ? "user-message"
                    : "assistant-message"
                    }`}
                  key={`${activeChatId}-${index}`}
                >
                  <div className="message-avatar">
                    {item.role === "user" ? (
                      <User size={20} />
                    ) : (
                      <HeartPulse size={20} />
                    )}
                  </div>

                  <div className="message-content">
                    <strong>
                      {item.role === "user"
                        ? "You"
                        : "Health Copilot"}
                    </strong>

                    <div
                      className={
                        item.role === "assistant"
                          ? "message-text ai-response-box"
                          : "message-text user-response-box"
                      }
                    >
                      {item.role === "assistant" ? (
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                        >
                          {item.content
                            .replace(/\\[ \t]*\n/g, "\n")
                            .trim()}
                        </ReactMarkdown>
                      ) : (
                        item.content
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {loading && (
                <div className="message-row assistant-message">
                  <div className="message-avatar">
                    <HeartPulse size={20} />
                  </div>

                  <div className="message-content">
                    <strong>Health Copilot</strong>
                    <p>Thinking...</p>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            <div className="chat-composer">
              <div className="composer-tools">
                <button
                  type="button"
                  className="tool-button"
                  onClick={() =>
                    reportInputRef.current?.click()
                  }
                  disabled={loading || uploading}
                >
                  <FileText size={18} />
                  Report
                </button>

                <button
                  type="button"
                  className="tool-button"
                  onClick={() =>
                    imageInputRef.current?.click()
                  }
                  disabled={loading || uploading}
                >
                  <ImageIcon size={18} />
                  Medical image
                </button>

                <button
                  type="button"
                  className={`tool-button ${recording ? "recording" : ""
                    }`}
                  onClick={
                    recording
                      ? stopVoiceInput
                      : startVoiceInput
                  }
                  disabled={loading}
                >
                  <Mic size={18} />
                  {recording
                    ? "Stop recording"
                    : "Voice input"}
                </button>

                <button
                  type="button"
                  className="tool-button clear-button"
                  onClick={startNewChat}
                  disabled={loading}
                >
                  <Plus size={18} />
                  New chat
                </button>
              </div>

              <input
                ref={reportInputRef}
                type="file"
                accept=".pdf,.txt,.md"
                hidden
                onChange={(event) =>
                  uploadFile(
                    event.target.files?.[0],
                    "report"
                  )
                }
              />

              <input
                ref={imageInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={(event) =>
                  uploadFile(
                    event.target.files?.[0],
                    "image"
                  )
                }
              />

              <form
                className="message-form"
                onSubmit={sendMessage}
              >
                <textarea
                  value={message}
                  onChange={(event) =>
                    setMessage(event.target.value)
                  }
                  placeholder="Ask a health question..."
                  rows={2}
                  disabled={loading}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      !event.shiftKey &&
                      !event.nativeEvent.isComposing
                    ) {
                      event.preventDefault();
                      sendMessage();
                    }
                  }}
                />

                <button
                  type="submit"
                  className="send-button"
                  disabled={
                    !message.trim() || loading
                  }
                  aria-label="Send message"
                >
                  <Send size={21} />
                </button>
              </form>

              <p className="chat-disclaimer">
                For general information only. Seek
                professional medical advice when needed.
                For emergencies, contact local emergency
                services.
              </p>
            </div>
          </section>
        )}

        {activePage === "symptoms" && (
          <section className="content-panel">
            <div className="section-heading">
              <Stethoscope size={24} />
              <h2>Describe your symptoms</h2>
            </div>

            <p>
              Tell Health Copilot what you are
              experiencing, when it started, and how
              severe it feels.
            </p>

            <form
              onSubmit={checkSymptoms}
              className="form-stack"
            >
              <label htmlFor="symptoms">
                Your symptoms
              </label>

              <textarea
                id="symptoms"
                value={symptoms}
                onChange={(event) =>
                  setSymptoms(event.target.value)
                }
                placeholder="Describe what you are experiencing..."
                rows={5}
                required
              />

              <button
                type="submit"
                className="primary-button"
                disabled={
                  loading || !symptoms.trim()
                }
              >
                Check symptoms
              </button>
            </form>

            <p className="muted-text">
              This tool provides general information,
              not a medical diagnosis.
            </p>
          </section>
        )}

        {activePage === "appointments" && (
          <section className="content-panel">
            <div className="section-heading">
              <CalendarDays size={24} />
              <h2>Manage appointments</h2>
            </div>

            <form
              onSubmit={addAppointment}
              className="form-stack"
            >
              <label htmlFor="doctor">
                Doctor or clinic
              </label>

              <input
                id="doctor"
                value={doctor}
                onChange={(event) =>
                  setDoctor(event.target.value)
                }
                placeholder="Doctor or clinic name"
                required
              />

              <label htmlFor="appointment-date">
                Date and time
              </label>

              <input
                id="appointment-date"
                type="datetime-local"
                value={appointmentDate}
                onChange={(event) =>
                  setAppointmentDate(event.target.value)
                }
                required
              />

              <label htmlFor="appointment-notes">
                Notes (optional)
              </label>

              <textarea
                id="appointment-notes"
                value={appointmentNotes}
                onChange={(event) =>
                  setAppointmentNotes(event.target.value)
                }
                placeholder="Reason for appointment or other notes"
                rows={3}
              />

              <button
                type="submit"
                className="primary-button"
              >
                Save appointment
              </button>
            </form>

            <h3 className="list-heading">
              Saved appointments
            </h3>

            {appointments.length === 0 ? (
              <p className="muted-text">
                No appointments saved yet.
              </p>
            ) : (
              <div className="saved-list">
                {appointments.map((item, index) => (
                  <div
                    className="saved-item"
                    key={item.id ?? index}
                  >
                    <div>
                      <strong>
                        {item.doctor ||
                          item.clinic ||
                          "Appointment"}
                      </strong>

                      <p>
                        {item.appointment_date ||
                          item.date ||
                          ""}
                      </p>

                      {item.notes && (
                        <p>{item.notes}</p>
                      )}
                    </div>

                    {item.id != null && (
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() =>
                          deleteAppointment(item.id)
                        }
                        aria-label="Delete appointment"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {activePage === "reminders" && (
          <section className="content-panel">
            <div className="section-heading">
              <Clock size={24} />
              <h2>Medicine Reminders</h2>
            </div>

            <form
              onSubmit={addReminder}
              className="form-stack"
            >
              <label htmlFor="medicine">
                Medicine name
              </label>

              <input
                id="medicine"
                value={medicine}
                onChange={(event) =>
                  setMedicine(event.target.value)
                }
                placeholder="Enter medicine name"
                required
              />

              <label htmlFor="schedule">
                Schedule
              </label>

              <input
                id="schedule"
                value={schedule}
                onChange={(event) =>
                  setSchedule(event.target.value)
                }
                placeholder="For example: 8:00 AM after breakfast"
                required
              />

              <label htmlFor="reminder-notes">
                Notes (optional)
              </label>

              <textarea
                id="reminder-notes"
                value={reminderNotes}
                onChange={(event) =>
                  setReminderNotes(event.target.value)
                }
                placeholder="Additional instructions"
                rows={3}
              />

              <button
                type="submit"
                className="primary-button"
              >
                Save reminder
              </button>
            </form>

            <h3 className="list-heading">
              Saved reminders
            </h3>

            {reminders.length === 0 ? (
              <p className="muted-text">
                No medicine reminders saved yet.
              </p>
            ) : (
              <div className="saved-list">
                {reminders.map((item, index) => (
                  <div
                    className="saved-item"
                    key={item.id ?? index}
                  >
                    <div>
                      <strong>
                        {item.medicine || "Medicine"}
                      </strong>

                      <p>{item.schedule || ""}</p>

                      {item.notes && (
                        <p>{item.notes}</p>
                      )}
                    </div>

                    {item.id != null && (
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() =>
                          deleteReminder(item.id)
                        }
                        aria-label="Delete medicine reminder"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}


        {/* HEALTH TIMELINE */}
        {activePage === "timeline" && (
          <section className="health-timeline">
            <div className="timeline-header">
              <div className="timeline-title">
                <Clock size={28} strokeWidth={2} />
                <h2>Health Timeline</h2>
              </div>

              <button
                type="button"
                className="timeline-refresh"
                onClick={loadMedicalReports}
                disabled={reportsLoading}
              >
                {reportsLoading ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            <p className="timeline-description">
              Your previously uploaded medical reports and AI-generated
              explanations appear here, newest first.
            </p>

            {reportsLoading && (
              <div className="timeline-status">
                Loading your medical reports...
              </div>
            )}

            {reportsError && (
              <div className="timeline-error">
                {reportsError}
              </div>
            )}

            {!reportsLoading &&
              !reportsError &&
              medicalReports.length === 0 && (
                <div className="timeline-empty">
                  <FileText size={42} />
                  <h3>No medical reports yet</h3>
                  <p>
                    Upload a medical report to start building your health
                    timeline.
                  </p>
                </div>
              )}

            <div className="timeline-list">
              {medicalReports.map((report) => (
                <article className="timeline-card" key={report.id}>
                  <div className="timeline-card-icon">
                    <FileText size={23} />
                  </div>

                  <div className="timeline-card-content">
                    <h3>{report.filename || report.file_name || "Medical report"}</h3>

                    <span className="timeline-document-type">
                      {report.document_type || "Medical report"}
                    </span>

                    <p className="timeline-upload-date">
                      Uploaded:{" "}
                      {report.uploaded_at
                        ? new Date(
                          report.uploaded_at
                        ).toLocaleString()
                        : "Date unavailable"}
                    </p>

                    <div className="timeline-actions">
                      <button
                        type="button"
                        className="timeline-view-button"
                        onClick={async () => {
                          try {
                            const response = await fetch(
                              `${API_BASE}/medical-reports/${report.id}`
                            );

                            if (!response.ok) {
                              throw new Error("Unable to load this report.");
                            }

                            const data = await response.json();
                            setSelectedReport(data);
                          } catch (error) {
                            setReportsError(error.message);
                          }
                        }}
                      >
                        <Eye size={17} />
                        View report
                      </button>

                      <button
                        type="button"
                        className="timeline-delete-button"
                        onClick={async () => {
                          if (
                            !window.confirm(
                              "Are you sure you want to delete this report?"
                            )
                          ) {
                            return;
                          }

                          try {
                            const response = await fetch(
                              `${API_BASE}/medical-reports/${report.id}`,
                              { method: "DELETE" }
                            );

                            if (!response.ok) {
                              throw new Error("Unable to delete this report.");
                            }

                            setMedicalReports((previous) =>
                              previous.filter((item) => item.id !== report.id)
                            );

                            if (selectedReport?.id === report.id) {
                              setSelectedReport(null);
                            }
                          } catch (error) {
                            setReportsError(error.message);
                          }
                        }}
                      >
                        <Trash2 size={17} />
                        Delete
                      </button>
                    </div>

                    {selectedReport?.id === report.id && (
                      <div className="timeline-report-details">
                        <div className="timeline-details-heading">
                          <h4>Report details</h4>

                          <button
                            type="button"
                            className="timeline-close-button"
                            onClick={() => setSelectedReport(null)}
                          >
                            Close details
                          </button>
                        </div>

                        <h4>AI-generated summary</h4>
                        <div className="timeline-summary">
                          {selectedReport.summary ||
                            "No summary is available for this report."}
                        </div>

                        <h4>Extracted report text</h4>
                        <pre className="timeline-extracted-text">
                          {selectedReport.extracted_text ||
                            "No extracted text is available."}
                        </pre>
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>

      {showSignOutModal && (
        <div
          className="signout-modal-backdrop"
          onClick={() =>
            !isSigningOut &&
            setShowSignOutModal(false)
          }
          role="dialog"
          aria-modal="true"
          aria-labelledby="signout-dialog-title"
        >
          <div
            className="signout-modal-card"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <button
              type="button"
              className="signout-modal-close"
              onClick={() =>
                setShowSignOutModal(false)
              }
              disabled={isSigningOut}
              aria-label="Close dialog"
            >
              <X size={18} />
            </button>

            <div className="signout-modal-icon">
              <LogOut size={26} />
            </div>

            <h3 id="signout-dialog-title">
              Sign out of Health Copilot?
            </h3>

            <p>
              Are you sure you want to sign out,{" "}
              <strong>
                {user.displayName ||
                  user.email?.split("@")[0] ||
                  "User"}
              </strong>
              ? Your conversations saved in this browser
              will remain there.
            </p>

            <div className="signout-modal-actions">
              <button
                type="button"
                className="signout-btn-secondary"
                onClick={() =>
                  setShowSignOutModal(false)
                }
                disabled={isSigningOut}
              >
                Cancel
              </button>

              <button
                type="button"
                className="signout-btn-danger"
                onClick={handleSignOut}
                disabled={isSigningOut}
              >
                {isSigningOut ? (
                  <span>Signing out...</span>
                ) : (
                  <>
                    <LogOut size={16} />
                    <span>Sign Out</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
